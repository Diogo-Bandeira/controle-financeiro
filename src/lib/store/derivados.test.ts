import { describe, expect, it } from "vitest";
import { gastoPorSubcategoria, limiteUsadoCartao, resumoFatura, totaisDoMes } from "./derivados";
import type { Cartao, Lancamento } from "./types";

const CARTAO: Cartao = { id: "c1", nome: "Nubank", banco: null, cor: null, diaFechamento: 3, diaVencimento: 10, limite: 5000, titular: null, ativo: true };
const HOJE = new Date(2026, 10, 16);

const lanc = (l: Partial<Lancamento>): Lancamento => ({
  id: "l", descricao: "x", valor: 100, categoria: "variavel", mes: 11, ano: 2026, data: "2026-11-20", subcategoria: "lazer", cartaoId: null,
  parcelamentoId: null, parcelaNum: null, recorrenciaId: null, status: "pago", reembolso: false, responsavel: null, observacao: null,
  origem: "manual", createdBy: null, ...l,
});

const compraCartao = (valor: number, subcategoria: string | null = "lazer") =>
  lanc({ valor, categoria: "cartao", cartaoId: "c1", subcategoria });

describe("totaisDoMes com crédito negativo", () => {
  it("negativo abate o total do próprio grupo", () => {
    const t = totaisDoMes([
      lanc({ categoria: "entrada", valor: 5000, subcategoria: null }),
      lanc({ categoria: "entrada", valor: -200, subcategoria: null }),
      compraCartao(300),
      compraCartao(-50),
      lanc({ categoria: "conta_fixa", valor: 180 }),
      lanc({ categoria: "variavel", valor: 90.1 }),
      lanc({ categoria: "variavel", valor: -0.1, subcategoria: null }),
    ]);
    expect(t).toMatchObject({ entradas: 4800, totalCartao: 250, contasFixas: 180, variaveis: 90, totalSaidas: 520, saldo: 4280, rendaPlanejamento: 4800 });
  });
});

describe("fatura com crédito negativo", () => {
  it("estorno e pagamento antecipado abatem o total da fatura e o limite usado", () => {
    const lancs = [compraCartao(1000), compraCartao(-120.5), compraCartao(-300, null), lanc({ categoria: "cartao", cartaoId: "c1", mes: 0, ano: 2027, valor: 80 })];
    expect(resumoFatura(CARTAO, { mes: 11, ano: 2026 }, lancs, [], HOJE).total).toBe(579.5);
    expect(limiteUsadoCartao(CARTAO, lancs, [], HOJE)).toBe(659.5);
  });
});

describe("gastoPorSubcategoria com estorno", () => {
  it("estorno com subcategoria reduz o gasto dela", () => {
    const g = gastoPorSubcategoria([compraCartao(200), compraCartao(-50), lanc({ subcategoria: "mercado", valor: 70 })]);
    expect(g.get("lazer")).toBe(150);
    expect(g.get("mercado")).toBe(70);
  });

  it("negativo sem subcategoria não mexe nas subcategorias (fica em '')", () => {
    const g = gastoPorSubcategoria([compraCartao(200), compraCartao(-300, null), lanc({ categoria: "entrada", valor: 999, subcategoria: null })]);
    expect(g.get("lazer")).toBe(200);
    expect(g.get("")).toBe(-300);
  });
});
