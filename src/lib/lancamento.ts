// Regras do lançamento avulso (formulário e exibição). Sem React.

import type { Categoria, Lancamento } from "./store/types";

type ValorDoLancamento = Pick<Lancamento, "categoria" | "valor">;

/** Saída com valor negativo: estorno, crédito ou pagamento antecipado de fatura (abate o total). */
export const ehCredito = (l: ValorDoLancamento): boolean => l.categoria !== "entrada" && l.valor < 0;

export interface DadosValidacao {
  descricao: string;
  valor: number;
  categoria: Categoria;
  subcategoria: string;
  cartaoId: string;
  /** Parcela de parcelamento ou lançamento de recorrência: só valor positivo. */
  parcelaOuRecorrente: boolean;
}

/** Primeiro erro ou null. Zero nunca vale; negativo dispensa subcategoria. */
export function validarLancamento(d: DadosValidacao): string | null {
  const negativo = d.valor < 0;
  if (!d.descricao.trim()) return "Informe a descrição";
  if (d.valor === 0) return "Informe o valor";
  if (negativo && d.parcelaOuRecorrente) return "Parcelas e recorrências não aceitam valor negativo";
  if (d.categoria !== "entrada" && !negativo && !d.subcategoria) return "Selecione a subcategoria";
  if (d.categoria === "cartao" && !d.cartaoId) return "Selecione o cartão";
  return null;
}
