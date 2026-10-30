import { describe, expect, it } from "vitest";
import {
  editadoIndividualmente, futurosForaDaVigencia, lancamentosRecorrentesDaJanela, lancamentosRecorrentesDoMes, propagarEdicao, recorrenciaVigente,
} from "./recorrencias";
import type { Lancamento, Recorrencia } from "./store/types";

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

const lanc = (over: Partial<Lancamento> = {}): Lancamento => ({
  id: "l1",
  descricao: "Luz",
  valor: 150,
  categoria: "conta_fixa",
  mes: 10,
  ano: 2026,
  data: "2026-11-15",
  subcategoria: "moradia",
  cartaoId: null,
  parcelamentoId: null,
  parcelaNum: null,
  recorrenciaId: "r1",
  status: "pendente",
  reembolso: false,
  responsavel: null,
  observacao: null,
  origem: "recorrente",
  createdBy: null,
  ...over,
});

const hoje = new Date(2026, 9, 10); // 10/10/2026
const cartao = { id: "c1", diaFechamento: 3, diaVencimento: 10 };

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

  it("não duplica se já existe no mês", () => {
    const existentes = [{ recorrenciaId: "r1", data: "2026-10-15" }];
    expect(lancamentosRecorrentesDoMes([rec()], existentes, { mes: 9, ano: 2026 }, hoje, [])).toHaveLength(0);
  });

  it("existente em outro mês não impede a geração", () => {
    const existentes = [{ recorrenciaId: "r1", data: "2026-09-15" }];
    expect(lancamentosRecorrentesDoMes([rec()], existentes, { mes: 9, ano: 2026 }, hoje, [])).toHaveLength(1);
  });

  it("exceção do mês impede a geração avulsa", () => {
    const excecoes = [{ recorrenciaId: "r1", mes: 9, ano: 2026 }];
    expect(lancamentosRecorrentesDoMes([rec()], [], { mes: 9, ano: 2026 }, hoje, [], excecoes)).toHaveLength(0);
  });
});

describe("janela de 6 meses", () => {
  it("a partir de out/2026 gera out/2026 → mar/2027 (virada de ano)", () => {
    const ls = lancamentosRecorrentesDaJanela([rec()], [], [], new Date(2026, 9, 30), []);
    expect(ls.map((l) => l.data)).toEqual(["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"]);
    expect(ls.map((l) => [l.mes, l.ano])).toEqual([[9, 2026], [10, 2026], [11, 2026], [0, 2027], [1, 2027], [2, 2027]]);
  });

  it("não duplica o que já existe e respeita exceções", () => {
    const existentes = [{ recorrenciaId: "r1", data: "2026-11-15" }, { recorrenciaId: "outra", data: "2026-12-15" }];
    const excecoes = [{ recorrenciaId: "r1", mes: 0, ano: 2027 }];
    const ls = lancamentosRecorrentesDaJanela([rec()], existentes, excecoes, hoje, []);
    expect(ls.map((l) => l.data)).toEqual(["2026-10-15", "2026-12-15", "2027-02-15", "2027-03-15"]);
  });

  it("respeita início e fim (fim no meio da janela gera só até o fim)", () => {
    const ls = lancamentosRecorrentesDaJanela([rec({ inicioMes: 11, fimMes: 1, fimAno: 2027 })], [], [], hoje, []);
    expect(ls.map((l) => l.data)).toEqual(["2026-12-15", "2027-01-15", "2027-02-15"]);
  });

  it("inativa não gera nada", () => {
    expect(lancamentosRecorrentesDaJanela([rec({ ativo: false })], [], [], hoje, [])).toHaveLength(0);
  });

  it("dia 31 limitado ao último dia em fevereiro de 2027 e de 2028 (bissexto)", () => {
    const fev27 = lancamentosRecorrentesDaJanela([rec({ dia: 31 })], [], [], hoje, []).find((l) => l.data.startsWith("2027-02"));
    const fev28 = lancamentosRecorrentesDaJanela([rec({ dia: 31 })], [], [], new Date(2027, 9, 1), []).find((l) => l.data.startsWith("2028-02"));
    expect(fev27?.data).toBe("2027-02-28");
    expect(fev28?.data).toBe("2028-02-29");
  });

  it("no cartão o mes/ano vem da fatura (fecha 3, vence 10; dia 5 → fatura do mês seguinte)", () => {
    const ls = lancamentosRecorrentesDaJanela([rec({ categoria: "cartao", cartaoId: "c1", dia: 5 })], [], [], hoje, [cartao]);
    expect(ls[0]).toMatchObject({ data: "2026-10-05", mes: 10, ano: 2026, cartaoId: "c1" });
    expect(ls[5]).toMatchObject({ data: "2027-03-05", mes: 3, ano: 2027 });
    // Status do cartão é derivado da fatura; o campo fica "pago" mesmo no futuro.
    expect(ls.every((l) => l.status === "pago")).toBe(true);
  });

  it("status: data futura → pendente em qualquer categoria; data <= hoje → regra atual (pago)", () => {
    const recs = [
      rec({ id: "fixa-passada", dia: 5 }),
      rec({ id: "fixa-hoje", dia: 10 }),
      rec({ id: "fixa-futura", dia: 15 }),
      rec({ id: "entrada", categoria: "entrada", subcategoria: null, dia: 20 }),
      rec({ id: "variavel-passada", categoria: "variavel", dia: 1 }),
    ];
    const ls = lancamentosRecorrentesDaJanela(recs, [], [], hoje, []);
    const status = (id: string, mes: number) => ls.find((l) => l.recorrenciaId === id && l.data.slice(5, 7) === String(mes).padStart(2, "0"))?.status;
    expect(status("fixa-passada", 10)).toBe("pago");
    expect(status("fixa-hoje", 10)).toBe("pago");
    expect(status("fixa-futura", 10)).toBe("pendente");
    expect(status("entrada", 10)).toBe("pendente");
    expect(status("variavel-passada", 10)).toBe("pago");
    expect(status("variavel-passada", 11)).toBe("pendente");
  });
});

