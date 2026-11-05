// Respostas das consultas calculadas no código (sem 2ª chamada de IA): resumo, limites, fatura, gasto por subcategoria.

import { datasDaFatura, faturaAberta, limiteEfetivo, mesmoMes, somarMeses, cartaoConfigurado, type MesAno } from "../_shared/dominio/fatura.ts";
import { sumMoney } from "../_shared/dominio/money.ts";
import { escaparHtml } from "./html.ts";
import { brl, diaMesData, linhaUso, mesAno, percentual, type UsoSubcategoria } from "./mensagens.ts";
import type { CartaoBot, LancamentoMes, OrcamentoBot, SubcategoriaBot } from "./tipos.ts";

const doMes = (lancs: LancamentoMes[], competencia: MesAno) => lancs.filter((l) => mesmoMes(l, competencia));

export function usoDaSubcategoria(sub: SubcategoriaBot, competencia: MesAno, lancs: LancamentoMes[], orcamentos: OrcamentoBot[]): UsoSubcategoria {
  const gastos = doMes(lancs, competencia).filter((l) => l.categoria !== "entrada" && l.subcategoria === sub.slug);
  return {
    slug: sub.slug,
    label: sub.label,
    competencia,
    gasto: sumMoney(gastos.map((l) => l.valor)),
    limite: limiteEfetivo(sub.slug, competencia.ano, competencia.mes, [sub], orcamentos),
    contaNoOrcamento: sub.contaNoOrcamento,
  };
}

export function resumoDoMes(competencia: MesAno, lancs: LancamentoMes[]) {
  const doPeriodo = doMes(lancs, competencia);
  const entradas = sumMoney(doPeriodo.filter((l) => l.categoria === "entrada").map((l) => l.valor));
  const saidas = sumMoney(doPeriodo.filter((l) => l.categoria !== "entrada").map((l) => l.valor));
  return { entradas, saidas, saldo: sumMoney([entradas, -saidas]) };
}

const proporcao = (u: UsoSubcategoria): number => (u.limite > 0 ? u.gasto / u.limite : -1);

export function textoResumo(competencia: MesAno, mesAtual: MesAno, subs: SubcategoriaBot[], lancs: LancamentoMes[], orcamentos: OrcamentoBot[]): string {
  const { entradas, saidas, saldo } = resumoDoMes(competencia, lancs);
  const maisPerto = subs
    .filter((s) => s.contaNoOrcamento)
    .map((s) => usoDaSubcategoria(s, competencia, lancs, orcamentos))
    .filter((u) => u.limite > 0)
    .sort((a, b) => proporcao(b) - proporcao(a))
    .slice(0, 3);
  return [
    `<b>Resumo de ${mesAno(competencia)}</b>`,
    `Entradas: ${brl(entradas)}`,
    `Saídas: ${brl(saidas)}`,
    `Saldo: <b>${brl(saldo)}</b>`,
    ...(maisPerto.length ? ["", "Mais perto do limite:", ...maisPerto.map((u) => `• ${linhaUso(u, mesAtual)}`)] : []),
  ].join("\n");
}

export function textoLimites(competencia: MesAno, subs: SubcategoriaBot[], lancs: LancamentoMes[], orcamentos: OrcamentoBot[]): string {
  const usos = subs.map((s) => usoDaSubcategoria(s, competencia, lancs, orcamentos));
  const linha = (u: UsoSubcategoria) => {
    const pct = percentual(u);
    const marcador = (() => {
      if (pct == null) return "•";
      if (pct > 100) return "🚨";
      if (pct >= 80) return "⚠️";
      return "•";
    })();
    const limite = u.limite > 0 ? ` de ${brl(u.limite)} (${pct}%)` : "";
    return `${marcador} ${escaparHtml(u.label)}: ${brl(u.gasto)}${limite}`;
  };
  const fora = usos.filter((u) => !u.contaNoOrcamento);
  return [
    `<b>Limites de ${mesAno(competencia)}</b>`,
    ...usos.filter((u) => u.contaNoOrcamento).map(linha),
    ...(fora.length ? ["", "<i>Fora do orçamento:</i>", ...fora.map(linha)] : []),
  ].join("\n");
}

export function textoGastoSubcategoria(sub: SubcategoriaBot, competencia: MesAno, mesAtual: MesAno, lancs: LancamentoMes[], orcamentos: OrcamentoBot[]): string {
  return linhaUso(usoDaSubcategoria(sub, competencia, lancs, orcamentos), mesAtual);
}

/** Competências da fatura aberta e da próxima de um cartão. */
export const competenciasFatura = (cartao: CartaoBot, hoje: Date): MesAno[] => {
  const aberta = faturaAberta(cartao, hoje);
  return [{ mes: aberta.mes, ano: aberta.ano }, somarMeses(aberta.mes, aberta.ano, 1)];
};

export function textoFaturas(cartoes: CartaoBot[], hoje: Date, lancs: LancamentoMes[]): string {
  if (cartoes.length === 0) return "Nenhum cartão ativo.";
  const blocos = cartoes.map((c) => {
    const titulo = `<b>${escaparHtml(c.nome)}</b>`;
    if (!cartaoConfigurado(c)) return `${titulo}\nConfigure fechamento e vencimento no site.`;
    const [aberta, proxima] = competenciasFatura(c, hoje).map((comp) => {
      const { dataFechamento, dataVencimento } = datasDaFatura(comp, c.diaFechamento, c.diaVencimento);
      const total = sumMoney(doMes(lancs, comp).filter((l) => l.categoria === "cartao" && l.cartaoId === c.id).map((l) => l.valor));
      return `${mesAno(comp)}: <b>${brl(total)}</b> · fecha ${diaMesData(dataFechamento)} · vence ${diaMesData(dataVencimento)}`;
    });
    return `${titulo}\nAberta — ${aberta}\nPróxima — ${proxima}`;
  });
  return blocos.join("\n\n");
}
