import type { ContextoParser } from "../../../supabase/functions/telegram-bot/parser.ts";
import type { CartaoBot, Rascunho, SubcategoriaBot } from "../../../supabase/functions/telegram-bot/tipos.ts";

export const HOJE = "2026-10-30";

export const CARTOES: CartaoBot[] = [
  { id: "c-nubank", nome: "Nubank", diaFechamento: 3, diaVencimento: 10 },
  { id: "c-itau", nome: "Itaú", diaFechamento: 25, diaVencimento: 5 },
  { id: "c-bradesco", nome: "Bradesco", diaFechamento: 1, diaVencimento: 8 },
  { id: "c-inter", nome: "Inter", diaFechamento: null, diaVencimento: null },
];

export const SUBCATEGORIAS: SubcategoriaBot[] = [
  { slug: "alimentacao", label: "Alimentação", limitePadrao: 1880, contaNoOrcamento: true },
  { slug: "lazer", label: "Lazer", limitePadrao: 600, contaNoOrcamento: true },
  { slug: "transporte", label: "Transporte", limitePadrao: 750, contaNoOrcamento: true },
  { slug: "gastos_extras", label: "Gastos Extras / Parcelamentos", limitePadrao: 850, contaNoOrcamento: true },
  { slug: "moradia", label: "Moradia & Contas Fixas", limitePadrao: 490, contaNoOrcamento: true },
  { slug: "saude", label: "Saúde", limitePadrao: 700, contaNoOrcamento: true },
  { slug: "compras_terceiros", label: "Compras de Terceiros", limitePadrao: 0, contaNoOrcamento: false },
];

export const CTX: ContextoParser = { hoje: HOJE, cartoes: CARTOES, subcategorias: SUBCATEGORIAS };

export const rascunho = (r: Partial<Rascunho> = {}): Rascunho => ({
  descricao: "Mercado",
  valor: 130,
  valorEParcela: false,
  parcelas: 1,
  data: HOJE,
  tipo: "variavel",
  cartaoId: null,
  subcategoria: "alimentacao",
  reembolso: false,
  ...r,
});