describe("edição da recorrência", () => {
  it("detecta lançamento editado individualmente (valor ou descrição diferentes)", () => {
    expect(editadoIndividualmente(lanc(), rec())).toBe(false);
    expect(editadoIndividualmente(lanc({ valor: 150.0000001 }), rec())).toBe(false);
    expect(editadoIndividualmente(lanc({ valor: 180 }), rec())).toBe(true);
    expect(editadoIndividualmente(lanc({ descricao: "Luz (bandeira vermelha)" }), rec())).toBe(true);
  });

  it("propaga para os futuros não editados, recalculando a data pelo novo dia", () => {
    const lancamentos = [
      lanc({ id: "passado", data: "2026-10-05", mes: 9, status: "pago" }),
      lanc({ id: "futuro" }),
      lanc({ id: "editado", data: "2026-12-15", mes: 11, valor: 180 }),
    ];
    const atualizados = propagarEdicao(rec(), rec({ valor: 200, dia: 20 }), lancamentos, hoje, []);
    expect(atualizados).toHaveLength(1);
    expect(atualizados[0]).toMatchObject({ id: "futuro", valor: 200, data: "2026-11-20", mes: 10, ano: 2026 });
  });

  it("trocar para cartão recalcula a competência pela fatura", () => {
    const [l] = propagarEdicao(rec(), rec({ categoria: "cartao", cartaoId: "c1", dia: 5 }), [lanc()], hoje, [cartao]);
    expect(l).toMatchObject({ data: "2026-11-05", mes: 11, ano: 2026, cartaoId: "c1", categoria: "cartao", status: "pago" });
  });

  it("não devolve nada se a edição não muda o lançamento", () => {
    expect(propagarEdicao(rec(), rec({ fimMes: 5, fimAno: 2027 }), [lanc()], hoje, [])).toHaveLength(0);
  });

  it("pausar marca para remoção só os futuros pendentes", () => {
    const lancamentos = [
      lanc({ id: "passado", data: "2026-10-05", mes: 9, status: "pendente" }),
      lanc({ id: "pendente" }),
      lanc({ id: "pago", data: "2026-12-15", mes: 11, status: "pago" }),
    ];
    const apagar = futurosForaDaVigencia(rec({ ativo: false }), lancamentos, hoje, (l) => l.status === "pago");
    expect(apagar.map((l) => l.id)).toEqual(["pendente"]);
  });
});
