import { describe, expect, it } from "vitest";
import { interpretarLancamento, interpretarLocal, lerValor } from "../../../supabase/functions/telegram-bot/parser.ts";
import { CTX } from "./fixtures";

const ler = (texto: string) => interpretarLancamento(texto, CTX);

describe("lerValor", () => {
  it.each([
    ["130", 130],
    ["130,50", 130.5],
    ["1.300,50", 1300.5],
    ["1.300", 1300],
    ["23.90", 23.9],
    ["R$130", 130],
    ["r$1.300,5", 1300.5],
  ])("%s → %d", (token, valor) => expect(lerValor(token)).toBe(valor));

  it.each(["abc", "1,2,3", "13/10", "1.30.0"])("%s não é valor", (token) => expect(lerValor(token)).toBeNull());
});

describe("interpretarLancamento", () => {
  it("descrição e valor, sem forma de pagamento", () => {
    expect(ler("mercado 130")).toMatchObject({ descricao: "Mercado", valor: 130, tipo: null, cartaoId: null, parcelas: 1, data: "2026-10-30" });
  });

  it("valores com vírgula, milhar e R$", () => {
    expect(ler("uber 23,90")?.valor).toBe(23.9);
    expect(ler("aluguel 1.300,50 boleto")).toMatchObject({ descricao: "Aluguel", valor: 1300.5, tipo: "conta_fixa" });
    expect(ler("R$ 130 mercado")).toMatchObject({ descricao: "Mercado", valor: 130 });
    expect(ler("mercado 130 reais")?.valor).toBe(130);
  });

  it("cartão por nome, com ou sem 'no' e sem acento", () => {
    expect(ler("mercado 130 nubank")).toMatchObject({ descricao: "Mercado", tipo: "cartao", cartaoId: "c-nubank" });
    expect(ler("mercado 130 no nubank")).toMatchObject({ descricao: "Mercado", cartaoId: "c-nubank" });
    expect(ler("mercado 130 itau")).toMatchObject({ cartaoId: "c-itau" });
    expect(ler("mercado 130 no Itaú")).toMatchObject({ descricao: "Mercado", cartaoId: "c-itau" });
    expect(ler("mercado 130 cartão")).toMatchObject({ tipo: "cartao", cartaoId: null });
  });

  it("parcelas: total, valor da parcela e 'em Nx'", () => {
    expect(ler("tênis 600 3x bradesco")).toMatchObject({ descricao: "Tênis", valor: 600, valorEParcela: false, parcelas: 3, tipo: "cartao", cartaoId: "c-bradesco" });
    expect(ler("tênis 3x200 bradesco")).toMatchObject({ descricao: "Tênis", valor: 200, valorEParcela: true, parcelas: 3 });
    expect(ler("tênis 600 em 3x bradesco")).toMatchObject({ descricao: "Tênis", parcelas: 3 });
    expect(ler("tênis 600 3x")).toMatchObject({ tipo: "cartao", cartaoId: null });
  });

  it("tipos por prefixo e palavras", () => {
    expect(ler("+5000 salário")).toMatchObject({ descricao: "Salário", tipo: "entrada", subcategoria: null });
    expect(ler("recebi 200 reembolso")).toMatchObject({ tipo: "entrada", reembolso: true });
    expect(ler("padaria 15 pix")).toMatchObject({ descricao: "Padaria", tipo: "variavel" });
    expect(ler("padaria 15 débito")).toMatchObject({ tipo: "variavel" });
    expect(ler("padaria 15 dinheiro")).toMatchObject({ tipo: "variavel" });
    expect(ler("conta de luz 180")).toMatchObject({ descricao: "Conta de luz", tipo: "conta_fixa" });
  });

  it("datas relativas e dd/mm(/aaaa)", () => {
    expect(ler("uber 30 ontem")?.data).toBe("2026-10-29");
    expect(ler("uber 30 anteontem")?.data).toBe("2026-10-28");
    expect(ler("uber 30 15/10")?.data).toBe("2026-10-15");
    expect(ler("uber 30 15/10/2025")?.data).toBe("2025-10-15");
    expect(ler("uber 30 31/02")).toBeNull();
  });

  it("subcategoria por palavra-chave", () => {
    expect(ler("cinema 40 lazer")).toMatchObject({ descricao: "Cinema", subcategoria: "lazer" });
    expect(ler("lazer 50")).toMatchObject({ descricao: "Lazer", subcategoria: "lazer" });
    expect(ler("remédio 30 saude")).toMatchObject({ descricao: "Remédio", subcategoria: "saude" });
    expect(ler("mercado 130")?.subcategoria).toBeNull();
  });

  it("recusa o que não é seguro", () => {
    expect(ler("mercado 130 e farmácia 45")).toBeNull();
    expect(ler("130")).toBeNull();
    expect(ler("oi tudo bem")).toBeNull();
    expect(ler("mercado 130 nubank itau")).toBeNull();
    expect(ler("tênis 3x200 600")).toBeNull();
  });
});

describe("interpretarLocal (consultas)", () => {
  it("reconhece perguntas por palavra-chave", () => {
    expect(interpretarLocal("quanto gastei em lazer?", CTX)).toEqual({
      tipo: "consulta",
      consulta: { tipo: "gasto_subcategoria", subcategoria: "lazer", cartaoId: null, mes: null, ano: null },
    });
    expect(interpretarLocal("como está a fatura do nubank?", CTX)).toMatchObject({ consulta: { tipo: "fatura", cartaoId: "c-nubank" } });
    expect(interpretarLocal("qual meu saldo?", CTX)).toMatchObject({ consulta: { tipo: "resumo_mes" } });
    expect(interpretarLocal("quanto gastei em alimentação em setembro?", CTX)).toMatchObject({
      consulta: { tipo: "gasto_subcategoria", subcategoria: "alimentacao", mes: 8, ano: 2026 },
    });
  });

  it("pergunta não reconhecida fica para a IA", () => {
    expect(interpretarLocal("quanto gastei com mercado?", CTX)).toBeNull();
  });

  it("lançamento passa pelo parser", () => {
    expect(interpretarLocal("mercado 130 nubank", CTX)).toMatchObject({ tipo: "lancamento", rascunho: { cartaoId: "c-nubank" } });
  });
});
