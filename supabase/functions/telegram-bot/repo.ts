// Acesso a dados do bot (service role). Toda consulta/escrita filtra por household_id explicitamente;
// escritas transacionais passam pelas RPCs bot_* (só service_role tem EXECUTE).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MesAno } from "../_shared/dominio/fatura.ts";
import type { LancamentoHistorico } from "../_shared/dominio/sugestao.ts";
import type {
  CartaoBot, LancamentoGravado, LancamentoMes, LinhaLancamento, LinhaParcelamento, OrcamentoBot, SubcategoriaBot, Vinculo,
} from "./tipos.ts";

export type TipoMensagem = "texto" | "audio" | "foto" | "comando" | "callback";

export interface RegistroMensagem {
  id: string;
  createdAt: string;
  lancamentoIds: string[];
  parcelamentoId: string | null;
}

export interface UsoIA {
  chamadas: number;
  erros429: number;
  limiteAtingido: boolean;
}

export interface Pendencia {
  id: string;
  payload: unknown;
  expiraEm: string;
}

export interface Repositorio {
  vinculoDoChat(chatId: number): Promise<Vinculo | null>;
  vincular(codigo: string, chatId: number, de: { id: number; username: string | null; nome: string | null }): Promise<Vinculo | null>;
  desativarVinculo(chatId: number): Promise<void>;
  /** Registra o update; null se já foi processado (update_id repetido). */
  registrarUpdate(r: { householdId: string; chatId: number; updateId: number; tipo: TipoMensagem }): Promise<string | null>;
  marcarUsoIa(mensagemId: string): Promise<void>;
  salvarResultado(mensagemId: string, lancamentoIds: string[], parcelamentoId: string | null): Promise<void>;
  mensagensDesde(chatId: number, desde: Date): Promise<number>;
  mensagem(id: string, householdId: string): Promise<RegistroMensagem | null>;
  ultimaComLancamento(chatId: number, householdId: string, desde: Date): Promise<RegistroMensagem | null>;
  cartoes(householdId: string): Promise<CartaoBot[]>;
  subcategorias(householdId: string): Promise<SubcategoriaBot[]>;
  historico(householdId: string): Promise<LancamentoHistorico[]>;
  usoIa(householdId: string, dia: string): Promise<UsoIA>;
  registrarUsoIa(householdId: string, delta: { chamadas?: number; erros429?: number; limiteDiario?: boolean }): Promise<void>;
  inserirLancamentos(householdId: string, linhas: LinhaLancamento[]): Promise<LancamentoGravado[]>;
  salvarParcelamento(
    householdId: string,
    parcelamento: LinhaParcelamento,
    linhas: Omit<LinhaLancamento, "categoria" | "reembolso" | "origem">[],
    apagarIds?: string[],
  ): Promise<{ parcelamentoId: string; lancamentos: LancamentoGravado[] }>;
  excluir(householdId: string, ids: string[], parcelamentoId: string | null): Promise<void>;
  lancamentosPorIds(householdId: string, ids: string[]): Promise<LancamentoGravado[]>;
  parcelamento(householdId: string, id: string): Promise<(LinhaParcelamento & { id: string }) | null>;
  atualizarLancamentos(householdId: string, ids: string[], campos: Partial<LinhaLancamento>): Promise<void>;
  atualizarParcelamento(householdId: string, id: string, campos: Partial<LinhaParcelamento>): Promise<void>;
  lancamentosDosMeses(householdId: string, meses: MesAno[]): Promise<LancamentoMes[]>;
  orcamentos(householdId: string, meses: MesAno[]): Promise<OrcamentoBot[]>;
  criarPendencia(householdId: string, chatId: number, payload: unknown): Promise<string>;
  pendencia(id: string, chatId: number): Promise<Pendencia | null>;
  atualizarPendencia(id: string, payload: unknown): Promise<void>;
  apagarPendencia(id: string): Promise<void>;
  limparAntigos(): Promise<void>;
}

const CAMPOS_LANCAMENTO =
  "id, descricao, valor, categoria, mes, ano, data, subcategoria, cartao_id, parcelamento_id, parcela_num, status, reembolso, responsavel, observacao, origem";

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const checar = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

const paraLancamento = (r: Linha): LancamentoGravado => ({ ...(r as LancamentoGravado), valor: Number(r.valor) });

