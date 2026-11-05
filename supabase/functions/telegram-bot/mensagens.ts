// Textos do bot (HTML do Telegram), confirmação de lançamento e teclados inline.

import { datasDaFatura, cartaoConfigurado, type MesAno } from "../_shared/dominio/fatura.ts";
import type { CartaoBot, LancamentoGravado, Rascunho, SubcategoriaBot, Teclado } from "./tipos.ts";
import { totalDoRascunho, type CampoFaltante } from "./montagem.ts";
import { escaparHtml } from "./html.ts";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "R$ 1.300,50" (espaço comum no lugar do não separável do Intl). */
export const brl = (v: number): string => BRL.format(v).replace(/\s/g, " ");
export const mesAno = ({ mes, ano }: MesAno): string => `${MESES_CURTOS[mes]}/${ano}`;
export const diaMes = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const diaMesData = (d: Date): string => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

const TIPOS_LABEL: Record<string, string> = { entrada: "Entrada", conta_fixa: "Conta fixa", cartao: "Cartão", variavel: "Pix/Débito/Dinheiro" };

// ─── Uso da subcategoria ─────────────────────────────────────────────────────

export interface UsoSubcategoria {
  slug: string;
  label: string;
  competencia: MesAno;
  gasto: number;
  limite: number;
  contaNoOrcamento: boolean;
}

export const percentual = (u: UsoSubcategoria): number | null => (u.limite > 0 ? Math.round((u.gasto / u.limite) * 100) : null);

/** "Alimentação no mês: R$ 812,40 de R$ 1.880,00 (43%)" + alerta acima de 80% / 100%. */
export function linhaUso(u: UsoSubcategoria, mesAtual: MesAno): string {
  const quando = u.competencia.mes === mesAtual.mes && u.competencia.ano === mesAtual.ano ? "no mês" : `em ${mesAno(u.competencia)}`;
  const pct = percentual(u);
  if (pct == null) return `${escaparHtml(u.label)} ${quando}: ${brl(u.gasto)} (sem limite)`;
  const alerta = (() => {
    if (pct > 100) return " 🚨 passou do limite";
    if (pct >= 80) return " ⚠️ perto do limite";
    return "";
  })();
  return `${escaparHtml(u.label)} ${quando}: ${brl(u.gasto)} de ${brl(u.limite)} (${pct}%)${alerta}`;
}

// ─── Confirmação ─────────────────────────────────────────────────────────────

export type ItemGravado = { parcelamentoId: string | null; lancamentos: LancamentoGravado[] };

export interface ContextoTexto {
  cartoes: CartaoBot[];
  subcategorias: SubcategoriaBot[];
  mesAtual: MesAno;
}

const nomeSub = (slug: string | null, subs: SubcategoriaBot[]): string =>
  escaparHtml(subs.find((s) => s.slug === slug)?.label ?? slug ?? "Sem subcategoria");

/** Agrupa os lançamentos gravados: cada parcelamento vira um item; os demais, um item cada. */
export function agruparGravados(lancamentos: LancamentoGravado[]): ItemGravado[] {
  const parcelamentos = [...new Set(lancamentos.map((l) => l.parcelamento_id).filter((id): id is string => !!id))];
  return [
    ...lancamentos.filter((l) => !l.parcelamento_id).map((l) => ({ parcelamentoId: null, lancamentos: [l] })),
    ...parcelamentos.map((id) => ({
      parcelamentoId: id,
      lancamentos: lancamentos.filter((l) => l.parcelamento_id === id).sort((a, b) => (a.parcela_num ?? 0) - (b.parcela_num ?? 0)),
    })),
  ];
}

