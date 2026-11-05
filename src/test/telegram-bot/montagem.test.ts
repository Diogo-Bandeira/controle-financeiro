import { describe, expect, it } from "vitest";
import { campoFaltante, completarPeloHistorico, montarGravacao } from "../../../supabase/functions/telegram-bot/montagem.ts";
import { CARTOES, HOJE, rascunho } from "./fixtures";

const ctx = { hoje: HOJE, cartoes: CARTOES, responsavel: "Ana" };

describe("montarGravacao", () => {
  it("cartão à vista: competência = fatura (compra após o fechamento vai para a próxima)", () => {
    // Nubank fecha dia 3 e vence dia 10: compra em 30/10 → fecha 03/11 → vence 10/11.
    const g = montarGravacao(rascunho({ tipo: "cartao", cartaoId: "c-nubank" }), ctx);
    expect(g).toMatchObject({ tipo: "simples", lancamento: { mes: 10, ano: 2026, data: HOJE, cartao_id: "c-nubank", status: "pago", origem: "telegram", responsavel: "Ana" } });
    const antes = montarGravacao(rascunho({ tipo: "cartao", cartaoId: "c-nubank", data: "2026-10-02" }), ctx);
    expect(antes).toMatchObject({ lancamento: { mes: 9, ano: 2026 } });
  });

  it("vencimento antes do fechamento joga a competência para o mês seguinte ao fechamento", () => {
    // Itaú fecha 25 e vence 5: compra 30/10 → fecha 25/11 → vence 05/12.
    expect(montarGravacao(rascunho({ tipo: "cartao", cartaoId: "c-itau" }), ctx)).toMatchObject({ lancamento: { mes: 11, ano: 2026 } });
  });

  it("parcelado: parcelas a partir da fatura da compra, centavos na última", () => {
    const g = montarGravacao(rascunho({ descricao: "Tênis", valor: 1000, parcelas: 3, tipo: "cartao", cartaoId: "c-bradesco", subcategoria: "gastos_extras" }), ctx);
    if (g.tipo !== "parcelado") throw new Error("esperava parcelado");
    expect(g.parcelamento).toMatchObject({
      valor_total: 1000, parcelas: 3, parcelas_pagas: 0, valor_parcela: 333.33, cartao_id: "c-bradesco",
      primeira_fatura_mes: 10, primeira_fatura_ano: 2026, data_compra: HOJE, observacao: "via Telegram", subcategoria: "gastos_extras",
    });
    expect(g.lancamentos.map((l) => [l.parcela_num, l.mes, l.ano, l.valor])).toEqual([
      [1, 10, 2026, 333.33],
      [2, 11, 2026, 333.33],
      [3, 0, 2027, 333.34],
    ]);
  });

  it("parcelado com valor da parcela (3x200)", () => {
    const g = montarGravacao(rascunho({ valor: 200, valorEParcela: true, parcelas: 3, tipo: "cartao", cartaoId: "c-bradesco" }), ctx);
    expect(g).toMatchObject({ tipo: "parcelado", parcelamento: { valor_total: 600, valor_parcela: 200 } });
  });

  it("status: data futura → pendente; hoje → pago; cartão fica pago", () => {
    expect(montarGravacao(rascunho({ data: "2026-11-15" }), ctx)).toMatchObject({ lancamento: { status: "pendente", mes: 10, ano: 2026 } });
    expect(montarGravacao(rascunho(), ctx)).toMatchObject({ lancamento: { status: "pago", mes: 9 } });
    expect(montarGravacao(rascunho({ data: "2026-11-15", tipo: "cartao", cartaoId: "c-nubank" }), ctx)).toMatchObject({ lancamento: { status: "pago" } });
  });

  it("entrada sem subcategoria; reembolso só em entrada", () => {
    expect(montarGravacao(rascunho({ tipo: "entrada", reembolso: true }), ctx)).toMatchObject({ lancamento: { categoria: "entrada", subcategoria: null, reembolso: true } });
    expect(montarGravacao(rascunho({ reembolso: true }), ctx)).toMatchObject({ lancamento: { reembolso: false } });
  });

  it("cartão sem fechamento/vencimento não lança", () => {
    expect(montarGravacao(rascunho({ tipo: "cartao", cartaoId: "c-inter" }), ctx)).toMatchObject({ tipo: "erro" });
  });
});

describe("completarPeloHistorico e campoFaltante", () => {
  const historico = [
    { descricao: "Mercado", categoria: "cartao", subcategoria: "alimentacao", cartaoId: "c-nubank" },
    { descricao: "Mercado Extra", categoria: "cartao", subcategoria: "alimentacao", cartaoId: "c-nubank" },
    { descricao: "Salário", categoria: "entrada", subcategoria: null, cartaoId: null },
  ];

  it("usa a sugestão do histórico (subcategoria, tipo e cartão)", () => {
    const r = completarPeloHistorico(rascunho({ tipo: null, subcategoria: null }), historico, CARTOES);
    expect(r).toMatchObject({ tipo: "cartao", cartaoId: "c-nubank", subcategoria: "alimentacao" });
    expect(campoFaltante(r)).toBeNull();
  });

  it("explícito na mensagem vence o histórico", () => {
    const r = completarPeloHistorico(rascunho({ tipo: "variavel", subcategoria: "lazer" }), historico, CARTOES);
    expect(r).toMatchObject({ tipo: "variavel", cartaoId: null, subcategoria: "lazer" });
  });

  it("sem histórico: pergunta tipo (há cartões), cartão e subcategoria, nessa ordem", () => {
    const sem = completarPeloHistorico(rascunho({ descricao: "Padaria", tipo: null, subcategoria: null }), [], CARTOES);
    expect(campoFaltante(sem)).toBe("tipo");
    expect(campoFaltante({ ...sem, tipo: "cartao" })).toBe("cartao");
    expect(campoFaltante({ ...sem, tipo: "cartao", cartaoId: "c-nubank" })).toBe("subcategoria");
    expect(campoFaltante({ ...sem, tipo: "entrada" })).toBeNull();
  });

  it("sem cartões cadastrados → variável; com um cartão só → ele", () => {
    expect(completarPeloHistorico(rascunho({ tipo: null }), [], []).tipo).toBe("variavel");
    expect(completarPeloHistorico(rascunho({ tipo: "cartao" }), [], [CARTOES[0]]).cartaoId).toBe("c-nubank");
  });

  it("entrada pelo histórico", () => {
    expect(completarPeloHistorico(rascunho({ descricao: "Salário", tipo: null, subcategoria: null }), historico, CARTOES)).toMatchObject({ tipo: "entrada", subcategoria: null });
  });
});