const paraVinculo = (r: Linha): Vinculo => ({
  id: r.id, householdId: r.household_id, userId: r.user_id, chatId: Number(r.chat_id), nomeExibicao: r.nome_exibicao,
});

const paraRegistro = (r: Linha): RegistroMensagem => ({
  id: r.id, createdAt: r.created_at, lancamentoIds: r.lancamento_ids ?? [], parcelamentoId: r.parcelamento_id,
});

export function criarRepositorio(db: SupabaseClient): Repositorio {
  return {
    async vinculoDoChat(chatId) {
      const r = checar(await db.from("telegram_vinculos").select("*").eq("chat_id", chatId).eq("ativo", true).maybeSingle());
      return r ? paraVinculo(r) : null;
    },

    async vincular(codigo, chatId, de) {
      const r = checar(await db.rpc("bot_vincular_telegram", {
        p_codigo: codigo, p_chat_id: chatId, p_telegram_user_id: de.id, p_telegram_username: de.username, p_nome_telegram: de.nome,
      })) as Linha | null;
      return r?.id ? paraVinculo(r) : null;
    },

    async desativarVinculo(chatId) {
      checar(await db.from("telegram_vinculos").update({ ativo: false }).eq("chat_id", chatId));
    },

    async registrarUpdate({ householdId, chatId, updateId, tipo }) {
      const r = checar(await db
        .from("telegram_mensagens")
        .upsert({ household_id: householdId, chat_id: chatId, update_id: updateId, tipo }, { onConflict: "update_id", ignoreDuplicates: true })
        .select("id")) as Linha[] | null;
      return r?.[0]?.id ?? null;
    },

    async marcarUsoIa(mensagemId) {
      checar(await db.from("telegram_mensagens").update({ usou_ia: true }).eq("id", mensagemId));
    },

    async salvarResultado(mensagemId, lancamentoIds, parcelamentoId) {
      checar(await db.from("telegram_mensagens").update({ lancamento_ids: lancamentoIds, parcelamento_id: parcelamentoId }).eq("id", mensagemId));
    },

    async mensagensDesde(chatId, desde) {
      const { count, error } = await db
        .from("telegram_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("chat_id", chatId)
        .neq("tipo", "callback")
        .gte("created_at", desde.toISOString());
      if (error) throw error;
      return count ?? 0;
    },

    async mensagem(id, householdId) {
      const r = checar(await db.from("telegram_mensagens").select("*").eq("id", id).eq("household_id", householdId).maybeSingle());
      return r ? paraRegistro(r) : null;
    },

    async ultimaComLancamento(chatId, householdId, desde) {
      const r = checar(await db
        .from("telegram_mensagens")
        .select("*")
        .eq("chat_id", chatId)
        .eq("household_id", householdId)
        .gte("created_at", desde.toISOString())
        .neq("lancamento_ids", "{}")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle());
      return r ? paraRegistro(r) : null;
    },

    async cartoes(householdId) {
      const r = checar(await db
        .from("cartoes")
        .select("id, nome, dia_fechamento, dia_vencimento")
        .eq("household_id", householdId)
        .eq("ativo", true)
        .order("nome")) as Linha[];
      return r.map((c) => ({ id: c.id, nome: c.nome, diaFechamento: c.dia_fechamento, diaVencimento: c.dia_vencimento }));
    },

    async subcategorias(householdId) {
      const r = checar(await db
        .from("subcategorias")
        .select("slug, label, limite_padrao, conta_no_orcamento, ordem")
        .eq("household_id", householdId)
        .eq("ativa", true)
        .order("ordem", { nullsFirst: false })
        .order("label")) as Linha[];
      return r.map((s) => ({ slug: s.slug, label: s.label, limitePadrao: Number(s.limite_padrao), contaNoOrcamento: s.conta_no_orcamento }));
    },

    async historico(householdId) {
      const r = checar(await db
        .from("lancamentos")
        .select("descricao, categoria, subcategoria, cartao_id")
        .eq("household_id", householdId)
        .order("data", { ascending: false })
        .limit(1000)) as Linha[];
      return r.map((l) => ({ descricao: l.descricao, categoria: l.categoria, subcategoria: l.subcategoria, cartaoId: l.cartao_id }));
    },

    async usoIa(householdId, dia) {
      const r = checar(await db.from("ia_uso_diario").select("*").eq("household_id", householdId).eq("dia", dia).maybeSingle()) as Linha | null;
      return { chamadas: r?.chamadas ?? 0, erros429: r?.erros_429 ?? 0, limiteAtingido: r?.limite_diario_atingido ?? false };
    },

    async registrarUsoIa(householdId, { chamadas = 0, erros429 = 0, limiteDiario = false }) {
      checar(await db.rpc("bot_registrar_uso_ia", {
        p_household_id: householdId, p_chamadas: chamadas, p_erros_429: erros429, p_limite_diario: limiteDiario,
      }));
    },

    async inserirLancamentos(householdId, linhas) {
      const r = checar(await db.rpc("bot_inserir_lancamentos", { p_household_id: householdId, p_lancamentos: linhas })) as Linha[];
      return r.map(paraLancamento);
    },

    async salvarParcelamento(householdId, parcelamento, linhas, apagarIds = []) {
      const r = checar(await db.rpc("bot_salvar_parcelamento", {
        p_household_id: householdId, p_parcelamento: parcelamento, p_lancamentos: linhas, p_apagar_ids: apagarIds,
      })) as { parcelamento: Linha; lancamentos: Linha[] };
      return { parcelamentoId: r.parcelamento.id, lancamentos: r.lancamentos.map(paraLancamento) };
    },

    async excluir(householdId, ids, parcelamentoId) {
      checar(await db.rpc("bot_excluir_lancamentos", { p_household_id: householdId, p_ids: ids, p_parcelamento_id: parcelamentoId }));
    },

    async lancamentosPorIds(householdId, ids) {
      if (ids.length === 0) return [];
      const r = checar(await db.from("lancamentos").select(CAMPOS_LANCAMENTO).eq("household_id", householdId).in("id", ids)) as Linha[];
      return r.map(paraLancamento);
    },

    async parcelamento(householdId, id) {
      const r = checar(await db.from("parcelamentos").select("*").eq("household_id", householdId).eq("id", id).maybeSingle()) as Linha | null;
      return r ? ({ ...r, valor_total: Number(r.valor_total), valor_parcela: Number(r.valor_parcela) } as LinhaParcelamento & { id: string }) : null;
    },

    async atualizarLancamentos(householdId, ids, campos) {
      checar(await db.from("lancamentos").update(campos).eq("household_id", householdId).in("id", ids));
    },

    async atualizarParcelamento(householdId, id, campos) {
      checar(await db.from("parcelamentos").update(campos).eq("household_id", householdId).eq("id", id));
    },

    async lancamentosDosMeses(householdId, meses) {
      const r = checar(await db
        .from("lancamentos")
        .select("categoria, subcategoria, cartao_id, valor, mes, ano")
        .eq("household_id", householdId)
        .in("ano", [...new Set(meses.map((m) => m.ano))])
        .in("mes", [...new Set(meses.map((m) => m.mes))])) as Linha[];
      return r
        .filter((l) => meses.some((m) => m.mes === l.mes && m.ano === l.ano))
        .map((l) => ({ categoria: l.categoria, subcategoria: l.subcategoria, cartaoId: l.cartao_id, valor: Number(l.valor), mes: l.mes, ano: l.ano }));
    },

    async orcamentos(householdId, meses) {
      const r = checar(await db
        .from("orcamentos")
        .select("subcategoria_slug, mes, ano, limite")
        .eq("household_id", householdId)
        .in("ano", [...new Set(meses.map((m) => m.ano))])
        .in("mes", [...new Set(meses.map((m) => m.mes))])) as Linha[];
      return r.map((o) => ({ subcategoriaSlug: o.subcategoria_slug, mes: o.mes, ano: o.ano, limite: Number(o.limite) }));
    },

    async criarPendencia(householdId, chatId, payload) {
      const r = checar(await db.from("telegram_pendencias").insert({ household_id: householdId, chat_id: chatId, payload }).select("id").single()) as Linha;
      return r.id;
    },

    async pendencia(id, chatId) {
      const r = checar(await db.from("telegram_pendencias").select("*").eq("id", id).eq("chat_id", chatId).maybeSingle()) as Linha | null;
      return r ? { id: r.id, payload: r.payload, expiraEm: r.expira_em } : null;
    },

    async atualizarPendencia(id, payload) {
      checar(await db.from("telegram_pendencias").update({ payload }).eq("id", id));
    },

    async apagarPendencia(id) {
      checar(await db.from("telegram_pendencias").delete().eq("id", id));
    },

    async limparAntigos() {
      checar(await db.rpc("bot_limpar_antigos"));
    },
  };
}
