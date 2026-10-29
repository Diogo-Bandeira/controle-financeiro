import { describe, expect, it } from "vitest";
import { converterLinhasCSV, detectarColunas, mapaCompleto, parseCSV, parseData, parseOFX, parseValor } from "./importacao";
import { descricoesParecidas, detectarParcela } from "./texto";

describe("importação", () => {
  it("parseValor aceita formatos BR e US", () => {
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("-12,30")).toBe(-12.3);
    expect(parseValor("1234.56")).toBe(1234.56);
    expect(parseValor("R$ (10,00)")).toBe(-10);
    expect(parseValor("abc")).toBeNull();
  });

  it("parseData aceita dd/mm/aaaa, aaaa-mm-dd e OFX", () => {
    expect(parseData("05/01/2026")).toBe("2026-01-05");
    expect(parseData("2026-01-05")).toBe("2026-01-05");
    expect(parseData("20260105120000[-3:BRT]")).toBe("2026-01-05");
    expect(parseData("31/02/2026")).toBeNull();
  });

  it("CSV com ; e cabeçalho em português", () => {
    const csv = "﻿Data;Descrição;Valor\n05/01/2026;IFOOD *REST;45,90\n06/01/2026;\"LOJA; X\";1.200,00\n";
    const bruto = parseCSV(csv);
    expect(bruto.delimitador).toBe(";");
    const mapa = detectarColunas(bruto.cabecalho);
    expect(mapaCompleto(mapa)).toBe(true);
    if (!mapaCompleto(mapa)) return;
    expect(converterLinhasCSV(bruto.linhas, mapa)).toEqual([
      { data: "2026-01-05", descricao: "IFOOD *REST", valor: 45.9 },
      { data: "2026-01-06", descricao: "LOJA; X", valor: 1200 },
    ]);
  });

  it("CSV com , (Nubank)", () => {
    const bruto = parseCSV("date,title,amount\n2026-01-05,Uber,23.50\n");
    expect(bruto.delimitador).toBe(",");
    const mapa = detectarColunas(bruto.cabecalho);
    expect(mapa).toEqual({ data: 0, descricao: 1, valor: 2 });
  });

  it("OFX extrai STMTTRN", () => {
    const ofx = `<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260110<TRNAMT>-89.90<MEMO>MERCADO BOM</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260111120000[-3:BRT]
<TRNAMT>1500,00
<NAME>SALARIO
</STMTTRN>
</BANKTRANLIST></OFX>`;
    expect(parseOFX(ofx)).toEqual([
      { data: "2026-01-10", descricao: "MERCADO BOM", valor: -89.9 },
      { data: "2026-01-11", descricao: "SALARIO", valor: 1500 },
    ]);
  });

  it("detecta parcela no texto", () => {
    expect(detectarParcela("LOJA X PARC 03/10")).toEqual({ atual: 3, total: 10 });
    expect(detectarParcela("Notebook Parcela 7 de 12")).toEqual({ atual: 7, total: 12 });
    expect(detectarParcela("MAGALU 02/05")).toEqual({ atual: 2, total: 5 });
    expect(detectarParcela("Padaria")).toBeNull();
  });

  it("descrições parecidas", () => {
    expect(descricoesParecidas("Geladeira Brastemp", "GELADEIRA brastemp 3/10")).toBe(true);
    expect(descricoesParecidas("Notebook Dell Inspiron", "Dell Inspiron")).toBe(true);
    expect(descricoesParecidas("Mercado", "Farmácia")).toBe(false);
  });
});
