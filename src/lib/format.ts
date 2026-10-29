// Formatação e constantes de exibição.

import type { Categoria, TipoSubcategoria } from "./store/types";

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const DIAS_SEMANA_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const CATEGORIAS: Record<Categoria, string> = { entrada: "Entradas", conta_fixa: "Contas Fixas", cartao: "Compras no Cartão", variavel: "Variáveis" };

export const TIPOS_SUBCATEGORIA: Record<TipoSubcategoria, string> = {
  necessidade: "Necessidade",
  desejo: "Desejo",
  poupanca: "Poupança",
  terceiros: "Terceiros",
  doacao: "Doação",
};

export const PALETA_CORES = ["#10B981", "#84CC16", "#EF4444", "#F97316", "#F59E0B", "#A16207", "#EC4899", "#3B82F6", "#8B5CF6", "#06B6D4", "#64748B", "#14B8A6", "#0EA5E9", "#D946EF", "#22C55E", "#E11D48"];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

let valoresOcultos = false;

/** Controlado pelo toggle "Ocultar valores" (store). */
export function definirValoresOcultos(v: boolean) {
  valoresOcultos = v;
}

export function formatCurrency(value: number): string {
  return valoresOcultos ? "R$ •••••" : brl.format(value);
}

/** "fev/2026" */
export const formatMesAno = (mes: number, ano: number): string => `${MESES_CURTOS[mes]}/${ano}`;

/** "aaaa-mm-dd" → "dd/mm" */
export const formatDiaMes = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "aaaa-mm-dd" → "dd/mm/aaaa" */
export const formatDataBR = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const formatDiaMesData = (d: Date): string => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

export const lerLocalStorage = <T,>(chave: string, padrao: T): T => {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto == null ? padrao : (JSON.parse(bruto) as T);
  } catch {
    return padrao;
  }
};

export const gravarLocalStorage = (chave: string, valor: unknown) => {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // armazenamento indisponível: ignora
  }
};
