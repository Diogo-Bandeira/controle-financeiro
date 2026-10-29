import { describe, expect, it } from "vitest";
import { lancamentosRecorrentesDoMes, recorrenciaVigente } from "./recorrencias";
import type { Recorrencia } from "./store/types";

const rec = (over: Partial<Recorrencia> = {}): Recorrencia => ({
  id: "r1",
  descricao: "Luz",
  valor: 150,
  categoria: "conta_fixa",
  subcategoria: "moradia",
  cartaoId: null,
  dia: 15,
  inicioAno: 2026,
  inicioMes: 0,
  fimAno: null,
  fimMes: null,
  reembolso: false,
  responsavel: null,
  ativo: true,
  ...over,
});

const hoje = new Date(2026, 9, 10); // 10/10/2026

describe("recorrências", () => {
  it("vigência respeita início, fim e ativo", () => {
    expect(recorrenciaVigente(rec(), { mes: 9, ano: 2026 })).toBe(true);
    expect(recorrenciaVigente(rec({ inicioMes: 10 }), { mes: 9, ano: 2026 })).toBe(false);
    expect(recorrenciaVigente(rec({ fimAno: 2026, fimMes: 8 }), { mes: 9, ano: 2026 })).toBe(false);
    expect(recorrenciaVigente(rec({ ativo: false }), { mes: 9, ano: 2026 })).toBe(false);
  });

  it("gera lançamento do mês com status pendente se a data não passou", () => {
    const [l] = lancamentosRecorrentesDoMes([rec()], [], { mes: 9, ano: 2026 }, hoje, []);
    expect(l).toMatchObject({ data: "2026-10-15", mes: 9, ano: 2026, status: "pendente", recorrenciaId: "r1", origem: "recorrente" });
  });

  it("conta fixa com data passada entra como paga", () => {
    const [l] = lancamentosRecorrentesDoMes([rec({ dia: 5 })], [], { mes: 9, ano: 2026 }, hoje, []);
    expect(l.status).toBe("pago");
  });

  it("não duplica se já existe no mês", () => {
    const existentes = [{ recorrenciaId: "r1", data: "2026-10-15" }];
    expect(lancamentosRecorrentesDoMes([rec()], existentes, { mes: 9, ano: 2026 }, hoje, [])).toHaveLength(0);
  });

  it("existente em outro mês não impede a geração", () => {
    const existentes = [{ recorrenciaId: "r1", data: "2026-09-15" }];
    expect(lancamentosRecorrentesDoMes([rec()], existentes, { mes: 9, ano: 2026 }, hoje, [])).toHaveLength(1);
  });

  it("dia 31 limitado ao último dia do mês", () => {
    const [l] = lancamentosRecorrentesDoMes([rec({ dia: 31 })], [], { mes: 1, ano: 2026 }, hoje, []);
    expect(l.data).toBe("2026-02-28");
  });

  it("recorrência no cartão usa o mês da fatura", () => {
    const cartao = { id: "c1", diaFechamento: 3, diaVencimento: 10 };
    const [l] = lancamentosRecorrentesDoMes([rec({ categoria: "cartao", cartaoId: "c1", dia: 20 })], [], { mes: 9, ano: 2026 }, hoje, [cartao]);
    expect(l).toMatchObject({ data: "2026-10-20", mes: 10, ano: 2026, cartaoId: "c1", status: "pago" });
  });
});
