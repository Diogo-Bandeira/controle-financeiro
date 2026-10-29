// Montagem dos lançamentos de parcelas para as operações de parcelamento. Puro (sem React/Supabase).
// O resultado alimenta a RPC salvar_parcelamento.

import { compararMesAno, faturaAberta, gerarParcelas, type CartaoDias, type MesAno, type StatusFatura } from "./fatura";
import { sumMoney } from "./money";
import { descricoesParecidas } from "./texto";
import type { Lancamento, NovoLancamento, Parcelamento } from "./store/types";

export type DadosParcelamento = Omit<Parcelamento, "id"> & { id?: string };

const primeiraFatura = (p: DadosParcelamento): MesAno => ({ mes: p.primeiraFaturaMes ?? 0, ano: p.primeiraFaturaAno ?? 0 });

const paraLancamento = (p: DadosParcelamento, parcela: { parcela_num: number; mes: number; ano: number; valor: number }): NovoLancamento => ({
  descricao: p.descricao,
  valor: parcela.valor,
  categoria: "cartao",
  mes: parcela.mes,
  ano: parcela.ano,
  data: p.dataCompra ?? `${parcela.ano}-${String(parcela.mes + 1).padStart(2, "0")}-01`,
  subcategoria: p.subcategoria,
  cartaoId: p.cartaoId,
  parcelamentoId: p.id ?? null,
  parcelaNum: parcela.parcela_num,
  recorrenciaId: null,
  status: "pago",
  reembolso: false,
  responsavel: null,
  observacao: null,
  origem: "parcela",
});

/** Lançamentos das parcelas > parcelasPagas (as anteriores contam como pagas e não são geradas). */
export function lancamentosDasParcelas(p: DadosParcelamento): NovoLancamento[] {
  return gerarParcelas({ valorTotal: p.valorTotal, nParcelas: p.parcelas, primeiraFatura: primeiraFatura(p) })
    .filter((x) => x.parcela_num > p.parcelasPagas)
    .map((x) => paraLancamento(p, x));
}

/** Quantas parcelas caem antes da fatura aberta (compra antiga). */
export function parcelasAntesDe(p: DadosParcelamento, aberta: MesAno): number {
  return gerarParcelas({ valorTotal: p.valorTotal, nParcelas: p.parcelas, primeiraFatura: primeiraFatura(p) })
    .filter((x) => compararMesAno(x, aberta) < 0).length;
}

type StatusDe = (l: Lancamento) => StatusFatura | null;

/** Editar aplicando às futuras: apaga as parcelas não pagas e regera as mesmas posições com os novos dados. */
export function regerarFuturas(novo: DadosParcelamento, existentes: Lancamento[], statusDe: StatusDe) {
  const pagas = existentes.filter((l) => statusDe(l) === "paga");
  const numsPagos = new Set(pagas.map((l) => l.parcelaNum));
  return {
    apagarIds: existentes.filter((l) => statusDe(l) !== "paga").map((l) => l.id),
    lancamentos: lancamentosDasParcelas(novo).filter((l) => !numsPagos.has(l.parcelaNum)),
  };
}

/** Quitar antecipado: move as parcelas não pagas para a fatura aberta. */
export function quitarAntecipado(p: Parcelamento, existentes: Lancamento[], cartao: CartaoDias, statusDe: StatusDe, hoje: Date) {
  const aberta = faturaAberta(cartao, hoje);
  const pendentes = existentes.filter((l) => statusDe(l) !== "paga");
  return {
    parcelamento: { ...p, quitado: true },
    apagarIds: pendentes.map((l) => l.id),
    lancamentos: pendentes.map((l) => ({ ...paraLancamento(p, { parcela_num: l.parcelaNum ?? 0, mes: aberta.mes, ano: aberta.ano, valor: l.valor }), data: l.data })),
  };
}

/** "Esta e as próximas": aplica valor/dados a partir da parcela k (só as não pagas). */
export function aplicarAPartirDe(
  p: Parcelamento,
  existentes: Lancamento[],
  k: number,
  patch: { descricao: string; valor: number; subcategoria: string | null },
  statusDe: StatusDe,
) {
  const alvos = existentes.filter((l) => (l.parcelaNum ?? 0) >= k && statusDe(l) !== "paga");
  const alvoIds = new Set(alvos.map((l) => l.id));
  const novos = alvos.map((l) => ({ ...l, descricao: patch.descricao, valor: patch.valor, subcategoria: patch.subcategoria }));
  const mantidos = existentes.filter((l) => !alvoIds.has(l.id));
  const valorTotal = sumMoney([...mantidos.map((l) => l.valor), ...novos.map((l) => l.valor), ...Array(p.parcelasPagas).fill(p.valorParcela)]);
  return {
    parcelamento: { ...p, descricao: patch.descricao, subcategoria: patch.subcategoria, valorParcela: patch.valor, valorTotal },
    apagarIds: alvos.map((l) => l.id),
    lancamentos: novos.map(({ id: _id, createdBy: _c, ...l }) => ({ ...l, parcelamentoId: p.id })),
  };
}

/** Excluir "esta e as próximas": remove as não pagas a partir de k e encurta o parcelamento. */
export function excluirAPartirDe(p: Parcelamento, existentes: Lancamento[], k: number, statusDe: StatusDe) {
  const alvos = existentes.filter((l) => (l.parcelaNum ?? 0) >= k && statusDe(l) !== "paga");
  const restantes = existentes.filter((l) => !alvos.includes(l));
  const parcelas = Math.max(k - 1, p.parcelasPagas, 1);
  return {
    parcelamento: {
      ...p,
      parcelas,
      valorTotal: sumMoney([...restantes.map((l) => l.valor), ...Array(p.parcelasPagas).fill(p.valorParcela)]),
    },
    apagarIds: alvos.map((l) => l.id),
    lancamentos: [] as NovoLancamento[],
  };
}

/** Lançamentos manuais de cartão que provavelmente duplicam as parcelas a gerar (vínculo de legado). */
export function possiveisDuplicados(novos: NovoLancamento[], lancamentos: Lancamento[], cartaoId: string | null): Lancamento[] {
  return lancamentos.filter(
    (l) =>
      l.categoria === "cartao" &&
      !l.parcelamentoId &&
      (l.cartaoId === cartaoId || l.cartaoId == null) &&
      novos.some((n) => n.mes === l.mes && n.ano === l.ano && Math.abs(n.valor - l.valor) <= 0.05 && descricoesParecidas(n.descricao, l.descricao)),
  );
}