function blocoItem(item: ItemGravado, uso: UsoSubcategoria | null, ctx: ContextoTexto): string[] {
  const [primeiro] = item.lancamentos;
  const ultimo = item.lancamentos[item.lancamentos.length - 1];
  const cartao = ctx.cartoes.find((c) => c.id === primeiro.cartao_id);
  const descricao = `<b>${escaparHtml(primeiro.descricao)}</b>`;
  const linhaUsoTexto = uso ? [linhaUso(uso, ctx.mesAtual)] : [];

  if (item.parcelamentoId) {
    const n = item.lancamentos.length;
    return [
      `${descricao} — ${n}× ${brl(primeiro.valor)} · ${escaparHtml(cartao?.nome ?? "Cartão")} · de ${mesAno(primeiro)} a ${mesAno(ultimo)}`,
      `${nomeSub(primeiro.subcategoria, ctx.subcategorias)} · compra em ${diaMes(primeiro.data)}`,
      ...linhaUsoTexto,
    ];
  }

  const detalhes = (() => {
    if (primeiro.categoria === "entrada") return ["Entrada", diaMes(primeiro.data), ...(primeiro.reembolso ? ["reembolso"] : [])];
    if (primeiro.categoria === "cartao" && cartaoConfigurado(cartao)) {
      const { dataVencimento } = datasDaFatura(primeiro, cartao.diaFechamento, cartao.diaVencimento);
      return [nomeSub(primeiro.subcategoria, ctx.subcategorias), escaparHtml(cartao.nome), `fatura de ${mesAno(primeiro)} (vence ${diaMesData(dataVencimento)})`];
    }
    return [
      nomeSub(primeiro.subcategoria, ctx.subcategorias),
      TIPOS_LABEL[primeiro.categoria],
      diaMes(primeiro.data),
      ...(primeiro.status === "pendente" ? ["pendente"] : []),
    ];
  })();
  return [`${descricao} — ${brl(primeiro.valor)}`, detalhes.join(" · "), ...linhaUsoTexto];
}

export function formatarConfirmacao(itens: { item: ItemGravado; uso: UsoSubcategoria | null }[], ctx: ContextoTexto): string {
  const titulo = itens.length > 1 ? `Lançados ✅ (${itens.length})` : "Lançado ✅";
  return `${titulo}\n${itens.map(({ item, uso }) => blocoItem(item, uso, ctx).join("\n")).join("\n\n")}`;
}

export function tecladoConfirmacao(mensagemId: string, itens: ItemGravado[]): Teclado {
  const linha1 = [{ text: "↩️ Desfazer", callback_data: `d:${mensagemId}` }];
  if (itens.length !== 1) return [linha1];
  const [item] = itens;
  const ehSaida = item.lancamentos[0].categoria !== "entrada";
  const ehCartao = item.lancamentos[0].categoria === "cartao";
  const trocas = [
    ...(ehSaida ? [{ text: "🏷️ Trocar subcategoria", callback_data: `s:${mensagemId}` }] : []),
    ...(ehCartao ? [{ text: "💳 Trocar cartão", callback_data: `c:${mensagemId}` }] : []),
  ];
  return trocas.length ? [linha1, trocas] : [linha1];
}

// ─── Perguntas ───────────────────────────────────────────────────────────────

export const OPCOES_VISIVEIS = 8;

/** Opções do tipo (rótulo e categoria) na ordem dos botões. */
export const OPCOES_TIPO: { label: string; tipo: string }[] = [
  { label: "💳 Cartão…", tipo: "cartao" },
  { label: "Pix/Débito", tipo: "variavel" },
  { label: "Dinheiro", tipo: "variavel" },
  { label: "➕ Entrada", tipo: "entrada" },
];

export function textoPergunta(campo: CampoFaltante, r: Rascunho, indice: number, total: number): string {
  const valor = r.parcelas > 1 ? `${r.parcelas}× ${brl(r.valorEParcela ? r.valor : r.valor / r.parcelas)}` : brl(totalDoRascunho(r));
  const alvo = `<b>${escaparHtml(r.descricao)}</b> — ${valor}`;
  const posicao = total > 1 ? ` (${indice + 1} de ${total})` : "";
  if (campo === "tipo") return `Como foi pago ${alvo}?${posicao}`;
  if (campo === "cartao") return `Em qual cartão foi ${alvo}?${posicao}`;
  return `Qual a subcategoria de ${alvo}?${posicao}`;
}

