import { describe, expect, it } from "vitest";
import { aporteMensalNecessario, avaliarEncaixe, evolucaoMeta, mesesAte, projecaoConclusao, ritmoMedio, saldoMeta } from "./metas";

const hoje = new Date(2026, 9, 15); // 15/10/2026

describe("metas", () => {
  it("saldo = saldo inicial + aportes", () => {
    expect(saldoMeta(1000, [{ data: "2026-01-01", valor: 0.1 }, { data: "2026-02-01", valor: 0.2 }])).toBe(1000.3);
  });

  it("meses até o prazo", () => {
    expect(mesesAte(hoje, new Date(2027, 9, 1))).toBe(12);
    expect(mesesAte(hoje, new Date(2026, 5, 1))).toBe(0);
  });

  it("aporte necessário linear sem taxa", () => {
    expect(aporteMensalNecessario(1000, 13000, 12, null)).toBe(1000);
    expect(aporteMensalNecessario(1000, 13000, 12, 0)).toBe(1000);
  });

  it("aporte necessário com taxa (valor futuro)", () => {
    // 12 meses a 1% a.m., saldo 0, alvo 12.682,50 → PMT ≈ 1000
    expect(aporteMensalNecessario(0, 12682.5, 12, 0.01)).toBeCloseTo(1000, 0);
    // rendimento do saldo atual já basta
    expect(aporteMensalNecessario(10000, 10500, 12, 0.01)).toBe(0);
  });

  it("aporte necessário: meta batida ou prazo vencido", () => {
    expect(aporteMensalNecessario(5000, 4000, 12, null)).toBe(0);
    expect(aporteMensalNecessario(1000, 4000, 0, null)).toBe(3000);
  });

  it("ritmo médio dos últimos 3 meses", () => {
    const aportes = [
      { data: "2026-10-01", valor: 300 },
      { data: "2026-09-10", valor: 300 },
      { data: "2026-08-05", valor: 300 },
      { data: "2026-07-05", valor: 9000 }, // fora da janela
    ];
    expect(ritmoMedio(aportes, hoje)).toBe(300);
  });

  it("projeção de conclusão linear e com taxa", () => {
    expect(projecaoConclusao(1000, 4000, 1000, null, hoje)).toEqual({ mes: 0, ano: 2027 });
    expect(projecaoConclusao(5000, 4000, 0, null, hoje)).toEqual({ mes: 9, ano: 2026 });
    expect(projecaoConclusao(1000, 4000, 0, null, hoje)).toBeNull();
    const comTaxa = projecaoConclusao(0, 12682.5, 1000, 0.01, hoje);
    expect(comTaxa).toEqual({ mes: 9, ano: 2027 });
  });

  it("evolução acumula aportes por mês", () => {
    const serie = evolucaoMeta(100, [{ data: "2026-09-10", valor: 50 }, { data: "2026-10-01", valor: 25 }], { mes: 9, ano: 2026 }, 3);
    expect(serie).toEqual([
      { mes: 7, ano: 2026, saldo: 100 },
      { mes: 8, ano: 2026, saldo: 150 },
      { mes: 9, ano: 2026, saldo: 175 },
    ]);
  });
});

describe("encaixe de prioridade", () => {
  it("cabe, aperta e não cabe", () => {
    expect(avaliarEncaixe(300, 1, 800, 500)).toEqual({ impacto: 300, sobra: 300, status: "cabe" });
    expect(avaliarEncaixe(350, 1, 800, 500).status).toBe("aperta");
    expect(avaliarEncaixe(600, 1, 800, 500).status).toBe("nao_cabe");
    expect(avaliarEncaixe(1200, 4, 800, 500).status).toBe("cabe");
  });
});
