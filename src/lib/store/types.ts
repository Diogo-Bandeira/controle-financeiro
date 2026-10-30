// ─── Entidades do domínio (camelCase; datas como "aaaa-mm-dd") ───────────────

export type Categoria = "entrada" | "conta_fixa" | "cartao" | "variavel";
export type StatusLancamento = "pago" | "pendente";
export type OrigemLancamento = "manual" | "parcela" | "recorrente" | "importado";
export type TipoSubcategoria = "necessidade" | "desejo" | "poupanca" | "terceiros" | "doacao";
export type NivelPrioridade = "alta" | "media" | "baixa";

export interface Meta {
  id: string;
  nome: string;
  valorMeta: number;
  /** Saldo inicial; atual exibido = valorAtual + soma(aportes). */
  valorAtual: number;
  rendimento: number;
  prazo: string | null;
  /** Fração ao mês (0.009 = 0,90% a.m.). */
  taxaRendimentoMensal: number | null;
}

export interface Aporte {
  id: string;
  metaId: string;
  data: string;
  valor: number;
  lancamentoId: string | null;
}

export interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  categoria: Categoria;
  /** 0–11. Cartão: mês da fatura; demais: mês da data. */
  mes: number;
  ano: number;
  data: string;
  subcategoria: string | null;
  cartaoId: string | null;
  parcelamentoId: string | null;
  parcelaNum: number | null;
  recorrenciaId: string | null;
  status: StatusLancamento;
  reembolso: boolean;
  responsavel: string | null;
  observacao: string | null;
  origem: OrigemLancamento;
  createdBy: string | null;
}

export type NovoLancamento = Omit<Lancamento, "id" | "createdBy"> & { id?: string };

export interface Parcelamento {
  id: string;
  descricao: string;
  valorTotal: number;
  parcelas: number;
  /** Legado: parcelas pagas manualmente. Vinculado: parcelas anteriores não geradas como lançamento. */
  parcelasPagas: number;
  valorParcela: number;
  cartaoId: string | null;
  subcategoria: string | null;
  dataCompra: string | null;
  primeiraFaturaMes: number | null;
  primeiraFaturaAno: number | null;
  quitado: boolean;
  observacao: string | null;
}

export interface Prioridade {
  id: string;
  descricao: string;
  valor: number;
  prioridade: NivelPrioridade;
  concluida: boolean;
  subcategoria: string | null;
  mesPlanejado: number | null;
  anoPlanejado: number | null;
  parcelasPrevistas: number;
  cartaoId: string | null;
  link: string | null;
  observacao: string | null;
  ordem: number | null;
  valorPago: number | null;
  lancamentoId: string | null;
  parcelamentoId: string | null;
}

export interface Cartao {
  id: string;
  nome: string;
  banco: string | null;
  cor: string | null;
  diaFechamento: number | null;
  diaVencimento: number | null;
  limite: number | null;
  titular: string | null;
  ativo: boolean;
}

export interface Subcategoria {
  id: string;
  slug: string;
  label: string;
  cor: string;
  limitePadrao: number;
  tipo: TipoSubcategoria | null;
  contaNoOrcamento: boolean;
  ordem: number | null;
  ativa: boolean;
}

export interface Orcamento {
  id: string;
  subcategoriaSlug: string;
  ano: number;
  mes: number;
  limite: number;
}

export interface Recorrencia {
  id: string;
  descricao: string;
  valor: number;
  categoria: Categoria;
  subcategoria: string | null;
  cartaoId: string | null;
  dia: number;
  inicioAno: number;
  inicioMes: number;
  fimAno: number | null;
  fimMes: number | null;
  reembolso: boolean;
  responsavel: string | null;
  ativo: boolean;
}

/** Mês (da data) em que a recorrência não é gerada: o lançamento foi excluído só naquele mês. */
export interface RecorrenciaExcecao {
  id: string;
  recorrenciaId: string;
  ano: number;
  mes: number;
}

export interface FaturaPaga {
  id: string;
  cartaoId: string;
  ano: number;
  mes: number;
  pagoEm: string;
}

export interface Membro {
  userId: string;
  nome: string;
}

export interface Household {
  id: string;
  nome: string;
  codigoConvite: string | null;
}
