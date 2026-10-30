// Geração dos lançamentos de recorrências (mês avulso ou janela móvel) e propagação de edições. Sem React/Supabase.

import { calcularFatura, cartaoConfigurado, compararMesAno, parseISODate, somarMeses, toISODate, ultimoDia, type CartaoDias, type MesAno } from "./fatura";
import { toCents } from "./money";
import type { Lancamento, NovoLancamento, Recorrencia, RecorrenciaExcecao } from "./store/types";

/** Meses mantidos lançados a partir do mês atual (inclusive). */
export const MESES_RECORRENCIA = 6;

export function recorrenciaVigente(r: Recorrencia, alvo: MesAno): boolean {
  if (!r.ativo) return false;
  if (compararMesAno(alvo, { mes: r.inicioMes, ano: r.inicioAno }) < 0) return false;
  if (r.fimAno == null || r.fimMes == null) return true;
  return compararMesAno(alvo, { mes: r.fimMes, ano: r.fimAno }) <= 0;
}

/** mes/ano do lançamento: fatura para cartão configurado; mês da data para o resto. */
export function competenciaDoLancamento(categoria: Lancamento["categoria"], data: Date, cartao: CartaoDias | null | undefined): MesAno {
  if (categoria === "cartao" && cartaoConfigurado(cartao)) {
    const { mes, ano } = calcularFatura(data, cartao.diaFechamento, cartao.diaVencimento);
    return { mes, ano };
  }
  return { mes: data.getMonth(), ano: data.getFullYear() };
}

export const mesDaData = (iso: string): MesAno => {
  const d = parseISODate(iso);
  return { mes: d.getMonth(), ano: d.getFullYear() };
};

/** Meses de data da janela: mês de `hoje` e os `meses - 1` seguintes. */
export const janelaRecorrencia = (hoje: Date, meses = MESES_RECORRENCIA): MesAno[] =>
  Array.from({ length: meses }, (_, i) => somarMeses(hoje.getMonth(), hoje.getFullYear(), i));

const dataNoMes = (dia: number, { mes, ano }: MesAno): Date => new Date(ano, mes, Math.min(dia, ultimoDia(ano, mes)));

/** Data futura → pendente. Cartão fica "pago": o status real vem da fatura. */
const statusGerado = (categoria: Lancamento["categoria"], iso: string, hojeIso: string): Lancamento["status"] =>
  categoria !== "cartao" && iso > hojeIso ? "pendente" : "pago";

/** Campos que vêm da recorrência num lançamento do mês de data `alvo`. */
function camposDaRecorrencia(r: Recorrencia, alvo: MesAno, cartoes: CartaoDias[]) {
  const data = dataNoMes(r.dia, alvo);
  return {
    descricao: r.descricao,
    valor: r.valor,
    categoria: r.categoria,
    ...competenciaDoLancamento(r.categoria, data, cartoes.find((c) => c.id === r.cartaoId)),
    data: toISODate(data),
    subcategoria: r.categoria === "entrada" ? null : r.subcategoria,
    cartaoId: r.categoria === "cartao" ? r.cartaoId : null,
    reembolso: r.categoria === "entrada" && r.reembolso,
    responsavel: r.responsavel,
  };
}

/** Lançamentos das recorrências vigentes cuja data cai em `alvo`, que ainda não existem nem foram excluídos (exceção). */
export function lancamentosRecorrentesDoMes(
  recorrencias: Recorrencia[],
  existentes: Pick<Lancamento, "recorrenciaId" | "data">[],
  alvo: MesAno,
  hoje: Date,
  cartoes: CartaoDias[],
  excecoes: Pick<RecorrenciaExcecao, "recorrenciaId" | "mes" | "ano">[] = [],
): NovoLancamento[] {
  const bloqueadas = new Set([
    ...existentes.filter((l) => l.recorrenciaId && compararMesAno(mesDaData(l.data), alvo) === 0).map((l) => l.recorrenciaId),
    ...excecoes.filter((e) => compararMesAno(e, alvo) === 0).map((e) => e.recorrenciaId),
  ]);
  const hojeIso = toISODate(hoje);

  return recorrencias
    .filter((r) => recorrenciaVigente(r, alvo) && !bloqueadas.has(r.id))
    .map((r) => {
      const campos = camposDaRecorrencia(r, alvo, cartoes);
      return {
        ...campos,
        parcelamentoId: null,
        parcelaNum: null,
        recorrenciaId: r.id,
        status: statusGerado(r.categoria, campos.data, hojeIso),
        observacao: null,
        origem: "recorrente",
      };
    });
}

