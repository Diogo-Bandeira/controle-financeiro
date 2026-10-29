import { describe, expect, it } from "vitest";
import { calcularFatura, faturaAberta, gerarParcelas, limiteEfetivo, somarMeses, statusParcela, toISODate } from "./fatura";
import { sumMoney } from "./money";

const d = (ano: number, mes1a12: number, dia: number) => new Date(ano, mes1a12 - 1, dia);
const resumo = (f: ReturnType<typeof calcularFatura>) => ({
  mes: f.mes,
  ano: f.ano,
  fecha: toISODate(f.dataFechamento),
  vence: toISODate(f.dataVencimento),
});

describe("calcularFatura", () => {
  describe("Bradesco: fecha 3, vence 10", () => {
    it("compra 15/01/2026 → fev/2026, vence 10/02/2026", () => {
      expect(resumo(calcularFatura(d(2026, 1, 15), 3, 10))).toEqual({ mes: 1, ano: 2026, fecha: "2026-02-03", vence: "2026-02-10" });
    });
    it("compra 02/01/2026 → jan/2026, vence 10/01/2026", () => {
      expect(resumo(calcularFatura(d(2026, 1, 2), 3, 10))).toEqual({ mes: 0, ano: 2026, fecha: "2026-01-03", vence: "2026-01-10" });
    });
    it("compra no dia do fechamento (03/01/2026) → próxima fatura fev/2026", () => {
      expect(resumo(calcularFatura(d(2026, 1, 3), 3, 10))).toMatchObject({ mes: 1, ano: 2026 });
    });
  });

  describe("fecha 28, vence 5 (vencimento no mês seguinte ao fechamento)", () => {
    it("compra 10/01/2026 → fecha 28/01, vence 05/02 → fev/2026", () => {
      expect(resumo(calcularFatura(d(2026, 1, 10), 28, 5))).toEqual({ mes: 1, ano: 2026, fecha: "2026-01-28", vence: "2026-02-05" });
    });
    it("compra 30/01/2026 → fecha 28/02, vence 05/03 → mar/2026", () => {
      expect(resumo(calcularFatura(d(2026, 1, 30), 28, 5))).toEqual({ mes: 2, ano: 2026, fecha: "2026-02-28", vence: "2026-03-05" });
    });
  });

  describe("fechamento dia 31 em fevereiro", () => {
    it("2026: fevereiro fecha dia 28", () => {
      expect(resumo(calcularFatura(d(2026, 2, 27), 31, 10))).toEqual({ mes: 2, ano: 2026, fecha: "2026-02-28", vence: "2026-03-10" });
      expect(resumo(calcularFatura(d(2026, 2, 28), 31, 10))).toEqual({ mes: 3, ano: 2026, fecha: "2026-03-31", vence: "2026-04-10" });
    });
    it("2028 (bissexto): fevereiro fecha dia 29", () => {
      expect(resumo(calcularFatura(d(2028, 2, 28), 31, 10))).toEqual({ mes: 2, ano: 2028, fecha: "2028-02-29", vence: "2028-03-10" });
      expect(resumo(calcularFatura(d(2028, 2, 29), 31, 10))).toMatchObject({ mes: 3, ano: 2028, fecha: "2028-03-31" });
    });
    it("vencimento 31 limitado ao último dia do mês", () => {
      expect(resumo(calcularFatura(d(2026, 2, 1), 20, 31))).toMatchObject({ mes: 1, ano: 2026, vence: "2026-02-28" });
    });
  });

  it("virada de ano: compra 20/12/2026, fecha 15 → jan/2027", () => {
    expect(resumo(calcularFatura(d(2026, 12, 20), 15, 25))).toEqual({ mes: 0, ano: 2027, fecha: "2027-01-15", vence: "2027-01-25" });
  });
});

describe("somarMeses", () => {
  it("vira o ano para frente e para trás", () => {
    expect(somarMeses(10, 2026, 11)).toEqual({ mes: 9, ano: 2027 });
    expect(somarMeses(0, 2026, -1)).toEqual({ mes: 11, ano: 2025 });
    expect(somarMeses(5, 2026, -18)).toEqual({ mes: 11, ano: 2024 });
  });
});

