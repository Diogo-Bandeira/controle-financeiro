// Um mapper por entidade: linha do banco (snake_case) ↔ entidade (camelCase).

import type { Database } from "@/integrations/supabase/types";
import type {
  Aporte, Cartao, FaturaPaga, Lancamento, Meta, NovoLancamento, Orcamento, Parcelamento, Prioridade, Recorrencia, Subcategoria,
} from "./types";

type Tabelas = Database["public"]["Tables"];
type Row<T extends keyof Tabelas> = Tabelas[T]["Row"];
type Insert<T extends keyof Tabelas> = Omit<Tabelas[T]["Insert"], "household_id">;

const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

export const mapMeta = (r: Row<"metas">): Meta => ({
  id: r.id,
  nome: r.nome,
  valorMeta: Number(r.valor_meta),
  valorAtual: Number(r.valor_atual),
  rendimento: Number(r.rendimento),
  prazo: r.prazo,
  taxaRendimentoMensal: num(r.taxa_rendimento_mensal),
});
export const metaToRow = (m: Omit<Meta, "id">): Insert<"metas"> => ({
  nome: m.nome,
  valor_meta: m.valorMeta,
  valor_atual: m.valorAtual,
  rendimento: m.rendimento,
  prazo: m.prazo,
  taxa_rendimento_mensal: m.taxaRendimentoMensal,
});

export const mapAporte = (r: Row<"aportes">): Aporte => ({
  id: r.id, metaId: r.meta_id, data: r.data, valor: Number(r.valor), lancamentoId: r.lancamento_id,
});
export const aporteToRow = (a: Omit<Aporte, "id">): Insert<"aportes"> => ({
  meta_id: a.metaId, data: a.data, valor: a.valor, lancamento_id: a.lancamentoId,
});

export const mapLancamento = (r: Row<"lancamentos">): Lancamento => ({
  id: r.id,
  descricao: r.descricao,
  valor: Number(r.valor),
  categoria: r.categoria as Lancamento["categoria"],
  mes: r.mes,
  ano: r.ano,
  data: r.data,
  subcategoria: r.subcategoria,
  cartaoId: r.cartao_id,
  parcelamentoId: r.parcelamento_id,
  parcelaNum: r.parcela_num,
  recorrenciaId: r.recorrencia_id,
  status: r.status as Lancamento["status"],
  reembolso: r.reembolso,
  responsavel: r.responsavel,
  observacao: r.observacao,
  origem: r.origem as Lancamento["origem"],
  createdBy: r.created_by,
});
export const lancamentoToRow = (l: NovoLancamento | Lancamento): Insert<"lancamentos"> => ({
  ...(l.id ? { id: l.id } : {}),
  descricao: l.descricao,
  valor: l.valor,
  categoria: l.categoria,
  mes: l.mes,
  ano: l.ano,
  data: l.data,
  subcategoria: l.subcategoria,
  cartao_id: l.cartaoId,
  parcelamento_id: l.parcelamentoId,
  parcela_num: l.parcelaNum,
  recorrencia_id: l.recorrenciaId,
  status: l.status,
  reembolso: l.reembolso,
  responsavel: l.responsavel,
  observacao: l.observacao,
  origem: l.origem,
});

export const mapParcelamento = (r: Row<"parcelamentos">): Parcelamento => ({
  id: r.id,
  descricao: r.descricao,
  valorTotal: Number(r.valor_total),
  parcelas: r.parcelas,
  parcelasPagas: r.parcelas_pagas,
  valorParcela: Number(r.valor_parcela),
  cartaoId: r.cartao_id,
  subcategoria: r.subcategoria,
  dataCompra: r.data_compra,
  primeiraFaturaMes: r.primeira_fatura_mes,
  primeiraFaturaAno: r.primeira_fatura_ano,
  quitado: r.quitado,
  observacao: r.observacao,
});
export const parcelamentoToRow = (p: Omit<Parcelamento, "id"> & { id?: string }): Insert<"parcelamentos"> => ({
  ...(p.id ? { id: p.id } : {}),
  descricao: p.descricao,
  valor_total: p.valorTotal,
  parcelas: p.parcelas,
  parcelas_pagas: p.parcelasPagas,
  valor_parcela: p.valorParcela,
  cartao_id: p.cartaoId,
  subcategoria: p.subcategoria,
  data_compra: p.dataCompra,
  primeira_fatura_mes: p.primeiraFaturaMes,
  primeira_fatura_ano: p.primeiraFaturaAno,
  quitado: p.quitado,
  observacao: p.observacao,
});

