// Do rascunho ao que é gravado, com as mesmas regras do site: cartão → competência = fatura (calcularFatura);
// parcelado → gerarParcelas a partir da fatura da compra; demais → mês da data; data futura → pendente.

import { calcularFatura, cartaoConfigurado, gerarParcelas, parseISODate } from "../_shared/dominio/fatura.ts";
import { round2, sumMoney } from "../_shared/dominio/money.ts";
import { sugerir, type LancamentoHistorico } from "../_shared/dominio/sugestao.ts";
import { mesDe } from "./datas.ts";
import { escaparHtml } from "./html.ts";
import { CATEGORIAS_VALIDAS, type CartaoBot, type Categoria, type LinhaLancamento, type LinhaParcelamento, type Rascunho } from "./tipos.ts";

export type CampoFaltante = "tipo" | "cartao" | "subcategoria";

/** Preenche pelo histórico o que faltou (mesma sugestão do formulário do site) e, com um cartão só, usa ele. */
export function completarPeloHistorico(r: Rascunho, historico: LancamentoHistorico[], cartoes: CartaoBot[]): Rascunho {
  const s = sugerir(r.descricao, historico);
  const semCartoes: Categoria | null = cartoes.length === 0 ? "variavel" : null;
  const tipo = r.tipo ?? CATEGORIAS_VALIDAS.find((c) => c === s?.categoria) ?? semCartoes;
  const cartaoSugerido = cartoes.find((c) => c.id === s?.cartaoId)?.id ?? null;
  const unico = cartoes.length === 1 ? cartoes[0].id : null;
  return {
    ...r,
    tipo,
    cartaoId: tipo === "cartao" ? r.cartaoId ?? cartaoSugerido ?? unico : null,
    subcategoria: tipo === "entrada" ? null : r.subcategoria ?? s?.subcategoria ?? null,
  };
}

/** Próxima pergunta necessária, na ordem tipo → cartão → subcategoria. null = completo. */
export function campoFaltante(r: Rascunho): CampoFaltante | null {
  if (!r.tipo) return "tipo";
  if (r.tipo === "cartao" && !r.cartaoId) return "cartao";
  if (r.tipo !== "entrada" && !r.subcategoria) return "subcategoria";
  return null;
}

export interface ContextoMontagem {
  hoje: string;
  cartoes: CartaoBot[];
  responsavel: string | null;
}

export type Gravacao =
  | { tipo: "simples"; lancamento: LinhaLancamento }
  | { tipo: "parcelado"; parcelamento: LinhaParcelamento; lancamentos: Omit<LinhaLancamento, "categoria" | "reembolso" | "origem">[] }
  | { tipo: "erro"; mensagem: string };

export const totalDoRascunho = (r: Rascunho): number => (r.valorEParcela ? round2(r.valor * r.parcelas) : r.valor);

/** Monta a gravação de um rascunho completo (ver campoFaltante). */
export function montarGravacao(r: Rascunho, ctx: ContextoMontagem): Gravacao {
  const tipo = r.tipo as Categoria;
  const cartao = tipo === "cartao" ? ctx.cartoes.find((c) => c.id === r.cartaoId) : null;
  if (tipo === "cartao" && !cartao) return { tipo: "erro", mensagem: "Cartão não encontrado." };
  const nomeCartao = escaparHtml(cartao?.nome ?? "");
  if (cartao && !cartaoConfigurado(cartao)) {
    return { tipo: "erro", mensagem: `Configure o fechamento e o vencimento do cartão <b>${nomeCartao}</b> no site para eu lançar nele.` };
  }

  const dataCompra = parseISODate(r.data);
  const fatura = cartaoConfigurado(cartao) ? calcularFatura(dataCompra, cartao.diaFechamento, cartao.diaVencimento) : null;

  if (r.parcelas > 1 && fatura && cartao) {
    const parcelas = gerarParcelas({
      ...(r.valorEParcela ? { valorParcela: r.valor } : { valorTotal: r.valor }),
      nParcelas: r.parcelas,
      primeiraFatura: { mes: fatura.mes, ano: fatura.ano },
    });
    return {
      tipo: "parcelado",
      parcelamento: {
        descricao: r.descricao,
        valor_total: sumMoney(parcelas.map((p) => p.valor)),
        parcelas: r.parcelas,
        parcelas_pagas: 0,
        valor_parcela: parcelas[0].valor,
        cartao_id: cartao.id,
        subcategoria: r.subcategoria,
        data_compra: r.data,
        primeira_fatura_mes: fatura.mes,
        primeira_fatura_ano: fatura.ano,
        quitado: false,
        observacao: "via Telegram",
      },
      lancamentos: parcelas.map((p) => ({
        descricao: r.descricao,
        valor: p.valor,
        mes: p.mes,
        ano: p.ano,
        data: r.data,
        subcategoria: r.subcategoria,
        cartao_id: cartao.id,
        parcela_num: p.parcela_num,
        status: "pago",
        responsavel: ctx.responsavel,
        observacao: null,
      })),
    };
  }

  const competencia = fatura ? { mes: fatura.mes, ano: fatura.ano } : mesDe(r.data);
  return {
    tipo: "simples",
    lancamento: {
      descricao: r.descricao,
      valor: totalDoRascunho(r),
      categoria: tipo,
      ...competencia,
      data: r.data,
      subcategoria: tipo === "entrada" ? null : r.subcategoria,
      cartao_id: cartao?.id ?? null,
      // Cartão: status derivado da fatura no site; o campo fica "pago".
      status: tipo !== "cartao" && r.data > ctx.hoje ? "pendente" : "pago",
      reembolso: tipo === "entrada" && r.reembolso,
      responsavel: ctx.responsavel,
      observacao: null,
      origem: "telegram",
    },
  };
}
