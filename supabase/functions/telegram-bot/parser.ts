// Parser determinístico (sem IA) para as mensagens comuns: "mercado 130", "mercado 130,50 no nubank",
// "tênis 600 3x bradesco", "tênis 3x200 bradesco", "+5000 salário", "uber 23,90 ontem", "quanto gastei em lazer?".
// Só devolve resultado quando a leitura é segura; senão null (a mensagem vai para a IA).

import { normalizarTexto } from "../_shared/dominio/texto.ts";
import { somarMeses } from "../_shared/dominio/fatura.ts";
import { mesDe, resolverData } from "./datas.ts";
import type { CartaoBot, Categoria, Consulta, Rascunho, SubcategoriaBot } from "./tipos.ts";

export interface ContextoParser {
  hoje: string;
  cartoes: CartaoBot[];
  subcategorias: SubcategoriaBot[];
}

export type ResultadoParser =
  | { tipo: "lancamento"; rascunho: Rascunho }
  | { tipo: "consulta"; consulta: Consulta }
  | null;

interface Token {
  bruto: string;
  norm: string;
}

const palavrasDe = (s: string): string[] => normalizarTexto(s).split(" ").filter(Boolean);

// ─── Valores ─────────────────────────────────────────────────────────────────

const VALOR_RE = /^(?:r\$)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+\.\d{1,2})$/i;
const MILHAR_RE = /^\d{1,3}(?:\.\d{3})+$/;

