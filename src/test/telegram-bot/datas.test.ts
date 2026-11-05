import { describe, expect, it } from "vitest";
import { dataNaFaixa, hojeEmSaoPaulo, resolverData } from "../../../supabase/functions/telegram-bot/datas.ts";

describe("hojeEmSaoPaulo", () => {
  it("antes da meia-noite em São Paulo ainda é o dia anterior em UTC+0", () => {
    expect(hojeEmSaoPaulo(new Date("2026-10-31T02:59:59Z"))).toBe("2026-10-30");
    expect(hojeEmSaoPaulo(new Date("2026-10-31T03:00:00Z"))).toBe("2026-10-31");
  });

  it("virada de mês e de ano", () => {
    expect(hojeEmSaoPaulo(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10-31");
    expect(hojeEmSaoPaulo(new Date("2027-01-01T02:30:00Z"))).toBe("2026-12-31");
  });
});

describe("resolverData", () => {
  it("relativas atravessando o mês", () => {
    expect(resolverData("ontem", "2026-11-01")).toBe("2026-10-31");
    expect(resolverData("anteontem", "2026-03-01")).toBe("2026-02-27");
    expect(resolverData("hoje", "2026-10-30")).toBe("2026-10-30");
  });

  it("dd/mm sem ano: ano anterior se cair muito no futuro", () => {
    expect(resolverData("30/12", "2027-01-05")).toBe("2026-12-30");
    expect(resolverData("15/11", "2026-10-30")).toBe("2026-11-15");
  });

  it("dd/mm/aa e dd/mm/aaaa; inválidas → null", () => {
    expect(resolverData("05/01/27", "2026-10-30")).toBe("2027-01-05");
    expect(resolverData("29/02/2027", "2026-10-30")).toBeNull();
    expect(resolverData("32/01", "2026-10-30")).toBeNull();
    expect(resolverData("mercado", "2026-10-30")).toBeNull();
  });
});

describe("dataNaFaixa", () => {
  it("−400 a +60 dias", () => {
    expect(dataNaFaixa("2025-09-25", "2026-10-30")).toBe(true);
    expect(dataNaFaixa("2025-09-24", "2026-10-30")).toBe(false);
    expect(dataNaFaixa("2026-12-29", "2026-10-30")).toBe(true);
    expect(dataNaFaixa("2026-12-30", "2026-10-30")).toBe(false);
  });
});
