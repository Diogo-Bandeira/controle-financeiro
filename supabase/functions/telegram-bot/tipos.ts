// Tipos do bot do Telegram. Convenção: mes 0–11 (Janeiro = 0); datas "aaaa-mm-dd" no fuso de São Paulo.

export type Categoria = "entrada" | "conta_fixa" | "cartao" | "variavel";
export const CATEGORIAS_VALIDAS: Categoria[] = ["entrada", "conta_fixa", "cartao", "variavel"];

export interface CartaoBot {
  id: string;
  nome: string;
  diaFechamento: number | null;
  diaVencimento: number | null;
}

export interface SubcategoriaBot {
  slug: string;
  label: string;
  limitePadrao: number;
  contaNoOrcamento: boolean;
}

export interface Vinculo {
  id: string;
  householdId: string;
  userId: string;
  chatId: number;
  nomeExibicao: string | null;
}

/** Lançamento interpretado (parser local ou IA), possivelmente incompleto. */
export interface Rascunho {
  descricao: string;
  valor: number;
  /** true: `valor` é o da parcela (ex.: "3x200"); false: valor total. */
  valorEParcela: boolean;
  parcelas: number;
  data: string;
  tipo: Categoria | null;
  cartaoId: string | null;
  subcategoria: string | null;
  reembolso: boolean;
}

export type TipoConsulta = "gasto_subcategoria" | "limites" | "fatura" | "resumo_mes";

export interface Consulta {
  tipo: TipoConsulta;
  subcategoria: string | null;
  cartaoId: string | null;
  /** 0–11; null = mês atual. */
  mes: number | null;
  ano: number | null;
}

/** Linha de lançamento no formato das RPCs (snake_case). */
export interface LinhaLancamento {
  id?: string;
  descricao: string;
  valor: number;
  categoria: Categoria;
  mes: number;
  ano: number;
  data: string;
  subcategoria: string | null;
  cartao_id: string | null;
  parcelamento_id?: string | null;
  parcela_num?: number | null;
  status: "pago" | "pendente";
  reembolso: boolean;
  responsavel: string | null;
  observacao: string | null;
  origem: string;
}

export interface LinhaParcelamento {
  id?: string;
  descricao: string;
  valor_total: number;
  parcelas: number;
  parcelas_pagas: number;
  valor_parcela: number;
  cartao_id: string;
  subcategoria: string | null;
  data_compra: string;
  primeira_fatura_mes: number;
  primeira_fatura_ano: number;
  quitado: boolean;
  observacao: string | null;
}

/** Lançamento já gravado (com id), lido do banco. */
export type LancamentoGravado = LinhaLancamento & { id: string };

export interface LancamentoMes {
  categoria: Categoria;
  subcategoria: string | null;
  cartaoId: string | null;
  valor: number;
  mes: number;
  ano: number;
}

export interface OrcamentoBot {
  subcategoriaSlug: string;
  mes: number;
  ano: number;
  limite: number;
}

export type Botao = { text: string; callback_data: string };
export type Teclado = Botao[][];