/** "130", "130,50", "1.300,50", "1.300", "23.90", "R$130" → número. */
export function lerValor(token: string): number | null {
  const m = VALOR_RE.exec(token);
  if (!m) return null;
  const s = m[1];
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (MILHAR_RE.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}

const PARCELAS_RE = /^(\d{1,2})x$/i;
const PARCELAS_VALOR_RE = /^(\d{1,2})x(.+)$/i;

// ─── Cartões e subcategorias ─────────────────────────────────────────────────

/** Cartão pelo nome, sem acento/caixa ("itau" casa com "Itaú"): nome completo ou 1ª palavra, se só um cartão começar com ela. */
export function encontrarCartao(nome: string, cartoes: CartaoBot[]): CartaoBot | null {
  const n = normalizarTexto(nome);
  if (!n) return null;
  const exato = cartoes.find((c) => normalizarTexto(c.nome) === n);
  if (exato) return exato;
  const porPrimeira = cartoes.filter((c) => palavrasDe(c.nome)[0] === n);
  return porPrimeira.length === 1 ? porPrimeira[0] : null;
}

/** Frases que identificam a subcategoria: label, slug e o 1º trecho do label quando é uma palavra só ("Reserva / Investimentos" → "reserva"). */
function chavesDaSubcategoria(s: SubcategoriaBot): string[][] {
  const primeiroTrecho = palavrasDe(s.label.split(/[/&,]/)[0]);
  const chaves = [palavrasDe(s.label), palavrasDe(s.slug.replace(/_/g, " ")), primeiroTrecho.length === 1 ? primeiroTrecho : []];
  return chaves.filter((c, i) => c.length > 0 && chaves.findIndex((o) => o.join(" ") === c.join(" ")) === i);
}

/** Subcategoria por slug, label ou palavra-chave (sem acento/caixa). */
export function encontrarSubcategoria(texto: string, subcategorias: SubcategoriaBot[]): SubcategoriaBot | null {
  const n = normalizarTexto(texto);
  if (!n) return null;
  return (
    subcategorias.find((s) => s.slug === texto) ??
    subcategorias.find((s) => chavesDaSubcategoria(s).some((c) => c.join(" ") === n)) ??
    null
  );
}

interface Trecho {
  inicio: number;
  fim: number;
}

const acharSequencia = (tokens: Token[], palavras: string[]): Trecho | null => {
  for (let i = 0; i + palavras.length <= tokens.length; i++) {
    if (palavras.every((p, j) => tokens[i + j].norm === p)) return { inicio: i, fim: i + palavras.length };
  }
  return null;
};

function acharCartoes(tokens: Token[], cartoes: CartaoBot[]): { cartao: CartaoBot; trecho: Trecho }[] {
  const primeiras = cartoes.map((c) => palavrasDe(c.nome)[0]);
  return cartoes.flatMap((c, i) => {
    const completo = acharSequencia(tokens, palavrasDe(c.nome));
    if (completo) return [{ cartao: c, trecho: completo }];
    const unica = primeiras.filter((p) => p === primeiras[i]).length === 1;
    const primeira = unica && primeiras[i].length >= 3 ? acharSequencia(tokens, [primeiras[i]]) : null;
    return primeira ? [{ cartao: c, trecho: primeira }] : [];
  });
}

function acharSubcategoria(tokens: Token[], subcategorias: SubcategoriaBot[]): { slug: string; trecho: Trecho } | null {
  const achados = subcategorias.flatMap((s) =>
    chavesDaSubcategoria(s).map((c) => acharSequencia(tokens, c)).filter((t): t is Trecho => t != null).map((trecho) => ({ slug: s.slug, trecho })),
  );
  const slugs = new Set(achados.map((a) => a.slug));
  return slugs.size === 1 ? achados[0] : null;
}

// ─── Palavras de tipo e conectores ───────────────────────────────────────────

/** Palavra → tipo; `manter` = continua na descrição ("conta de luz"). */
const PALAVRAS_TIPO: Record<string, { tipo: Categoria; manter?: boolean; reembolso?: boolean }> = {
  recebi: { tipo: "entrada" },
  recebido: { tipo: "entrada" },
  entrada: { tipo: "entrada" },
  reembolso: { tipo: "entrada", manter: true, reembolso: true },
  pix: { tipo: "variavel" },
  debito: { tipo: "variavel" },
  dinheiro: { tipo: "variavel" },
  conta: { tipo: "conta_fixa", manter: true },
  boleto: { tipo: "conta_fixa" },
  cartao: { tipo: "cartao" },
  credito: { tipo: "cartao" },
};
const PRIORIDADE_TIPO: Categoria[] = ["entrada", "cartao", "conta_fixa", "variavel"];

const CONECTORES = new Set(["no", "na", "em", "de", "do", "da", "com", "pelo", "pela", "pro", "pra", "para", "e", "via"]);
const DESCARTAVEIS = new Set(["r", "reais", "real"]);

const temLetra = (s: string): boolean => /\p{L}/u.test(s);

const aparar = (tokens: Token[]): Token[] => {
  let ini = 0;
  let fim = tokens.length;
  while (ini < fim && CONECTORES.has(tokens[ini].norm)) ini++;
  while (fim > ini && CONECTORES.has(tokens[fim - 1].norm)) fim--;
  return tokens.slice(ini, fim);
};

const capitalizar = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Lançamento ──────────────────────────────────────────────────────────────

/** Mensagem de lançamento em formato livre simples. null se não der para ler com segurança. */
export function interpretarLancamento(texto: string, ctx: ContextoParser): Rascunho | null {
  const limpo = texto.trim();
  if (!limpo || limpo.length > 120 || limpo.includes("\n")) return null;

  const tipos = new Set<Categoria>();
  let reembolso = false;
  let corpo = limpo;
  if (corpo.startsWith("+")) {
    tipos.add("entrada");
    corpo = corpo.slice(1);
  }

  let tokens: Token[] = corpo.split(/\s+/).filter(Boolean).map((bruto) => ({ bruto, norm: normalizarTexto(bruto) }));

  const cartoes = acharCartoes(tokens, ctx.cartoes);
  if (new Set(cartoes.map((c) => c.cartao.id)).size > 1) return null;
  const cartao = cartoes[0]?.cartao ?? null;
  if (cartao) {
    const { inicio, fim } = cartoes[0].trecho;
    tokens = [...tokens.slice(0, inicio), ...tokens.slice(fim)];
    tipos.add("cartao");
  }

  let valor: number | null = null;
  let valorEParcela = false;
  let parcelas = 1;
  let data = ctx.hoje;
  let valores = 0;
  const resto: Token[] = [];

  for (const t of tokens) {
    const semPonto = t.bruto.replace(/[.,;:!]+$/, "");
    const parcelaComValor = PARCELAS_VALOR_RE.exec(semPonto);
    const valorDaParcela = parcelaComValor ? lerValor(parcelaComValor[2]) : null;
    const nParcelas = PARCELAS_RE.exec(semPonto);
    const v = lerValor(semPonto);
    const d = resolverData(semPonto, ctx.hoje);
    const palavra = PALAVRAS_TIPO[t.norm];

    if (nParcelas) {
      parcelas = Number(nParcelas[1]);
    } else if (parcelaComValor && valorDaParcela != null) {
      parcelas = Number(parcelaComValor[1]);
      valor = valorDaParcela;
      valorEParcela = true;
      valores++;
    } else if (v != null) {
      valor = v;
      valores++;
    } else if (d) {
      data = d;
    } else if (t.bruto.toLowerCase() === "r$" || DESCARTAVEIS.has(t.norm)) {
      // "R$ 130", "130 reais"
    } else if (palavra) {
      tipos.add(palavra.tipo);
      reembolso ||= !!palavra.reembolso;
      if (palavra.manter) resto.push(t);
    } else {
      resto.push(t);
    }
  }

  if (valores !== 1 || valor == null || valor <= 0) return null;
  if (resto.some((t) => !temLetra(t.bruto))) return null;
  if (parcelas < 1 || parcelas > 48) return null;

  let descricaoTokens = aparar(resto);
  const sub = acharSubcategoria(descricaoTokens, ctx.subcategorias);
  // Palavra-chave de subcategoria sai da descrição, exceto se for o começo dela ("manutenção carro") ou tudo ("lazer").
  if (sub && sub.trecho.inicio > 0) {
    descricaoTokens = aparar([...descricaoTokens.slice(0, sub.trecho.inicio), ...descricaoTokens.slice(sub.trecho.fim)]);
  }
  const descricao = descricaoTokens.map((t) => t.bruto).join(" ").replace(/[,;:!]+$/, "");
  if (!temLetra(descricao) || descricao.length > 80) return null;

  const tipo = parcelas > 1 ? "cartao" : PRIORIDADE_TIPO.find((p) => tipos.has(p)) ?? null;
  if (parcelas > 1 && tipos.has("entrada")) return null;

  return {
    descricao: capitalizar(descricao),
    valor,
    valorEParcela,
    parcelas,
    data,
    tipo,
    cartaoId: tipo === "cartao" ? cartao?.id ?? null : null,
    subcategoria: tipo === "entrada" ? null : sub?.slug ?? null,
    reembolso: tipo === "entrada" && reembolso,
  };
}

// ─── Consultas por palavra-chave ─────────────────────────────────────────────

const MESES_NOMES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const PERGUNTA_RE = /^(quanto|quantos|quanta|qual|quais|como|mostra|mostre|ver|veja|me mostra)\b/;

export const pareceConsulta = (texto: string): boolean => texto.trim().endsWith("?") || PERGUNTA_RE.test(normalizarTexto(texto));

/** "quanto gastei em lazer?", "como está a fatura do nubank?", "limites de outubro". null se não reconhecer. */
export function interpretarConsulta(texto: string, ctx: ContextoParser): Consulta | null {
  const n = normalizarTexto(texto);
  const tokens: Token[] = texto.split(/\s+/).filter(Boolean).map((bruto) => ({ bruto, norm: normalizarTexto(bruto) }));
  const palavras = new Set(n.split(" "));

  const hoje = mesDe(ctx.hoje);
  const nomeMes = MESES_NOMES.findIndex((m) => palavras.has(m));
  const ano = [...palavras].map(Number).find((x) => x >= 2000 && x <= 2100) ?? null;
  const periodo = (() => {
    if (/\bmes passado\b/.test(n)) return somarMeses(hoje.mes, hoje.ano, -1);
    if (nomeMes >= 0) return { mes: nomeMes, ano: ano ?? hoje.ano };
    return { mes: null, ano: null };
  })();

  if (palavras.has("fatura") || palavras.has("faturas")) {
    const cartao = acharCartoes(tokens, ctx.cartoes)[0]?.cartao ?? null;
    return { tipo: "fatura", subcategoria: null, cartaoId: cartao?.id ?? null, mes: null, ano: null };
  }
  if (["limite", "limites", "orcamento"].some((p) => palavras.has(p))) {
    return { tipo: "limites", subcategoria: null, cartaoId: null, ...periodo };
  }
  if (["resumo", "saldo", "sobrou", "sobra"].some((p) => palavras.has(p))) {
    return { tipo: "resumo_mes", subcategoria: null, cartaoId: null, ...periodo };
  }
  if (["gastei", "gastamos", "gasto", "gastos", "gastou"].some((p) => palavras.has(p))) {
    const sub = acharSubcategoria(tokens, ctx.subcategorias);
    if (sub) return { tipo: "gasto_subcategoria", subcategoria: sub.slug, cartaoId: null, ...periodo };
    if (/\b(gastei|gastamos|gastou)( no mes| este mes| esse mes)?$/.test(n)) return { tipo: "resumo_mes", subcategoria: null, cartaoId: null, ...periodo };
  }
  return null;
}

/** Parser local: consulta (se parecer pergunta) ou lançamento. */
export function interpretarLocal(texto: string, ctx: ContextoParser): ResultadoParser {
  if (pareceConsulta(texto)) {
    const consulta = interpretarConsulta(texto, ctx);
    return consulta ? { tipo: "consulta", consulta } : null;
  }
  const rascunho = interpretarLancamento(texto, ctx);
  return rascunho ? { tipo: "lancamento", rascunho } : null;
}
