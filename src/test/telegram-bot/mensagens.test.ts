import { describe, expect, it } from "vitest";
import { agruparGravados, formatarConfirmacao, linhaUso, tecladoConfirmacao, tecladoOpcoes } from "../../../supabase/functions/telegram-bot/mensagens.ts";
import type { LancamentoGravado } from "../../../supabase/functions/telegram-bot/tipos.ts";
import { CARTOES, SUBCATEGORIAS } from "./fixtures";

const lanc = (l: Partial<LancamentoGravado> = {}): LancamentoGravado => ({
  id: "l1", descricao: "Mercado", valor: 130, categoria: "cartao", mes: 11, ano: 2026, data: "2026-11-05", subcategoria: "alimentacao",
  cartao_id: "c-nubank", parcelamento_id: null, parcela_num: null, status: "pago", reembolso: false, responsavel: "Ana", observacao: null,
  origem: "telegram", ...l,
});
const ctx = { cartoes: CARTOES, subcategorias: SUBCATEGORIAS, mesAtual: { mes: 11, ano: 2026 } };
const uso = (gasto: number, limite = 1880) => ({ slug: "alimentacao", label: "Alimentação", competencia: { mes: 11, ano: 2026 }, gasto, limite, contaNoOrcamento: true });

describe("formatarConfirmacao", () => {
  it("cartão à vista com fatura, vencimento e uso do mês", () => {
    const [item] = agruparGravados([lanc()]);
    expect(formatarConfirmacao([{ item, uso: uso(812.4) }], ctx)).toBe(
      "Lançado ✅\n<b>Mercado</b> — R$ 130,00\nAlimentação · Nubank · fatura de dez/2026 (vence 10/12)\nAlimentação no mês: R$ 812,40 de R$ 1.880,00 (43%)",
    );
  });

  it("parcelado: N× valor e meses da primeira à última", () => {
    const parcelas = [12, 0, 1].map((_, i) =>
      lanc({ id: `p${i}`, descricao: "Tênis", valor: 200, parcelamento_id: "pa1", parcela_num: i + 1, cartao_id: "c-bradesco", mes: (11 + i) % 12, ano: i === 0 ? 2026 : 2027, subcategoria: "gastos_extras" }),
    );
    const itens = agruparGravados(parcelas.reverse());
    expect(itens).toHaveLength(1);
    expect(formatarConfirmacao([{ item: itens[0], uso: null }], ctx)).toBe(
      "Lançado ✅\n<b>Tênis</b> — 3× R$ 200,00 · Bradesco · de dez/2026 a fev/2027\nGastos Extras / Parcelamentos · compra em 05/11",
    );
  });

  it("variável pendente, entrada e escape de HTML", () => {
    const itens = agruparGravados([
      lanc({ id: "a", categoria: "variavel", cartao_id: null, status: "pendente", descricao: "Luz <casa>" }),
      lanc({ id: "b", categoria: "entrada", cartao_id: null, subcategoria: null, reembolso: true, descricao: "Pix João" }),
    ]);
    const texto = formatarConfirmacao(itens.map((item) => ({ item, uso: null })), ctx);
    expect(texto).toContain("Lançados ✅ (2)");
    expect(texto).toContain("<b>Luz &lt;casa&gt;</b> — R$ 130,00\nAlimentação · Pix/Débito/Dinheiro · 05/11 · pendente");
    expect(texto).toContain("Entrada · 05/11 · reembolso");
  });
});

describe("linhaUso", () => {
  it("alerta a partir de 80% e acima de 100%; outro mês e sem limite", () => {
    expect(linhaUso(uso(1600), ctx.mesAtual)).toContain("(85%) ⚠️ perto do limite");
    expect(linhaUso(uso(2000), ctx.mesAtual)).toContain("(106%) 🚨 passou do limite");
    expect(linhaUso({ ...uso(10), competencia: { mes: 0, ano: 2027 } }, ctx.mesAtual)).toMatch(/^Alimentação em jan\/2027:/);
    expect(linhaUso(uso(50, 0), ctx.mesAtual)).toBe("Alimentação no mês: R$ 50,00 (sem limite)");
  });
});

describe("teclados", () => {
  it("confirmação: desfazer + trocas só com um item; trocar cartão só no cartão", () => {
    const cartao = agruparGravados([lanc()]);
    expect(tecladoConfirmacao("m1", cartao).flat().map((b) => b.callback_data)).toEqual(["d:m1", "s:m1", "c:m1"]);
    const variavel = agruparGravados([lanc({ categoria: "variavel", cartao_id: null })]);
    expect(tecladoConfirmacao("m1", variavel).flat().map((b) => b.callback_data)).toEqual(["d:m1", "s:m1"]);
    expect(tecladoConfirmacao("m1", agruparGravados([lanc(), lanc({ id: "l2" })])).flat()).toHaveLength(1);
  });

  it("opções: 8 visíveis + Outras + Cancelar; callback_data cabe em 64 bytes", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const rotulos = Array.from({ length: 12 }, (_, i) => `Sub ${i}`);
    const botoes = tecladoOpcoes(id, rotulos, false).flat();
    expect(botoes.map((b) => b.text)).toContain("Outras…");
    expect(botoes).toHaveLength(10);
    expect(Math.max(...tecladoOpcoes(id, rotulos).flat().map((b) => new TextEncoder().encode(b.callback_data).length))).toBeLessThanOrEqual(64);
  });
});
