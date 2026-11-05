import { describe, expect, it } from "vitest";
import { validarSaidaIA } from "../../../supabase/functions/telegram-bot/validacao.ts";
import { CTX, HOJE } from "./fixtures";

const item = (i: Record<string, unknown> = {}) => ({
  descricao: "Mercado", valor: 130, valor_e_parcela: false, parcelas: 1, data: HOJE, tipo: "variavel",
  cartao: null, subcategoria: "alimentacao", reembolso: false, ...i,
});
const validar = (lancamentos: unknown[], extra: Record<string, unknown> = {}) =>
  validarSaidaIA({ intencao: "lancamento", lancamentos, consulta: null, duvida: null, ...extra }, CTX);

describe("validarSaidaIA", () => {
  it("aceita item válido", () => {
    expect(validar([item()]).rascunhos[0]).toMatchObject({ descricao: "Mercado", valor: 130, subcategoria: "alimentacao", tipo: "variavel" });
  });

  it("descarta valores fora da faixa e parcelas inválidas", () => {
    const r = validar([
      item({ valor: 0 }), item({ valor: -5 }), item({ valor: 100_000.01 }), item({ valor: "130" }),
      item({ valor: 40_000, valor_e_parcela: true, parcelas: 3, tipo: "cartao" }),
      item({ parcelas: 49, tipo: "cartao" }), item({ parcelas: 0 }), item({ parcelas: 2.5 }),
      item({ valor: 100_000 }),
    ]);
    expect(r.rascunhos).toHaveLength(1);
    expect(r.rascunhos[0].valor).toBe(100_000);
    expect(r.descartados).toBe(8);
  });

  it("cartão e subcategoria inexistentes viram null; existentes casam sem acento/caixa", () => {
    const [a, b] = validar([
      item({ tipo: "cartao", cartao: "Banco X", subcategoria: "inexistente" }),
      item({ tipo: "cartao", cartao: "itau", subcategoria: "Lazer" }),
    ]).rascunhos;
    expect(a).toMatchObject({ cartaoId: null, subcategoria: null });
    expect(b).toMatchObject({ cartaoId: "c-itau", subcategoria: "lazer" });
  });

  it("data inválida ou fora da faixa vira hoje", () => {
    const datas = validar([item({ data: "2020-01-01" }), item({ data: "2026-13-40" }), item({ data: "ontem" }), item({ data: "2026-10-29" })])
      .rascunhos.map((r) => r.data);
    expect(datas).toEqual([HOJE, HOJE, HOJE, "2026-10-29"]);
  });

  it("tipo inválido vira null; parcelado vira cartão; entrada sem subcategoria", () => {
    const [a, b, c] = validar([item({ tipo: "pix" }), item({ parcelas: 3, tipo: "variavel" }), item({ tipo: "entrada", reembolso: true })]).rascunhos;
    expect(a.tipo).toBeNull();
    expect(b).toMatchObject({ tipo: "cartao", parcelas: 3 });
    expect(c).toMatchObject({ tipo: "entrada", subcategoria: null, reembolso: true });
  });

  it("intenção inválida vira 'outro'; consulta converte mês 1–12 para 0–11", () => {
    expect(validarSaidaIA({ intencao: "hackear" }, CTX).intencao).toBe("outro");
    expect(validarSaidaIA(null, CTX)).toMatchObject({ intencao: "outro", rascunhos: [] });
    const c = validarSaidaIA({ intencao: "consulta", lancamentos: [], consulta: { tipo: "fatura", cartao: "Nubank", mes: 12, ano: 2026 } }, CTX);
    expect(c.consulta).toEqual({ tipo: "fatura", subcategoria: null, cartaoId: "c-nubank", mes: 11, ano: 2026 });
    const invalida = validarSaidaIA({ intencao: "consulta", consulta: { tipo: "outra" } }, CTX);
    expect(invalida.consulta).toBeNull();
  });
});