describe("gerarParcelas", () => {
  it("12 parcelas a partir de nov/2026 terminam em out/2027", () => {
    const p = gerarParcelas({ valorTotal: 1200, nParcelas: 12, primeiraFatura: { mes: 10, ano: 2026 } });
    expect(p[0]).toMatchObject({ parcela_num: 1, mes: 10, ano: 2026 });
    expect(p[11]).toMatchObject({ parcela_num: 12, mes: 9, ano: 2027 });
  });
  it("1046,40 em 12× → 87,20 cada, soma exata", () => {
    const p = gerarParcelas({ valorTotal: 1046.4, nParcelas: 12, primeiraFatura: { mes: 0, ano: 2026 } });
    expect(p.every((x) => x.valor === 87.2)).toBe(true);
    expect(sumMoney(p.map((x) => x.valor))).toBe(1046.4);
  });
  it("100 em 3× → 33,33 / 33,33 / 33,34", () => {
    const p = gerarParcelas({ valorTotal: 100, nParcelas: 3, primeiraFatura: { mes: 0, ano: 2026 } });
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(sumMoney(p.map((x) => x.valor))).toBe(100);
  });
  it("valor da parcela informado → total = parcela × n", () => {
    const p = gerarParcelas({ valorParcela: 87.2, nParcelas: 12, primeiraFatura: { mes: 0, ano: 2026 } });
    expect(sumMoney(p.map((x) => x.valor))).toBe(1046.4);
  });
});

describe("statusParcela", () => {
  const bradesco = { id: "b", diaFechamento: 3, diaVencimento: 10 };
  const fev = { mes: 1, ano: 2026 };

  it("antes do fechamento: aberta", () => {
    expect(statusParcela(fev, bradesco, [], d(2026, 1, 20))).toBe("aberta");
  });
  it("fechou mas não venceu: fechada", () => {
    expect(statusParcela(fev, bradesco, [], d(2026, 2, 5))).toBe("fechada");
  });
  it("no dia do vencimento: paga", () => {
    expect(statusParcela(fev, bradesco, [], d(2026, 2, 10))).toBe("paga");
  });
  it("depois do vencimento: paga", () => {
    expect(statusParcela(fev, bradesco, [], d(2026, 3, 1))).toBe("paga");
  });
  it("marcada como paga antes do vencimento: paga", () => {
    expect(statusParcela(fev, bradesco, [{ cartaoId: "b", mes: 1, ano: 2026 }], d(2026, 2, 5))).toBe("paga");
  });
  it("marcação de outro cartão não conta", () => {
    expect(statusParcela(fev, bradesco, [{ cartaoId: "x", mes: 1, ano: 2026 }], d(2026, 2, 5))).toBe("fechada");
  });
  it("posterior à fatura aberta: futura", () => {
    expect(statusParcela({ mes: 3, ano: 2026 }, bradesco, [], d(2026, 1, 20))).toBe("futura");
  });
  it("faturaAberta respeita o fechamento", () => {
    expect(faturaAberta(bradesco, d(2026, 2, 2))).toMatchObject({ mes: 1, ano: 2026 });
    expect(faturaAberta(bradesco, d(2026, 2, 3))).toMatchObject({ mes: 2, ano: 2026 });
  });
});

describe("limiteEfetivo", () => {
  const subs = [{ slug: "manutencao", limitePadrao: 800 }];
  const orc = [{ subcategoriaSlug: "manutencao", ano: 2026, mes: 11, limite: 1200 }];

  it("sem override usa o padrão", () => {
    expect(limiteEfetivo("manutencao", 2026, 10, subs, orc)).toBe(800);
  });
  it("com override do mês usa o override", () => {
    expect(limiteEfetivo("manutencao", 2026, 11, subs, orc)).toBe(1200);
  });
  it("subcategoria desconhecida → 0", () => {
    expect(limiteEfetivo("xyz", 2026, 11, subs, orc)).toBe(0);
  });
});
