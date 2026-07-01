export interface Meta {
  id: string
  nome: string
  valorMeta: number
  valorAtual: number
  rendimento: number
}

export interface Lancamento {
  id: string
  descricao: string
  valor: number
  categoria: 'entrada' | 'dizimo' | 'conta_fixa' | 'cartao' | 'variavel'
  subcategoria?: string | null
  mes: number
  ano: number
}

export interface Parcelamento {
  id: string
  descricao: string
  valorTotal: number
  valorParcela: number
  parcelas: number
  parcelasPagas: number
}

export interface Prioridade {
  id: string
  descricao: string
  valor: number
  prioridade: 'alta' | 'media' | 'baixa'
  concluida: boolean
}

export const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

export const CATEGORIAS = {
  entrada:    'Entradas',
  dizimo:     'Dízimos',
  conta_fixa: 'Contas Fixas',
  cartao:     'Cartões',
  variavel:   'Variáveis',
} as const

export const SUBCATEGORIAS = [
  { valor: 'lazer',            label: 'Lazer',           cor: '#8B5CF6' },
  { valor: 'gasolina',         label: 'Gasolina',        cor: '#F59E0B' },
  { valor: 'alimentacao',      label: 'Alimentação',     cor: '#10B981' },
  { valor: 'gastos_pessoais',  label: 'Gastos Pessoais', cor: '#EC4899' },
  { valor: 'saude',            label: 'Saúde',           cor: '#3B82F6' },
  { valor: 'assinaturas',      label: 'Assinaturas',     cor: '#06B6D4' },
  { valor: 'vestuario',        label: 'Vestuário',       cor: '#EF4444' },
]