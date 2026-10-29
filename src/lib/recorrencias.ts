// Geração dos lançamentos de recorrências para um mês. Sem React/Supabase.

import { calcularFatura, cartaoConfigurado, compararMesAno, parseISODate, toISODate, ultimoDia, type CartaoDias, type MesAno } from "./fatura";
import type { Lancamento, NovoLancamento, Recorrencia } from "./store/types";

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

const mesDaData = (iso: string): MesAno => {
  const d = parseISODate(iso);
  return { mes: d.getMonth(), ano: d.getFullYear() };
};

/** Lançamentos das recorrências vigentes cuja data cai em `alvo` e que ainda não existem. */
export function lancamentosRecorrentesDoMes(
  recorrencias: Recorrencia[],
  existentes: Pick<Lancamento, "recorrenciaId" | "data">[],
  alvo: MesAno,
  hoje: Date,
  cartoes: CartaoDias[],
): NovoLancamento[] {
  const jaGeradas = new Set(
    existentes
      .filter((l) => l.recorrenciaId && compararMesAno(mesDaData(l.data), alvo) === 0)
      .map((l) => l.recorrenciaId),
  );
  const hojeIso = toISODate(hoje);

  return recorrencias
    .filter((r) => recorrenciaVigente(r, alvo) && !jaGeradas.has(r.id))
    .map((r) => {
      const data = new Date(alvo.ano, alvo.mes, Math.min(r.dia, ultimoDia(alvo.ano, alvo.mes)));
      const iso = toISODate(data);
      const cartao = cartoes.find((c) => c.id === r.cartaoId);
      return {
        descricao: r.descricao,
        valor: r.valor,
        categoria: r.categoria,
        ...competenciaDoLancamento(r.categoria, data, cartao),
        data: iso,
        subcategoria: r.categoria === "entrada" ? null : r.subcategoria,
        cartaoId: r.categoria === "cartao" ? r.cartaoId : null,
        parcelamentoId: null,
        parcelaNum: null,
        recorrenciaId: r.id,
        status: r.categoria === "conta_fixa" && iso > hojeIso ? "pendente" : "pago",
        reembolso: r.categoria === "entrada" && r.reembolso,
        responsavel: r.responsavel,
        observacao: null,
        origem: "recorrente",
      };
    });
}