/** Lançamentos que faltam na janela móvel (mês atual + `meses - 1`), por mês de data. */
export function lancamentosRecorrentesDaJanela(
  recorrencias: Recorrencia[],
  existentes: Pick<Lancamento, "recorrenciaId" | "data">[],
  excecoes: Pick<RecorrenciaExcecao, "recorrenciaId" | "mes" | "ano">[],
  hoje: Date,
  cartoes: CartaoDias[],
  meses = MESES_RECORRENCIA,
): NovoLancamento[] {
  return janelaRecorrencia(hoje, meses).flatMap((alvo) => lancamentosRecorrentesDoMes(recorrencias, existentes, alvo, hoje, cartoes, excecoes));
}

/** Valor ou descrição diferente da recorrência (antes da edição) = editado no mês; a edição da recorrência não o altera. */
export const editadoIndividualmente = (l: Pick<Lancamento, "valor" | "descricao">, r: Pick<Recorrencia, "valor" | "descricao">): boolean =>
  toCents(l.valor) !== toCents(r.valor) || l.descricao !== r.descricao;

/** Lançamentos da recorrência com data depois de hoje. */
export const futurosDaRecorrencia = (recorrenciaId: string, lancamentos: Lancamento[], hoje: Date): Lancamento[] => {
  const hojeIso = toISODate(hoje);
  return lancamentos.filter((l) => l.recorrenciaId === recorrenciaId && l.data > hojeIso);
};

/**
 * Lançamentos futuros (data > hoje) já gerados, não editados individualmente, com os campos da recorrência editada.
 * Dia/cartão recalculam data e competência dentro do mesmo mês de data. Só devolve os que mudam.
 */
export function propagarEdicao(anterior: Recorrencia, nova: Recorrencia, lancamentos: Lancamento[], hoje: Date, cartoes: CartaoDias[]): Lancamento[] {
  const hojeIso = toISODate(hoje);
  return futurosDaRecorrencia(anterior.id, lancamentos, hoje)
    .filter((l) => !editadoIndividualmente(l, anterior))
    .flatMap((l) => {
      const campos = camposDaRecorrencia(nova, mesDaData(l.data), cartoes);
      const status = campos.categoria === l.categoria ? l.status : statusGerado(campos.categoria, campos.data, hojeIso);
      const atualizado: Lancamento = { ...l, ...campos, status };
      return JSON.stringify(atualizado) === JSON.stringify(l) ? [] : [atualizado];
    });
}

/** Futuros pendentes cujo mês de data saiu da vigência (pausa, fim ou início alterados). */
export const futurosForaDaVigencia = (nova: Recorrencia, lancamentos: Lancamento[], hoje: Date, pago: (l: Lancamento) => boolean): Lancamento[] =>
  futurosDaRecorrencia(nova.id, lancamentos, hoje).filter((l) => !pago(l) && !recorrenciaVigente(nova, mesDaData(l.data)));

/** Pendentes da recorrência com data depois de `aposIso`. */
export const pendentesDaRecorrenciaApos = (recorrenciaId: string, lancamentos: Lancamento[], aposIso: string, pago: (l: Lancamento) => boolean): Lancamento[] =>
  lancamentos.filter((l) => l.recorrenciaId === recorrenciaId && l.data > aposIso && !pago(l));
