// Sugestão de subcategoria/cartão/categoria pelo histórico de lançamentos (formulário do site e bot do Telegram).

import { normalizarTexto } from "./texto.ts";

export interface LancamentoHistorico {
  descricao: string;
  categoria: string;
  subcategoria: string | null;
  cartaoId: string | null;
}

export interface Sugestao {
  subcategoria: string | null;
  cartaoId: string | null;
  categoria: string | null;
}

const maisComum = (valores: (string | null)[]): string | null => {
  const contagem = valores.filter((v): v is string => !!v).reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/** Subcategoria, cartão e categoria mais usados em lançamentos com descrição igual ou que começa igual. */
export function sugerir(descricao: string, historico: LancamentoHistorico[]): Sugestao | null {
  const n = normalizarTexto(descricao);
  if (n.length < 3) return null;
  const parecidos = historico.filter((l) => {
    const d = normalizarTexto(l.descricao);
    return d === n || d.startsWith(n);
  });
  return {
    subcategoria: maisComum(parecidos.map((l) => l.subcategoria)),
    cartaoId: maisComum(parecidos.map((l) => l.cartaoId)),
    categoria: maisComum(parecidos.map((l) => l.categoria)),
  };
}
