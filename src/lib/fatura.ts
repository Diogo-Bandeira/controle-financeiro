// Regras de fatura de cartão, parcelas e limites. Sem React/Supabase.
// Convenção: mes 0–11 (Janeiro = 0). Competência da fatura = mês do vencimento.

import { fromCents, toCents } from "./money";

export interface MesAno {
  mes: number;
  ano: number;
}

export interface CartaoDias {
  id: string;
  diaFechamento: number | null;
  diaVencimento: number | null;
}

export interface FaturaPagaRef {
  cartaoId: string;
  mes: number;
  ano: number;
}

export interface Fatura extends MesAno {
  dataFechamento: Date;
  dataVencimento: Date;
}

export type StatusFatura = "paga" | "aberta" | "fechada" | "futura";

export const ultimoDia = (ano: number, mes: number): number => new Date(ano, mes + 1, 0).getDate();

const diaNoMes = ({ mes, ano }: MesAno, dia: number): Date => new Date(ano, mes, Math.min(dia, ultimoDia(ano, mes)));

const inicioDoDia = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function somarMeses(mes: number, ano: number, n: number): MesAno {
  const total = ano * 12 + mes + n;
  return { mes: ((total % 12) + 12) % 12, ano: Math.floor(total / 12) };
}

export const indiceMes = ({ mes, ano }: MesAno): number => ano * 12 + mes;

export const compararMesAno = (a: MesAno, b: MesAno): number => indiceMes(a) - indiceMes(b);

export const mesmoMes = (a: MesAno, b: MesAno): boolean => compararMesAno(a, b) === 0;

export const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseISODate(s: string): Date {
  const [ano, mes, dia] = s.slice(0, 10).split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Datas de fechamento e vencimento de uma fatura identificada pela competência (mês do vencimento). */
export function datasDaFatura(competencia: MesAno, diaFechamento: number, diaVencimento: number): Fatura {
  const mesFechamento = diaVencimento > diaFechamento ? competencia : somarMeses(competencia.mes, competencia.ano, -1);
  return {
    ...competencia,
    dataFechamento: diaNoMes(mesFechamento, diaFechamento),
    dataVencimento: diaNoMes(competencia, diaVencimento),
  };
}

/** Fatura em que cai uma compra. Compra no dia do fechamento vai para a próxima fatura. */
export function calcularFatura(dataCompra: Date, diaFechamento: number, diaVencimento: number): Fatura {
  const mesCompra = { mes: dataCompra.getMonth(), ano: dataCompra.getFullYear() };
  const fechaNesteMes = dataCompra.getDate() < diaNoMes(mesCompra, diaFechamento).getDate();
  const mesFechamento = fechaNesteMes ? mesCompra : somarMeses(mesCompra.mes, mesCompra.ano, 1);
  const competencia = diaVencimento > diaFechamento ? mesFechamento : somarMeses(mesFechamento.mes, mesFechamento.ano, 1);
  return datasDaFatura(competencia, diaFechamento, diaVencimento);
}

export const cartaoConfigurado = (c: CartaoDias | null | undefined): c is CartaoDias & { diaFechamento: number; diaVencimento: number } =>
  !!c && c.diaFechamento != null && c.diaVencimento != null;

/** Fatura que está recebendo compras hoje. Sem dias configurados → competência = mês atual. */
export function faturaAberta(cartao: CartaoDias, hoje: Date): Fatura {
  if (cartaoConfigurado(cartao)) return calcularFatura(hoje, cartao.diaFechamento, cartao.diaVencimento);
  return datasSemConfiguracao({ mes: hoje.getMonth(), ano: hoje.getFullYear() });
}

// Cartão sem fechamento/vencimento: trata o último dia do mês como fechamento e vencimento.
const datasSemConfiguracao = (competencia: MesAno): Fatura => {
  const fim = diaNoMes(competencia, 31);
  return { ...competencia, dataFechamento: fim, dataVencimento: fim };
};

export function faturaDoCartao(competencia: MesAno, cartao: CartaoDias): Fatura {
  if (cartaoConfigurado(cartao)) return datasDaFatura(competencia, cartao.diaFechamento, cartao.diaVencimento);
  return datasSemConfiguracao(competencia);
}

export function faturaMarcadaPaga(competencia: MesAno, cartaoId: string, faturasPagas: FaturaPagaRef[]): boolean {
  return faturasPagas.some((f) => f.cartaoId === cartaoId && mesmoMes(f, competencia));
}

/** Status de uma fatura (e das parcelas nela): paga se marcada ou se o vencimento chegou. */
export function statusParcela(fatura: MesAno, cartao: CartaoDias, faturasPagas: FaturaPagaRef[], hoje: Date): StatusFatura {
  if (faturaMarcadaPaga(fatura, cartao.id, faturasPagas)) return "paga";
  const { dataVencimento } = faturaDoCartao(fatura, cartao);
  if (inicioDoDia(hoje) >= dataVencimento) return "paga";
  const diff = compararMesAno(fatura, faturaAberta(cartao, hoje));
  if (diff > 0) return "futura";
  return diff === 0 ? "aberta" : "fechada";
}

export interface ParcelaGerada extends MesAno {
  parcela_num: number;
  valor: number;
}

interface GerarParcelasInput {
  valorTotal?: number;
  valorParcela?: number;
  nParcelas: number;
  primeiraFatura: MesAno;
}

/** Divide em centavos: parcelas 1..n-1 = floor(total/n); a última recebe a diferença. */
export function gerarParcelas({ valorTotal, valorParcela, nParcelas, primeiraFatura }: GerarParcelasInput): ParcelaGerada[] {
  const totalCents = valorParcela != null ? toCents(valorParcela) * nParcelas : toCents(valorTotal ?? 0);
  const base = Math.floor(totalCents / nParcelas);
  const ultima = totalCents - base * (nParcelas - 1);
  return Array.from({ length: nParcelas }, (_, i) => ({
    parcela_num: i + 1,
    ...somarMeses(primeiraFatura.mes, primeiraFatura.ano, i),
    valor: fromCents(i === nParcelas - 1 ? ultima : base),
  }));
}

export interface SubcategoriaLimite {
  slug: string;
  limitePadrao: number;
}

export interface OrcamentoMes extends MesAno {
  subcategoriaSlug: string;
  limite: number;
}

/** Limite do mês = override em orcamentos, se existir; senão o limite padrão da subcategoria. */
export function limiteEfetivo(
  slug: string,
  ano: number,
  mes: number,
  subcategorias: SubcategoriaLimite[],
  orcamentos: OrcamentoMes[],
): number {
  const override = orcamentos.find((o) => o.subcategoriaSlug === slug && o.ano === ano && o.mes === mes);
  if (override) return override.limite;
  return subcategorias.find((s) => s.slug === slug)?.limitePadrao ?? 0;
}

export const diasEntre = (de: Date, ate: Date): number =>
  Math.round((inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / 86_400_000);
