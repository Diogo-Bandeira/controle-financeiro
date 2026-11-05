// Uma chamada ao Gemini por mensagem (texto, áudio ou foto) com saída JSON estruturada (responseSchema).
// REST direto (fetch) para ler o status HTTP: 429 diário x por minuto, e 1 nova tentativa só em 5xx.

import type { CartaoBot, SubcategoriaBot } from "./tipos.ts";

export type TipoErroIA = "limite_diario" | "limite_minuto" | "falha";

export class ErroIA extends Error {
  constructor(public tipo: TipoErroIA, public status: number | null) {
    super(`IA: ${tipo}${status ? ` (${status})` : ""}`);
  }
}

export interface EntradaIA {
  texto: string | null;
  midia: { mimeType: string; base64: string } | null;
  hoje: string;
  cartoes: CartaoBot[];
  subcategorias: SubcategoriaBot[];
}

export type InterpretarComIA = (entrada: EntradaIA) => Promise<unknown>;

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const anulavel = (schema: Record<string, unknown>) => ({ ...schema, nullable: true });
const textoOuEnum = (valores: string[]) => (valores.length ? { type: "STRING", enum: valores } : { type: "STRING" });

export function montarSchema(cartoes: CartaoBot[], subcategorias: SubcategoriaBot[]) {
  return {
    type: "OBJECT",
    properties: {
      intencao: { type: "STRING", enum: ["lancamento", "consulta", "ajuda", "outro"] },
      lancamentos: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            descricao: { type: "STRING" },
            valor: { type: "NUMBER" },
            valor_e_parcela: { type: "BOOLEAN" },
            parcelas: { type: "INTEGER" },
            data: { type: "STRING", description: "YYYY-MM-DD" },
            tipo: { type: "STRING", enum: ["entrada", "conta_fixa", "cartao", "variavel"] },
            cartao: anulavel(textoOuEnum(cartoes.map((c) => c.nome))),
            subcategoria: anulavel(textoOuEnum(subcategorias.map((s) => s.slug))),
            reembolso: { type: "BOOLEAN" },
          },
          required: ["descricao", "valor", "valor_e_parcela", "parcelas", "data", "tipo", "cartao", "subcategoria", "reembolso"],
        },
      },
      consulta: anulavel({
        type: "OBJECT",
        properties: {
          tipo: anulavel({ type: "STRING", enum: ["gasto_subcategoria", "limites", "fatura", "resumo_mes"] }),
          subcategoria: anulavel(textoOuEnum(subcategorias.map((s) => s.slug))),
          cartao: anulavel(textoOuEnum(cartoes.map((c) => c.nome))),
          mes: anulavel({ type: "INTEGER", description: "1 a 12" }),
          ano: anulavel({ type: "INTEGER" }),
        },
      }),
      duvida: anulavel({ type: "STRING" }),
    },
    required: ["intencao", "lancamentos", "consulta", "duvida"],
  };
}

/** Instruções + contexto mínimo: data de hoje, nomes dos cartões e subcategorias. Nada de valores ou histórico. */
export function montarInstrucoes(hoje: string, cartoes: CartaoBot[], subcategorias: SubcategoriaBot[]): string {
  const [a, m, d] = hoje.split("-").map(Number);
  const diaSemana = DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
  const listaCartoes = cartoes.length ? cartoes.map((c) => `- ${c.nome}`).join("\n") : "(nenhum)";
  const listaSubs = subcategorias.map((s) => `- ${s.slug}: ${s.label}`).join("\n");
  return `Você interpreta mensagens (texto, áudio ou foto de comprovante) enviadas a um bot de controle financeiro familiar brasileiro.
Hoje é ${hoje} (${diaSemana}), fuso America/Sao_Paulo.

Cartões de crédito ativos (use o nome exatamente como na lista, ou null):
${listaCartoes}

Subcategorias de gasto (use o slug exatamente como na lista, ou null):
${listaSubs}

Regras:
- intencao "lancamento": a mensagem registra gasto(s) ou entrada(s). Pode haver mais de um ("mercado 130 e farmácia 45 no nubank" = 2 lançamentos; o cartão vale para os dois).
- intencao "consulta": pergunta sobre gastos, limites, fatura ou resumo. Preencha consulta. mes de 1 a 12 (null = mês atual).
- intencao "ajuda": pede instruções. "outro": nada disso.
- descricao: curta, como a pessoa escreveria (ex.: "Mercado", "Uber", "Farmácia"); para comprovante, o nome do estabelecimento.
- valor em reais (número). Se a pessoa disser o valor de cada parcela ("3x de 200"), valor = 200 e valor_e_parcela = true; se disser o total ("600 em 3x"), valor = 600 e valor_e_parcela = false.
- parcelas: 1 se à vista. Parcelado só existe no cartão.
- data: YYYY-MM-DD. Sem data na mensagem = hoje. "ontem" = dia anterior. Comprovante: a data impressa nele.
- tipo: "entrada" para dinheiro recebido (salário, reembolso, "recebi"); "cartao" quando citar cartão de crédito ou um cartão da lista; "conta_fixa" para contas e boletos (luz, água, internet, aluguel); "variavel" para pix, débito, dinheiro ou quando não houver forma de pagamento.
- reembolso: true só para entrada que devolve uma compra feita para outra pessoa.
- subcategoria: a que melhor descreve o gasto; null se não tiver certeza ou se for entrada.
- Não invente valores. Se faltar o valor ou a mensagem estiver confusa, use intencao "outro" e explique em duvida (curto, em português).`;
}

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ESPERA_5XX_MS = 1500;

/** 429 com cota "PerMinute" (e sem "PerDay") = limite por minuto; qualquer outro 429 conta como limite diário. */
export function classificar429(corpo: string): TipoErroIA {
  return /PerMinute/i.test(corpo) && !/PerDay/i.test(corpo) ? "limite_minuto" : "limite_diario";
}

export function criarInterpretador(apiKey: string, modelo: string, fetchFn: typeof fetch = fetch, esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))): InterpretarComIA {
  return async ({ texto, midia, hoje, cartoes, subcategorias }) => {
    const partes = [
      ...(texto ? [{ text: texto }] : []),
      ...(midia ? [{ inlineData: { mimeType: midia.mimeType, data: midia.base64 } }] : []),
    ];
    const corpo = JSON.stringify({
      systemInstruction: { parts: [{ text: montarInstrucoes(hoje, cartoes, subcategorias) }] },
      contents: [{ role: "user", parts: partes }],
      generationConfig: { responseMimeType: "application/json", responseSchema: montarSchema(cartoes, subcategorias), temperature: 0 },
    });

    const chamar = () =>
      fetchFn(`${URL_BASE}/${encodeURIComponent(modelo)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: corpo,
      });

    let resposta: Response;
    try {
      resposta = await chamar();
      if (resposta.status >= 500) {
        await esperar(ESPERA_5XX_MS);
        resposta = await chamar();
      }
    } catch {
      throw new ErroIA("falha", null);
    }

    if (resposta.status === 429) throw new ErroIA(classificar429(await resposta.text()), 429);
    if (!resposta.ok) throw new ErroIA("falha", resposta.status);

    const json = await resposta.json().catch(() => null);
    const textoResposta = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    try {
      return JSON.parse(textoResposta);
    } catch {
      throw new ErroIA("falha", resposta.status);
    }
  };
}

/** Base64 de bytes (sem estourar a pilha em arquivos de alguns MB). */
export function paraBase64(bytes: Uint8Array): string {
  const partes: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) partes.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  return btoa(partes.join(""));
}
