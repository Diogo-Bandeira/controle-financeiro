import { useCallback } from "react";
import { useFinanceData } from "@/lib/finance-store";
import { somarMeses } from "@/lib/fatura";
import { sumMoney } from "@/lib/money";

/** Monta o contexto financeiro enviado às Edge Functions de IA (mes é 0–11). */
export function useContextoIA() {
  const fin = useFinanceData();

  return useCallback(() => {
    const {
      mesSelecionado: mes, anoSelecionado: ano, lancamentosMes, entradas, reembolsos, rendaPlanejamento, totalSaidas, saldo,
      cartoes, resumoFatura, lancamentos, subcategoriasAtivas, limiteEfetivo, prioridades, metas, aportes, parcelamentos,
      progressoParcelamento, getCartao,
    } = fin;
    const proximosMeses = Array.from({ length: 6 }, (_, i) => somarMeses(mes, ano, i));
    const gastoSub = (slug: string) =>
      sumMoney(lancamentosMes.filter((l) => l.categoria !== "entrada" && l.subcategoria === slug).map((l) => l.valor));

    return {
      periodo: { mes, ano },
      resumo: { entradas, reembolsos, rendaPlanejamento, totalSaidas, saldo },
      lancamentos: lancamentosMes.map((l) => ({
        desc: l.descricao, valor: l.valor, cat: l.categoria, subcat: l.subcategoria, status: l.status,
        reembolso: l.reembolso || undefined, cartao: getCartao(l.cartaoId)?.nome, parcela: l.parcelaNum ?? undefined,
      })),
      cartoes: cartoes.filter((c) => c.ativo).map((c) => ({
        nome: c.nome,
        fechamento: c.diaFechamento,
        vencimento: c.diaVencimento,
        limite: c.limite,
        faturas: proximosMeses.slice(0, 3).map((m) => {
          const f = resumoFatura(c.id, m);
          return { mes: m.mes, ano: m.ano, total: f?.total ?? 0, status: f?.status };
        }),
      })),
      parcelasFuturas: proximosMeses.map((m) => ({
        mes: m.mes,
        ano: m.ano,
        total: sumMoney(lancamentos.filter((l) => l.origem === "parcela" && l.mes === m.mes && l.ano === m.ano).map((l) => l.valor)),
      })),
      limites: subcategoriasAtivas.map((s) => ({
        slug: s.slug, nome: s.label, tipo: s.tipo, contaNoOrcamento: s.contaNoOrcamento,
        limite: limiteEfetivo(s.slug, ano, mes), gasto: gastoSub(s.slug),
      })),
      parcelamentos: parcelamentos.filter((p) => !p.quitado).flatMap((p) => {
        const prog = progressoParcelamento(p);
        if (prog.concluido) return [];
        return [{ desc: p.descricao, parcela: p.valorParcela, restantes: prog.restantes, valorRestante: prog.valorRestante, termina: prog.termino, subcat: p.subcategoria }];
      }),
      prioridades: prioridades.filter((p) => !p.concluida).map((p) => ({
        desc: p.descricao, valor: p.valor, nivel: p.prioridade, subcat: p.subcategoria,
        mesPlanejado: p.mesPlanejado, anoPlanejado: p.anoPlanejado, parcelas: p.parcelasPrevistas,
      })),
      metas: metas.map((m) => {
        const doMeta = aportes.filter((a) => a.metaId === m.id);
        return {
          nome: m.nome, alvo: m.valorMeta, saldoInicial: m.valorAtual,
          atual: sumMoney([m.valorAtual, ...doMeta.map((a) => a.valor)]),
          prazo: m.prazo, taxaMensal: m.taxaRendimentoMensal,
          aportesRecentes: doMeta.slice(-6).map((a) => ({ data: a.data, valor: a.valor })),
        };
      }),
    };
  }, [fin]);
}
