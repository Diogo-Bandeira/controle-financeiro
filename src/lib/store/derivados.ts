// Cálculos derivados do estado (faturas, progresso de parcelamentos). Puros, sem React.

import {
  compararMesAno, faturaAberta, faturaDoCartao, faturaMarcadaPaga, indiceMes, somarMeses, statusParcela,
  type Fatura, type MesAno, type StatusFatura,
} from "../fatura";
import { sumMoney } from "../money";
import type { Cartao, FaturaPaga, Lancamento, Parcelamento } from "./types";

export interface ResumoFatura extends Fatura {
  cartaoId: string;
  total: number;
  status: StatusFatura;
  marcadaPaga: boolean;
  lancamentos: Lancamento[];
}

const doCartaoNoMes = (lancamentos: Lancamento[], cartaoId: string, { mes, ano }: MesAno) =>
  lancamentos.filter((l) => l.categoria === "cartao" && l.cartaoId === cartaoId && l.mes === mes && l.ano === ano);

export function resumoFatura(cartao: Cartao, competencia: MesAno, lancamentos: Lancamento[], faturasPagas: FaturaPaga[], hoje: Date): ResumoFatura {
  const lancs = doCartaoNoMes(lancamentos, cartao.id, competencia);
  return {
    ...faturaDoCartao(competencia, cartao),
    cartaoId: cartao.id,
    total: sumMoney(lancs.map((l) => l.valor)),
    status: statusParcela(competencia, cartao, faturasPagas, hoje),
    marcadaPaga: faturaMarcadaPaga(competencia, cartao.id, faturasPagas),
    lancamentos: lancs,
  };
}

/** Competências com lançamentos do cartão + a fatura aberta, em ordem cronológica. */
export function faturasDoCartao(cartao: Cartao, lancamentos: Lancamento[], faturasPagas: FaturaPaga[], hoje: Date): ResumoFatura[] {
  const aberta = faturaAberta(cartao, hoje);
  const indices = new Set([
    indiceMes(aberta),
    ...lancamentos.filter((l) => l.categoria === "cartao" && l.cartaoId === cartao.id).map(indiceMes),
  ]);
  return [...indices]
    .sort((a, b) => a - b)
    .map((i) => resumoFatura(cartao, { mes: i % 12, ano: Math.floor(i / 12) }, lancamentos, faturasPagas, hoje));
}

export function statusLancamentoCartao(l: Lancamento, cartoes: Cartao[], faturasPagas: FaturaPaga[], hoje: Date): StatusFatura | null {
  const cartao = l.categoria === "cartao" ? cartoes.find((c) => c.id === l.cartaoId) : undefined;
  return cartao ? statusParcela(l, cartao, faturasPagas, hoje) : null;
}

/** Limite usado = lançamentos do cartão em faturas ainda não pagas (inclui parcelas futuras). */
export function limiteUsadoCartao(cartao: Cartao, lancamentos: Lancamento[], faturasPagas: FaturaPaga[], hoje: Date): number {
  return sumMoney(
    lancamentos
      .filter((l) => l.categoria === "cartao" && l.cartaoId === cartao.id && statusParcela(l, cartao, faturasPagas, hoje) !== "paga")
      .map((l) => l.valor),
  );
}

export interface ProgressoParcelamento {
  vinculado: boolean;
  lancamentos: Lancamento[];
  pagas: number;
  restantes: number;
  valorRestante: number;
  primeira: MesAno | null;
  /** Mês da última parcela (estimado a partir de hoje nos legados). */
  termino: MesAno | null;
  proxima: (MesAno & { valor: number; dataVencimento: Date | null }) | null;
  concluido: boolean;
}

export const parcelamentoVinculado = (p: Parcelamento): boolean =>
  !!p.cartaoId && p.primeiraFaturaMes != null && p.primeiraFaturaAno != null;

export function progressoParcelamento(p: Parcelamento, lancamentos: Lancamento[], cartoes: Cartao[], faturasPagas: FaturaPaga[], hoje: Date): ProgressoParcelamento {
  const cartao = cartoes.find((c) => c.id === p.cartaoId);
  const mesAtual = { mes: hoje.getMonth(), ano: hoje.getFullYear() };

  if (!parcelamentoVinculado(p) || !cartao) {
    const restantes = Math.max(p.parcelas - p.parcelasPagas, 0);
    return {
      vinculado: false,
      lancamentos: [],
      pagas: p.parcelasPagas,
      restantes,
      valorRestante: sumMoney(Array(restantes).fill(p.valorParcela)),
      primeira: null,
      termino: restantes > 0 ? somarMeses(mesAtual.mes, mesAtual.ano, restantes - 1) : null,
      proxima: restantes > 0 ? { ...mesAtual, valor: p.valorParcela, dataVencimento: null } : null,
      concluido: restantes === 0,
    };
  }

  const lancs = lancamentos
    .filter((l) => l.parcelamentoId === p.id)
    .sort((a, b) => (a.parcelaNum ?? 0) - (b.parcelaNum ?? 0));
  const pendentes = lancs.filter((l) => statusParcela(l, cartao, faturasPagas, hoje) !== "paga");
  const pagas = Math.min(p.parcelasPagas + lancs.length - pendentes.length, p.parcelas);
  const primeira = { mes: p.primeiraFaturaMes, ano: p.primeiraFaturaAno };
  const ultimoLanc = lancs.reduce<MesAno | null>((max, l) => (!max || compararMesAno(l, max) > 0 ? l : max), null);
  const proximaLanc = pendentes[0];

  return {
    vinculado: true,
    lancamentos: lancs,
    pagas,
    restantes: pendentes.length,
    valorRestante: sumMoney(pendentes.map((l) => l.valor)),
    primeira,
    termino: ultimoLanc ?? somarMeses(primeira.mes, primeira.ano, p.parcelas - 1),
    proxima: proximaLanc
      ? { mes: proximaLanc.mes, ano: proximaLanc.ano, valor: proximaLanc.valor, dataVencimento: faturaDoCartao(proximaLanc, cartao).dataVencimento }
      : null,
    concluido: pendentes.length === 0,
  };
}
