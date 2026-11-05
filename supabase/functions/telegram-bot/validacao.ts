// Validação da saída da IA: nada é aceito sem checagem. Valores fora da faixa descartam o item; cartão e
// subcategoria inexistentes viram null (o bot pergunta); data fora da faixa vira hoje.

import { round2 } from "../_shared/dominio/money.ts";
import { dataNaFaixa, isoValida } from "./datas.ts";
import { encontrarCartao, encontrarSubcategoria, type ContextoParser } from "./parser.ts";
import { CATEGORIAS_VALIDAS, type Categoria, type Consulta, type Rascunho, type TipoConsulta } from "./tipos.ts";

export const VALOR_MAXIMO = 100_000;
export const PARCELAS_MAXIMO = 48;

export type Intencao = "lancamento" | "consulta" | "ajuda" | "outro";

export interface InterpretacaoIA {
  intencao: Intencao;
  rascunhos: Rascunho[];
  /** Itens recusados (valor/parcelas inválidos). */
  descartados: number;
  consulta: Consulta | null;
  duvida: string | null;
}

const INTENCOES: Intencao[] = ["lancamento", "consulta", "ajuda", "outro"];
const TIPOS_CONSULTA: TipoConsulta[] = ["gasto_subcategoria", "limites", "fatura", "resumo_mes"];

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const inteiro = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

export function validarRascunho(bruto: unknown, ctx: ContextoParser): Rascunho | null {
  if (!ehObjeto(bruto)) return null;
  const descricao = texto(bruto.descricao)?.slice(0, 80);
  const valor = typeof bruto.valor === "number" && Number.isFinite(bruto.valor) ? round2(bruto.valor) : 0;
  const parcelas = bruto.parcelas == null ? 1 : inteiro(bruto.parcelas);
  if (!descricao || parcelas == null || parcelas < 1 || parcelas > PARCELAS_MAXIMO) return null;

  const valorEParcela = bruto.valor_e_parcela === true && parcelas > 1;
  const total = valorEParcela ? valor * parcelas : valor;
  if (valor <= 0 || total > VALOR_MAXIMO) return null;

  const data = typeof bruto.data === "string" && isoValida(bruto.data) && dataNaFaixa(bruto.data, ctx.hoje) ? bruto.data : ctx.hoje;
  const tipoBruto = CATEGORIAS_VALIDAS.includes(bruto.tipo as Categoria) ? (bruto.tipo as Categoria) : null;
  const tipo = parcelas > 1 ? "cartao" : tipoBruto;
  const cartao = tipo === "cartao" && typeof bruto.cartao === "string" ? encontrarCartao(bruto.cartao, ctx.cartoes) : null;
  const sub = tipo !== "entrada" && typeof bruto.subcategoria === "string" ? encontrarSubcategoria(bruto.subcategoria, ctx.subcategorias) : null;

  return {
    descricao,
    valor,
    valorEParcela,
    parcelas,
    data,
    tipo,
    cartaoId: cartao?.id ?? null,
    subcategoria: sub?.slug ?? null,
    reembolso: tipo === "entrada" && bruto.reembolso === true,
  };
}

function validarConsulta(bruto: unknown, ctx: ContextoParser): Consulta | null {
  if (!ehObjeto(bruto) || !TIPOS_CONSULTA.includes(bruto.tipo as TipoConsulta)) return null;
  const mes = inteiro(bruto.mes);
  const ano = inteiro(bruto.ano);
  const mesValido = mes != null && mes >= 1 && mes <= 12;
  return {
    tipo: bruto.tipo as TipoConsulta,
    subcategoria: typeof bruto.subcategoria === "string" ? encontrarSubcategoria(bruto.subcategoria, ctx.subcategorias)?.slug ?? null : null,
    cartaoId: typeof bruto.cartao === "string" ? encontrarCartao(bruto.cartao, ctx.cartoes)?.id ?? null : null,
    // A IA responde mês 1–12; o banco usa 0–11.
    mes: mesValido ? mes - 1 : null,
    ano: mesValido && ano != null && ano >= 2000 && ano <= 2100 ? ano : null,
  };
}

export function validarSaidaIA(bruto: unknown, ctx: ContextoParser): InterpretacaoIA {
  const obj = ehObjeto(bruto) ? bruto : {};
  const intencao = INTENCOES.includes(obj.intencao as Intencao) ? (obj.intencao as Intencao) : "outro";
  const itens = Array.isArray(obj.lancamentos) ? obj.lancamentos.slice(0, 10) : [];
  const rascunhos = itens.map((i) => validarRascunho(i, ctx)).filter((r): r is Rascunho => r != null);
  return {
    intencao,
    rascunhos: intencao === "lancamento" ? rascunhos : [],
    descartados: intencao === "lancamento" ? itens.length - rascunhos.length : 0,
    consulta: intencao === "consulta" ? validarConsulta(obj.consulta, ctx) : null,
    duvida: texto(obj.duvida)?.slice(0, 300) ?? null,
  };
}
