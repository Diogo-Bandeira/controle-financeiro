// Parsers de extrato/fatura (CSV e OFX) no cliente. Sem React/Supabase.

import { round2 } from "./money";

export interface LinhaImportada {
  data: string; // aaaa-mm-dd
  descricao: string;
  /** Valor com sinal como veio do arquivo. */
  valor: number;
}

export interface MapaColunas {
  data: number;
  descricao: number;
  valor: number;
}

export interface CsvBruto {
  delimitador: ";" | ",";
  cabecalho: string[];
  linhas: string[][];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "1.234,56" | "-12,30" | "1234.56" | "R$ (10,00)" → número. */
export function parseValor(bruto: string): number | null {
  let s = bruto.trim().replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (!s) return null;
  const negativoParenteses = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return round2(negativoParenteses ? -Math.abs(n) : n);
}

/** dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd, aaaammdd → "aaaa-mm-dd". */
export function parseData(bruto: string): string | null {
  const s = bruto.trim();
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    return validar(ano, Number(br[2]), Number(br[1]));
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return validar(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const compacto = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compacto) return validar(Number(compacto[1]), Number(compacto[2]), Number(compacto[3]));
  return null;
}

function validar(ano: number, mes: number, dia: number): string | null {
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

function dividirLinha(linha: string, delim: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === delim && !aspas) {
      campos.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  campos.push(atual.trim());
  return campos;
}

export function parseCSV(texto: string): CsvBruto {
  const linhas = texto.replace(/^\u{FEFF}/u, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const primeira = linhas[0] ?? "";
  const delimitador = (primeira.split(";").length >= primeira.split(",").length ? ";" : ",") as CsvBruto["delimitador"];
  const [cabecalho = [], ...resto] = linhas.map((l) => dividirLinha(l, delimitador));
  return { delimitador, cabecalho, linhas: resto };
}

const NOMES = {
  data: ["data", "date", "dt", "data lancamento", "data da compra"],
  descricao: ["descricao", "description", "title", "titulo", "historico", "lancamento", "estabelecimento", "memo", "nome"],
  valor: ["valor", "amount", "value", "valor (r$)", "valor r$", "quantia"],
};

const normalizarCabecalho = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function detectarColunas(cabecalho: string[]): Partial<MapaColunas> {
  const norm = cabecalho.map(normalizarCabecalho);
  const achar = (nomes: string[]) => {
    const exato = norm.findIndex((h) => nomes.includes(h));
    return exato >= 0 ? exato : norm.findIndex((h) => nomes.some((n) => h.startsWith(n)));
  };
  const mapa = { data: achar(NOMES.data), descricao: achar(NOMES.descricao), valor: achar(NOMES.valor) };
  return Object.fromEntries(Object.entries(mapa).filter(([, i]) => i >= 0));
}

export const mapaCompleto = (m: Partial<MapaColunas>): m is MapaColunas =>
  m.data != null && m.descricao != null && m.valor != null;

export function converterLinhasCSV(linhas: string[][], mapa: MapaColunas): LinhaImportada[] {
  return linhas.flatMap((l) => {
    const data = parseData(l[mapa.data] ?? "");
    const valor = parseValor(l[mapa.valor] ?? "");
    const descricao = (l[mapa.descricao] ?? "").trim();
    return data && valor != null && descricao ? [{ data, descricao, valor }] : [];
  });
}

const tagOFX = (bloco: string, tag: string): string | null => bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1].trim() ?? null;

export function parseOFX(texto: string): LinhaImportada[] {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  return blocos.flatMap((b) => {
    const data = parseData(tagOFX(b, "DTPOSTED") ?? "");
    const valor = parseValor(tagOFX(b, "TRNAMT") ?? "");
    const descricao = tagOFX(b, "MEMO") || tagOFX(b, "NAME") || "";
    return data && valor != null && descricao ? [{ data, descricao, valor }] : [];
  });
}

export const ehOFX = (nomeArquivo: string, texto: string): boolean =>
  /\.ofx$/i.test(nomeArquivo) || /<OFX>/i.test(texto);
