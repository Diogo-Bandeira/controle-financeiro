// Datas no fuso America/Sao_Paulo. A Edge Function roda em UTC: "hoje" sempre sai daqui, nunca de new Date() direto.

import { diasEntre, parseISODate, toISODate, type MesAno } from "../_shared/dominio/fatura.ts";

const FORMATO_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

/** "aaaa-mm-dd" de hoje em São Paulo. */
export const hojeEmSaoPaulo = (agora: Date): string => FORMATO_SP.format(agora);

export const somarDias = (iso: string, n: number): string => {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

export const diasAte = (de: string, ate: string): number => diasEntre(parseISODate(de), parseISODate(ate));

export const mesDe = (iso: string): MesAno => ({ mes: Number(iso.slice(5, 7)) - 1, ano: Number(iso.slice(0, 4)) });

/** Faixa aceita para a data de um lançamento: de −400 a +60 dias de hoje. */
export const dataNaFaixa = (iso: string, hoje: string): boolean => {
  const d = diasAte(hoje, iso);
  return d >= -400 && d <= 60;
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valida "aaaa-mm-dd" (inclusive dia existente no mês). */
export function isoValida(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [, a, me, d] = m.map(Number);
  const data = new Date(a, me - 1, d);
  return data.getFullYear() === a && data.getMonth() === me - 1 && data.getDate() === d;
}

const RELATIVAS: Record<string, number> = { hoje: 0, ontem: -1, anteontem: -2 };

/**
 * "ontem", "anteontem", "hoje", "dd/mm" ou "dd/mm/aaaa" (ou "aa") → "aaaa-mm-dd". Sem ano: ano de hoje, ou o
 * anterior se cair mais de 60 dias no futuro (ex.: "30/12" mandado em janeiro). null se não for data válida.
 */
export function resolverData(token: string, hoje: string): string | null {
  const relativa = RELATIVAS[token.toLowerCase()];
  if (relativa != null) return somarDias(hoje, relativa);

  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const montar = (ano: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

  if (m[3]) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = montar(ano);
    return isoValida(iso) ? iso : null;
  }
  const anoHoje = Number(hoje.slice(0, 4));
  const iso = montar(anoHoje);
  if (!isoValida(iso)) return null;
  if (diasAte(hoje, iso) <= 60) return iso;
  const anterior = montar(anoHoje - 1);
  return isoValida(anterior) ? anterior : null;
}
