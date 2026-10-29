// Normalização e similaridade de descrições (sugestões, duplicados, importação).

export const normalizarTexto = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const palavras = (s: string): string[] => normalizarTexto(s).split(" ").filter((p) => p.length > 1);

/** Uma contém a outra ou ≥60% das palavras (do menor conjunto) em comum. */
export function descricoesParecidas(a: string, b: string): boolean {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const pa = new Set(palavras(a));
  const pb = new Set(palavras(b));
  const menor = Math.min(pa.size, pb.size);
  if (menor === 0) return false;
  const comuns = [...pa].filter((p) => pb.has(p)).length;
  return comuns / menor >= 0.6;
}

// "Parcela 3/10", "PARC 03 DE 10" em qualquer posição; "03/10" solto só no fim do texto.
const PARCELA_RE = /parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;
const PARCELA_FIM_RE = /\b(\d{1,2})\/(\d{1,2})\s*$/;

/** Detecta indicação de parcela no texto. */
export function detectarParcela(texto: string): { atual: number; total: number } | null {
  const m = texto.match(PARCELA_RE) ?? texto.match(PARCELA_FIM_RE);
  if (!m) return null;
  const atual = Number(m[1]);
  const total = Number(m[2]);
  if (atual < 1 || total < 2 || atual > total) return null;
  return { atual, total };
}

export const iniciais = (nome: string): string =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