/** Botões das opções (2 por linha). Com `todas` = false mostra só as primeiras + "Outras". */
export function tecladoOpcoes(pendenciaId: string, rotulos: string[], todas = true): Teclado {
  const visiveis = todas ? rotulos : rotulos.slice(0, OPCOES_VISIVEIS);
  const botoes = visiveis.map((text, i) => ({ text, callback_data: `p:${pendenciaId}:${i}` }));
  const linhas = Array.from({ length: Math.ceil(botoes.length / 2) }, (_, i) => botoes.slice(i * 2, i * 2 + 2));
  const extras = [
    ...(!todas && rotulos.length > OPCOES_VISIVEIS ? [{ text: "Outras…", callback_data: `p:${pendenciaId}:o` }] : []),
    { text: "✖️ Cancelar", callback_data: `p:${pendenciaId}:x` },
  ];
  return [...linhas, extras];
}

// ─── Textos fixos ────────────────────────────────────────────────────────────

export const EXEMPLOS = [
  "• <code>mercado 130</code>",
  "• <code>uber 23,90 pix ontem</code>",
  "• <code>mercado 130 nubank</code>",
  "• <code>tênis 600 3x bradesco</code> ou <code>tênis 3x200 bradesco</code>",
  "• <code>+5000 salário</code> ou <code>recebi 200 reembolso</code>",
  "• <code>conta de luz 180 10/11</code>",
  "• áudio ou foto do comprovante",
  "• <code>quanto gastei em lazer?</code>",
].join("\n");

export const AJUDA = `Mande um gasto ou entrada em texto, áudio ou foto de comprovante:
${EXEMPLOS}

Formas de pagamento: <code>pix</code>, <code>débito</code>, <code>dinheiro</code>, <code>boleto</code>/<code>conta</code> (conta fixa) ou o nome do cartão. Datas: <code>ontem</code>, <code>anteontem</code>, <code>dd/mm</code>.

Comandos:
/resumo — entradas, saídas e saldo do mês
/limites — gasto × limite por subcategoria
/fatura [cartão] — fatura aberta e a próxima
/desfazer — desfaz o último lançamento (até 24 h)
/status — uso da IA hoje
/sair — desconecta este chat`;

export const INSTRUCOES_VINCULO = `Este chat ainda não está conectado.

1. No site, abra <b>Configurações → Telegram</b> e toque em <b>Conectar Telegram</b>.
2. Abra o link mostrado e toque em <b>Iniciar</b> (ou mande <code>/vincular CÓDIGO</code> aqui).`;

export const boasVindas = (nome: string | null): string => `Conectado ✅${nome ? ` Os lançamentos sairão como <b>${escaparHtml(nome)}</b>.` : ""}

${AJUDA}`;

export const CODIGO_INVALIDO = "Código inválido, expirado ou já usado. Gere um novo em <b>Configurações → Telegram</b> no site.";

export const FALLBACK_LIMITE =
  "O limite diário da IA acabou. Mande no formato <code>descrição valor cartão</code> (ex.: <code>mercado 130 nubank</code>) que eu lanço sem IA, ou lance pelo site.";
export const FALLBACK_MIDIA_LIMITE = `Áudio e foto ficam indisponíveis até amanhã porque o limite diário da IA acabou.\n\n${FALLBACK_LIMITE}`;
export const FALLBACK_MINUTO = "Muitas mensagens para a IA em pouco tempo. Tente de novo em 1 minuto ou mande no formato <code>mercado 130 nubank</code>.";
export const FALLBACK_FALHA =
  "Não consegui interpretar agora. Mande no formato <code>descrição valor cartão</code> (ex.: <code>mercado 130 nubank</code>) ou lance pelo site.";
export const NAO_ENTENDI = `Não entendi. Exemplos:\n${EXEMPLOS}`;
export const MIDIA_GRANDE = "Esse arquivo é grande demais para mim (até 2 min de áudio e 5 MB). Mande em texto, ex.: <code>mercado 130 nubank</code>.";
export const MIDIA_NAO_SUPORTADA = "Por enquanto entendo texto, áudio e foto. Mande em texto, ex.: <code>mercado 130 nubank</code>.";
export const LIMITE_POR_HORA = "Muitas mensagens na última hora. Aguarde um pouco e tente de novo.";
export const PERGUNTA_EXPIRADA = "Essa pergunta expirou, mande de novo.";
export const SO_CHAT_PRIVADO = "Só funciono em conversa privada.";
