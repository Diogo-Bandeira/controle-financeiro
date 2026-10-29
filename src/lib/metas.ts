// Cálculos de metas (aporte necessário, ritmo, projeção, evolução) e encaixe de prioridades no orçamento.
// Puros, sem React/Supabase. Convenção: mes 0–11.

import { compararMesAno, indiceMes, parseISODate, somarMeses, type MesAno } from "./fatura";
import { round2, sumMoney } from "./money";

export interface AporteRef {
  data: string; // aaaa-mm-dd
  valor: number;
}

const mesDe = (d: Date): MesAno => ({ mes: d.getMonth(), ano: d.getFullYear() });
const mesDoAporte = (a: AporteRef): MesAno => mesDe(parseISODate(a.data));

export const saldoMeta = (saldoInicial: number, aportes: AporteRef[]): number => sumMoney([saldoInicial, ...aportes.map((a) => a.valor)]);

/** Meses inteiros entre o mês de `hoje` e o mês do prazo (mínimo 0). */
export const mesesAte = (hoje: Date, prazo: Date): number => Math.max(0, indiceMes(mesDe(prazo)) - indiceMes(mesDe(hoje)));

/**
 * Aporte mensal para atingir `alvo` em `meses`.
 * Sem taxa: linear (falta / meses). Com taxa r: valor futuro do saldo atual + PMT de série uniforme.
 */
export function aporteMensalNecessario(atual: number, alvo: number, meses: number, taxa: number | null): number {
  const falta = alvo - atual;
  if (falta <= 0) return 0;
  if (meses <= 0) return round2(falta);
  if (!taxa) return round2(falta / meses);
  const fator = (1 + taxa) ** meses;
  const restante = alvo - atual * fator;
  if (restante <= 0) return 0;
  return round2((restante * taxa) / (fator - 1));
}

/** Média mensal dos aportes nos últimos `meses` meses (inclui o mês corrente). */
export function ritmoMedio(aportes: AporteRef[], hoje: Date, meses = 3): number {
  const atual = mesDe(hoje);
  const inicio = somarMeses(atual.mes, atual.ano, -(meses - 1));
  const noPeriodo = aportes.filter((a) => {
    const m = mesDoAporte(a);
    return compararMesAno(m, inicio) >= 0 && compararMesAno(m, atual) <= 0;
  });
  return round2(sumMoney(noPeriodo.map((a) => a.valor)) / meses);
}

/** Mês em que o saldo alcança o alvo mantendo `aporteMensal` e a taxa. null se nunca (até 50 anos). */
export function projecaoConclusao(atual: number, alvo: number, aporteMensal: number, taxa: number | null, hoje: Date): MesAno | null {
  const inicio = mesDe(hoje);
  if (atual >= alvo) return inicio;
  const r = taxa ?? 0;
  if (aporteMensal <= 0 && (r <= 0 || atual <= 0)) return null;
  let saldo = atual;
  for (let i = 1; i <= 600; i++) {
    saldo = saldo * (1 + r) + aporteMensal;
    if (saldo >= alvo) return somarMeses(inicio.mes, inicio.ano, i);
  }
  return null;
}

export interface PontoEvolucao extends MesAno {
  saldo: number;
}

/** Saldo acumulado (saldo inicial + aportes) ao fim de cada mês, dos últimos `meses` meses até `fim`. */
export function evolucaoMeta(saldoInicial: number, aportes: AporteRef[], fim: MesAno, meses = 12): PontoEvolucao[] {
  return Array.from({ length: meses }, (_, i) => somarMeses(fim.mes, fim.ano, i - meses + 1)).map((m) => ({
    ...m,
    saldo: saldoMeta(saldoInicial, aportes.filter((a) => compararMesAno(mesDoAporte(a), m) <= 0)),
  }));
}

// ─── Prioridades: cabe / aperta / não cabe ──────────────────────────────────

export type Encaixe = "cabe" | "aperta" | "nao_cabe";

export interface AvaliacaoEncaixe {
  impacto: number;
  sobra: number;
  status: Encaixe;
}

/** impacto = valor / parcelas; sobra = limite − comprometido; aperta se couber com folga de 10% do limite. */
export function avaliarEncaixe(valor: number, parcelas: number, limite: number, comprometido: number): AvaliacaoEncaixe {
  const impacto = round2(valor / Math.max(1, parcelas));
  const sobra = round2(limite - comprometido);
  if (impacto <= sobra) return { impacto, sobra, status: "cabe" };
  if (impacto <= sobra + limite * 0.1) return { impacto, sobra, status: "aperta" };
  return { impacto, sobra, status: "nao_cabe" };
}
