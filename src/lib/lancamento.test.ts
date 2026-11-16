import { describe, expect, it } from "vitest";
import { ehCredito, validarLancamento, type DadosValidacao } from "./lancamento";

const dados = (d: Partial<DadosValidacao> = {}): DadosValidacao => ({
  descricao: "Cinema", valor: 50, categoria: "cartao", subcategoria: "lazer", cartaoId: "c1", parcelaOuRecorrente: false, ...d,
});

describe("validarLancamento", () => {
  it("zero é rejeitado (inclusive -0)", () => {
    expect(validarLancamento(dados({ valor: 0 }))).toBe("Informe o valor");
    expect(validarLancamento(dados({ valor: -0 }))).toBe("Informe o valor");
  });

  it("negativo é aceito em qualquer categoria e dispensa subcategoria", () => {
    expect(validarLancamento(dados({ valor: -300, subcategoria: "" }))).toBeNull();
    expect(validarLancamento(dados({ valor: -50, categoria: "variavel", cartaoId: "", subcategoria: "lazer" }))).toBeNull();
    expect(validarLancamento(dados({ valor: -10, categoria: "entrada", cartaoId: "", subcategoria: "" }))).toBeNull();
  });

  it("positivo continua exigindo subcategoria nas saídas", () => {
    expect(validarLancamento(dados({ subcategoria: "" }))).toBe("Selecione a subcategoria");
  });

  it("negativo continua exigindo cartão no cartão e não vale para parcela/recorrência", () => {
    expect(validarLancamento(dados({ valor: -50, cartaoId: "" }))).toBe("Selecione o cartão");
    expect(validarLancamento(dados({ valor: -50, parcelaOuRecorrente: true }))).toBe("Parcelas e recorrências não aceitam valor negativo");
  });
});

describe("ehCredito", () => {
  it("só saída negativa", () => {
    expect(ehCredito({ categoria: "cartao", valor: -1 })).toBe(true);
    expect(ehCredito({ categoria: "entrada", valor: -1 })).toBe(false);
    expect(ehCredito({ categoria: "variavel", valor: 1 })).toBe(false);
  });
});