export const mapPrioridade = (r: Row<"prioridades">): Prioridade => ({
  id: r.id,
  descricao: r.descricao,
  valor: Number(r.valor),
  prioridade: r.prioridade as Prioridade["prioridade"],
  concluida: r.concluida,
  subcategoria: r.subcategoria,
  mesPlanejado: r.mes_planejado,
  anoPlanejado: r.ano_planejado,
  parcelasPrevistas: r.parcelas_previstas,
  cartaoId: r.cartao_id,
  link: r.link,
  observacao: r.observacao,
  ordem: r.ordem,
  valorPago: num(r.valor_pago),
  lancamentoId: r.lancamento_id,
  parcelamentoId: r.parcelamento_id,
});
export const prioridadeToRow = (p: Omit<Prioridade, "id">): Insert<"prioridades"> => ({
  descricao: p.descricao,
  valor: p.valor,
  prioridade: p.prioridade,
  concluida: p.concluida,
  subcategoria: p.subcategoria,
  mes_planejado: p.mesPlanejado,
  ano_planejado: p.anoPlanejado,
  parcelas_previstas: p.parcelasPrevistas,
  cartao_id: p.cartaoId,
  link: p.link,
  observacao: p.observacao,
  ordem: p.ordem,
  valor_pago: p.valorPago,
  lancamento_id: p.lancamentoId,
  parcelamento_id: p.parcelamentoId,
});

export const mapCartao = (r: Row<"cartoes">): Cartao => ({
  id: r.id,
  nome: r.nome,
  banco: r.banco,
  cor: r.cor,
  diaFechamento: r.dia_fechamento,
  diaVencimento: r.dia_vencimento,
  limite: num(r.limite),
  titular: r.titular,
  ativo: r.ativo,
});
export const cartaoToRow = (c: Omit<Cartao, "id">): Insert<"cartoes"> => ({
  nome: c.nome,
  banco: c.banco,
  cor: c.cor,
  dia_fechamento: c.diaFechamento,
  dia_vencimento: c.diaVencimento,
  limite: c.limite,
  titular: c.titular,
  ativo: c.ativo,
});

export const mapSubcategoria = (r: Row<"subcategorias">): Subcategoria => ({
  id: r.id,
  slug: r.slug,
  label: r.label,
  cor: r.cor,
  limitePadrao: Number(r.limite_padrao),
  tipo: r.tipo as Subcategoria["tipo"],
  contaNoOrcamento: r.conta_no_orcamento,
  ordem: r.ordem,
  ativa: r.ativa,
});
export const subcategoriaToRow = (s: Omit<Subcategoria, "id">): Insert<"subcategorias"> => ({
  slug: s.slug,
  label: s.label,
  cor: s.cor,
  limite_padrao: s.limitePadrao,
  tipo: s.tipo,
  conta_no_orcamento: s.contaNoOrcamento,
  ordem: s.ordem,
  ativa: s.ativa,
});

export const mapOrcamento = (r: Row<"orcamentos">): Orcamento => ({
  id: r.id, subcategoriaSlug: r.subcategoria_slug, ano: r.ano, mes: r.mes, limite: Number(r.limite),
});
export const orcamentoToRow = (o: Omit<Orcamento, "id">): Insert<"orcamentos"> => ({
  subcategoria_slug: o.subcategoriaSlug, ano: o.ano, mes: o.mes, limite: o.limite,
});

export const mapRecorrencia = (r: Row<"recorrencias">): Recorrencia => ({
  id: r.id,
  descricao: r.descricao,
  valor: Number(r.valor),
  categoria: r.categoria as Recorrencia["categoria"],
  subcategoria: r.subcategoria,
  cartaoId: r.cartao_id,
  dia: r.dia,
  inicioAno: r.inicio_ano,
  inicioMes: r.inicio_mes,
  fimAno: r.fim_ano,
  fimMes: r.fim_mes,
  reembolso: r.reembolso,
  responsavel: r.responsavel,
  ativo: r.ativo,
});
export const recorrenciaToRow = (r: Omit<Recorrencia, "id">): Insert<"recorrencias"> => ({
  descricao: r.descricao,
  valor: r.valor,
  categoria: r.categoria,
  subcategoria: r.subcategoria,
  cartao_id: r.cartaoId,
  dia: r.dia,
  inicio_ano: r.inicioAno,
  inicio_mes: r.inicioMes,
  fim_ano: r.fimAno,
  fim_mes: r.fimMes,
  reembolso: r.reembolso,
  responsavel: r.responsavel,
  ativo: r.ativo,
});

export const mapFaturaPaga = (r: Row<"faturas_pagas">): FaturaPaga => ({
  id: r.id, cartaoId: r.cartao_id, ano: r.ano, mes: r.mes, pagoEm: r.pago_em,
});
export const faturaPagaToRow = (f: Omit<FaturaPaga, "id">): Insert<"faturas_pagas"> => ({
  cartao_id: f.cartaoId, ano: f.ano, mes: f.mes, pago_em: f.pagoEm,
});
