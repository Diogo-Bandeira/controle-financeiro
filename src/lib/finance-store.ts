import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { createElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { compararMesAno, limiteEfetivo as calcLimiteEfetivo, somarMeses, toISODate, type MesAno } from "./fatura";
import { sumMoney } from "./money";
import { lancamentosRecorrentesDoMes } from "./recorrencias";
import { definirValoresOcultos, gravarLocalStorage, lerLocalStorage } from "./format";
import {
  aporteToRow, cartaoToRow, faturaPagaToRow, lancamentoToRow, mapAporte, mapCartao, mapFaturaPaga, mapLancamento, mapMeta, mapOrcamento,
  mapParcelamento, mapPrioridade, mapRecorrencia, mapSubcategoria, metaToRow, orcamentoToRow, parcelamentoToRow, prioridadeToRow,
  recorrenciaToRow, subcategoriaToRow,
} from "./store/mappers";
import {
  faturasDoCartao as calcFaturasDoCartao, progressoParcelamento as calcProgresso, resumoFatura as calcResumoFatura,
  statusLancamentoCartao as calcStatusLancamento,
} from "./store/derivados";
import type { Household, Lancamento, Membro, NovoLancamento, Parcelamento, Subcategoria } from "./store/types";

export * from "./store/types";
export type { ResumoFatura, ProgressoParcelamento } from "./store/derivados";
export { MESES, CATEGORIAS, formatCurrency } from "./format";

// Cliente sem tipos para o CRUD genérico (as entidades já são tipadas pelos mappers).
const db = supabase as unknown as SupabaseClient;

type Tabela = keyof Database["public"]["Tables"];
type ComId = { id: string };

// ─── CRUD genérico por entidade ──────────────────────────────────────────────

interface ConfigEntidade<T extends ComId, R> {
  tabela: Tabela;
  rotulo: string;
  map: (r: R) => T;
  toRow: (x: Omit<T, "id">) => object;
  ordem?: string;
}

function useEntidade<T extends ComId, R>(householdId: string | null, cfg: ConfigEntidade<T, R>) {
  const [itens, setItens] = useState<T[]>([]);
  const { tabela, rotulo, map, toRow, ordem } = cfg;

  const carregar = useCallback(async () => {
    if (!householdId) return;
    const base = db.from(tabela).select("*").eq("household_id", householdId);
    const { data, error } = await (ordem ? base.order(ordem, { ascending: true }) : base);
    if (error) { toast.error(`Erro ao carregar ${rotulo}`); return; }
    setItens((data as R[]).map(map));
  }, [householdId, tabela, rotulo, map, ordem]);

  const add = useCallback(async (x: Omit<T, "id">): Promise<T | null> => {
    if (!householdId) return null;
    const { data, error } = await db.from(tabela).insert({ ...toRow(x), household_id: householdId }).select().single();
    if (error) { toast.error(`Erro ao adicionar ${rotulo}`); return null; }
    const novo = map(data as R);
    setItens((prev) => [...prev, novo]);
    return novo;
  }, [householdId, tabela, rotulo, map, toRow]);

  const update = useCallback(async (x: T): Promise<boolean> => {
    const { id, ...resto } = x;
    const { data, error } = await db.from(tabela).update(toRow(resto)).eq("id", id).select();
    if (error || !data?.length) { toast.error(`Erro ao atualizar ${rotulo}`); return false; }
    const atualizado = map(data[0] as R);
    setItens((prev) => prev.map((i) => (i.id === id ? atualizado : i)));
    return true;
  }, [tabela, rotulo, map, toRow]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await db.from(tabela).delete().eq("id", id);
    if (error) { toast.error(`Erro ao excluir ${rotulo}`); return false; }
    setItens((prev) => prev.filter((i) => i.id !== id));
    return true;
  }, [tabela, rotulo]);

  return { itens, setItens, carregar, add, update, remove };
}

// ─── Store ───────────────────────────────────────────────────────────────────

const CHAVE_OCULTAR = "cf:ocultar-valores";

interface SalvarParcelamentoInput {
  parcelamento: Omit<Parcelamento, "id"> & { id?: string };
  lancamentos: NovoLancamento[];
  apagarIds?: string[];
}

function useFinanceDataInternal() {
  const { householdId } = useAuth();
  const hoje = new Date();

  const metasE = useEntidade(householdId, { tabela: "metas", rotulo: "meta", map: mapMeta, toRow: metaToRow, ordem: "created_at" });
  const aportesE = useEntidade(householdId, { tabela: "aportes", rotulo: "aporte", map: mapAporte, toRow: aporteToRow, ordem: "data" });
  const lancE = useEntidade(householdId, { tabela: "lancamentos", rotulo: "lançamento", map: mapLancamento, toRow: lancamentoToRow, ordem: "data" });
  const parcE = useEntidade(householdId, { tabela: "parcelamentos", rotulo: "parcelamento", map: mapParcelamento, toRow: parcelamentoToRow, ordem: "created_at" });
  const prioE = useEntidade(householdId, { tabela: "prioridades", rotulo: "prioridade", map: mapPrioridade, toRow: prioridadeToRow, ordem: "ordem" });
  const cartoesE = useEntidade(householdId, { tabela: "cartoes", rotulo: "cartão", map: mapCartao, toRow: cartaoToRow, ordem: "nome" });
  const subE = useEntidade(householdId, { tabela: "subcategorias", rotulo: "subcategoria", map: mapSubcategoria, toRow: subcategoriaToRow, ordem: "ordem" });
  const orcE = useEntidade(householdId, { tabela: "orcamentos", rotulo: "limite do mês", map: mapOrcamento, toRow: orcamentoToRow });
  const recE = useEntidade(householdId, { tabela: "recorrencias", rotulo: "recorrência", map: mapRecorrencia, toRow: recorrenciaToRow, ordem: "created_at" });
  const fatE = useEntidade(householdId, { tabela: "faturas_pagas", rotulo: "fatura paga", map: mapFaturaPaga, toRow: faturaPagaToRow });
  const { add: addLancRaw, carregar: carregarLanc } = lancE;
  const { carregar: carregarParc } = parcE;
  const { carregar: carregarRec } = recE;
  const { carregar: carregarOrc } = orcE;
  const { setItens: setSubcategorias, carregar: carregarSub } = subE;
  const { itens: prioridades, setItens: setPrioridades, carregar: carregarPrio } = prioE;
  const { add: addFatura, remove: removeFatura } = fatE;

  const [membros, setMembros] = useState<Membro[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [loading, setLoading] = useState(false);
  const [ocultarValores, setOcultarValoresState] = useState(() => {
    const v = lerLocalStorage(CHAVE_OCULTAR, false);
    definirValoresOcultos(v);
    return v;
  });

  const setOcultarValores = useCallback((v: boolean) => {
    definirValoresOcultos(v);
    gravarLocalStorage(CHAVE_OCULTAR, v);
    setOcultarValoresState(v);
  }, []);

  const carregarMembros = useCallback(async () => {
    if (!householdId) return;
    const [perfis, casa] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").eq("household_id", householdId),
      supabase.from("households").select("id, nome, codigo_convite").eq("id", householdId).maybeSingle(),
    ]);
    setMembros((perfis.data ?? []).map((p) => ({ userId: p.user_id, nome: p.display_name ?? "Membro" })));
    if (casa.data) setHousehold({ id: casa.data.id, nome: casa.data.nome, codigoConvite: casa.data.codigo_convite });
  }, [householdId]);

  const carregadores = useMemo<Partial<Record<Tabela, () => Promise<void>>>>(() => ({
    metas: metasE.carregar,
    aportes: aportesE.carregar,
    lancamentos: carregarLanc,
    parcelamentos: carregarParc,
    prioridades: carregarPrio,
    cartoes: cartoesE.carregar,
    subcategorias: carregarSub,
    orcamentos: carregarOrc,
    recorrencias: recE.carregar,
    faturas_pagas: fatE.carregar,
  }), [metasE.carregar, aportesE.carregar, carregarLanc, carregarParc, carregarPrio, cartoesE.carregar, carregarSub, carregarOrc, recE.carregar, fatE.carregar]);

  const carregadoresRef = useRef(carregadores);
  carregadoresRef.current = carregadores;

  // Carga inicial
  useEffect(() => {
    if (!householdId) return;
    let ativo = true;
    setLoading(true);
    Promise.all([...Object.values(carregadoresRef.current).map((f) => f()), carregarMembros()]).finally(() => {
      if (ativo) setLoading(false);
    });
    return () => { ativo = false; };
  }, [householdId, carregarMembros]);

  // Realtime: recarrega a entidade alterada (por outro membro ou outra aba).
  // DELETE não é filtrável por household_id, então a assinatura é por tabela e o RLS limita os dados.
  useEffect(() => {
    if (!householdId) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const canal = Object.keys(carregadoresRef.current).reduce(
      (ch, tabela) =>
        ch.on("postgres_changes", { event: "*", schema: "public", table: tabela }, () => {
          clearTimeout(timers.get(tabela));
          timers.set(tabela, setTimeout(() => carregadoresRef.current[tabela as Tabela]?.(), 400));
        }),
      supabase.channel(`household-${householdId}`),
    );
    canal.subscribe();
    return () => {
      timers.forEach(clearTimeout);
      supabase.removeChannel(canal);
    };
  }, [householdId]);

  // ─── Lançamentos ─────────────────────────────────────────────────────────

  const lancamentos = lancE.itens;
  const setLancamentos = lancE.setItens;

  const addLancamento = useCallback(
    (l: NovoLancamento) => addLancRaw(l as Omit<Lancamento, "id">),
    [addLancRaw],
  );

  /** Insert em lote via RPC (atômico). Recarrega lançamentos depois. Retorna os inseridos. */
  const inserirLancamentos = useCallback(async (novos: NovoLancamento[]): Promise<Lancamento[] | null> => {
    if (novos.length === 0) return [];
    const { data, error } = await supabase.rpc("inserir_lancamentos", { p_lancamentos: novos.map(lancamentoToRow) });
    if (error) { toast.error("Erro ao inserir lançamentos"); return null; }
    await carregarLanc();
    return (data ?? []).map(mapLancamento);
  }, [carregarLanc]);

  /** Atualiza vários lançamentos (linhas completas) num único upsert. */
  const updateLancamentos = useCallback(async (itens: Lancamento[]): Promise<boolean> => {
    if (!householdId || itens.length === 0) return true;
    const { error } = await supabase
      .from("lancamentos")
      .upsert(itens.map((l) => ({ ...lancamentoToRow(l), household_id: householdId })));
    if (error) { toast.error("Erro ao atualizar lançamentos"); return false; }
    const porId = new Map(itens.map((l) => [l.id, l]));
    setLancamentos((prev) => prev.map((l) => porId.get(l.id) ?? l));
    return true;
  }, [householdId, setLancamentos]);

  /** Exclui e devolve os registros removidos (para "Desfazer"). */
  const deleteLancamentos = useCallback(async (ids: string[]): Promise<Lancamento[]> => {
    if (ids.length === 0) return [];
    const removidos = lancamentos.filter((l) => ids.includes(l.id));
    const { error } = await supabase.from("lancamentos").delete().in("id", ids);
    if (error) { toast.error("Erro ao excluir lançamentos"); return []; }
    setLancamentos((prev) => prev.filter((l) => !ids.includes(l.id)));
    return removidos;
  }, [lancamentos, setLancamentos]);

  // ─── Parcelamentos ───────────────────────────────────────────────────────

  const salvarParcelamento = useCallback(async ({ parcelamento, lancamentos: novos, apagarIds = [] }: SalvarParcelamentoInput): Promise<Parcelamento | null> => {
    const { data, error } = await supabase.rpc("salvar_parcelamento", {
      p_parcelamento: parcelamentoToRow(parcelamento),
      p_lancamentos: novos.map(lancamentoToRow),
      p_apagar_ids: apagarIds,
    });
    if (error) { toast.error("Erro ao salvar parcelamento"); return null; }
    await Promise.all([carregarParc(), carregarLanc()]);
    const resultado = data as { parcelamento: Database["public"]["Tables"]["parcelamentos"]["Row"] };
    return mapParcelamento(resultado.parcelamento);
  }, [carregarParc, carregarLanc]);

  const excluirParcelamento = useCallback(async (id: string, manterIds: string[] = []): Promise<boolean> => {
    const { error } = await supabase.rpc("excluir_parcelamento", { p_id: id, p_manter_ids: manterIds });
    if (error) { toast.error("Erro ao excluir parcelamento"); return false; }
    await Promise.all([carregarParc(), carregarLanc()]);
    return true;
  }, [carregarParc, carregarLanc]);

  // ─── Orçamento ───────────────────────────────────────────────────────────

  const orcamentos = orcE.itens;

  /** Define (ou remove, com null) o override de limite para vários meses de uma vez. */
  const definirLimiteMeses = useCallback(async (slug: string, inicio: MesAno, quantidade: number, limite: number | null): Promise<boolean> => {
    if (!householdId) return false;
    const meses = Array.from({ length: quantidade }, (_, i) => somarMeses(inicio.mes, inicio.ano, i));
    if (limite == null) {
      const alvos = orcamentos.filter((o) => o.subcategoriaSlug === slug && meses.some((m) => m.mes === o.mes && m.ano === o.ano));
      const { error } = await supabase.from("orcamentos").delete().in("id", alvos.map((o) => o.id));
      if (error) { toast.error("Erro ao remover limite do mês"); return false; }
    } else {
      const { error } = await supabase.from("orcamentos").upsert(
        meses.map((m) => ({ household_id: householdId, subcategoria_slug: slug, ano: m.ano, mes: m.mes, limite })),
        { onConflict: "household_id,subcategoria_slug,ano,mes" },
      );
      if (error) { toast.error("Erro ao salvar limite do mês"); return false; }
    }
    await carregarOrc();
    return true;
  }, [householdId, orcamentos, carregarOrc]);

  const subcategorias = subE.itens;

  /** Salva a nova ordem (índice na lista) das subcategorias. */
  const reordenarSubcategorias = useCallback(async (ordenadas: Subcategoria[]) => {
    const comOrdem = ordenadas.map((s, i) => ({ ...s, ordem: i + 1 }));
    setSubcategorias(comOrdem);
    const { error } = await supabase
      .from("subcategorias")
      .upsert(comOrdem.map((s) => ({ id: s.id, household_id: householdId, ...subcategoriaToRow(s) })));
    if (error) { toast.error("Erro ao reordenar subcategorias"); carregarSub(); }
  }, [householdId, setSubcategorias, carregarSub]);

  // ─── Prioridades ─────────────────────────────────────────────────────────

  const reordenarPrioridades = useCallback(async (ordenadas: { id: string }[]) => {
    const ordem = new Map(ordenadas.map((p, i) => [p.id, i + 1]));
    const atualizadas = prioridades.map((p) => (ordem.has(p.id) ? { ...p, ordem: ordem.get(p.id) } : p));
    setPrioridades(atualizadas);
    const { error } = await supabase
      .from("prioridades")
      .upsert(atualizadas.filter((p) => ordem.has(p.id)).map(({ id, ...p }) => ({ id, household_id: householdId, ...prioridadeToRow(p) })));
    if (error) { toast.error("Erro ao reordenar prioridades"); carregarPrio(); }
  }, [householdId, prioridades, setPrioridades, carregarPrio]);

  // ─── Cartões ────────────────────────────────────────────────────────────

  // ON DELETE SET NULL limpa cartao_id no banco; recarrega para refletir em memória.
  const { remove: removeCartao } = cartoesE;
  const deleteCartao = useCallback(async (id: string) => {
    const ok = await removeCartao(id);
    if (ok) await Promise.all([carregarLanc(), carregarParc(), carregarPrio(), carregarRec()]);
    return ok;
  }, [removeCartao, carregarLanc, carregarParc, carregarPrio, carregarRec]);

  // ─── Faturas pagas ───────────────────────────────────────────────────────

  const faturasPagas = fatE.itens;

  const marcarFaturaPaga = useCallback(
    (cartaoId: string, { mes, ano }: MesAno) => addFatura({ cartaoId, mes, ano, pagoEm: toISODate(new Date()) }),
    [addFatura],
  );

  const desmarcarFaturaPaga = useCallback(async (cartaoId: string, { mes, ano }: MesAno) => {
    const alvo = faturasPagas.find((f) => f.cartaoId === cartaoId && f.mes === mes && f.ano === ano);
    return alvo ? removeFatura(alvo.id) : true;
  }, [faturasPagas, removeFatura]);

  // ─── Household ───────────────────────────────────────────────────────────

  const entrarHousehold = useCallback(async (codigo: string): Promise<boolean> => {
    const { error } = await supabase.rpc("entrar_household", { _codigo: codigo });
    if (error) {
      toast.error(error.message.includes("não encontrado") ? "Código de convite não encontrado" : "Erro ao entrar no household");
      return false;
    }
    return true;
  }, []);

  // ─── Recorrências: gera lançamentos do mês aberto (passado, atual ou +1) ──

  const recorrencias = recE.itens;
  const cartoes = cartoesE.itens;
  const geradosRef = useRef(new Set<string>());

  useEffect(() => {
    if (loading || recorrencias.length === 0) return;
    const alvo = { mes: mesSelecionado, ano: anoSelecionado };
    const agora = new Date();
    if (compararMesAno(alvo, somarMeses(agora.getMonth(), agora.getFullYear(), 1)) > 0) return;
    const novos = lancamentosRecorrentesDoMes(recorrencias, lancamentos, alvo, agora, cartoes);
    const chave = `${anoSelecionado}-${mesSelecionado}-${novos.map((n) => n.recorrenciaId).join(",")}`;
    if (novos.length === 0 || geradosRef.current.has(chave)) return;
    geradosRef.current.add(chave);
    inserirLancamentos(novos).then((inseridos) => {
      if (inseridos?.length) toast.success(`${inseridos.length} lançamento(s) recorrente(s) gerado(s)`);
    });
  }, [loading, recorrencias, lancamentos, cartoes, mesSelecionado, anoSelecionado, inserirLancamentos]);

  // ─── Derivados ───────────────────────────────────────────────────────────

  const subcategoriasAtivas = useMemo(
    () => [...subcategorias].filter((s) => s.ativa).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)),
    [subcategorias],
  );
  const getSubcategoria = useCallback((slug: string | null | undefined) => subcategorias.find((s) => s.slug === slug) ?? null, [subcategorias]);
  const getCartao = useCallback((id: string | null | undefined) => cartoes.find((c) => c.id === id) ?? null, [cartoes]);
  const limiteEfetivo = useCallback(
    (slug: string, ano: number, mes: number) => calcLimiteEfetivo(slug, ano, mes, subcategorias, orcamentos),
    [subcategorias, orcamentos],
  );
  const lancamentosDoMes = useCallback(
    (ano: number, mes: number) => lancamentos.filter((l) => l.mes === mes && l.ano === ano),
    [lancamentos],
  );
  const faturasDoCartao = useCallback((cartaoId: string) => {
    const cartao = cartoes.find((c) => c.id === cartaoId);
    return cartao ? calcFaturasDoCartao(cartao, lancamentos, faturasPagas, new Date()) : [];
  }, [cartoes, lancamentos, faturasPagas]);
  const resumoFatura = useCallback((cartaoId: string, competencia: MesAno) => {
    const cartao = cartoes.find((c) => c.id === cartaoId);
    return cartao ? calcResumoFatura(cartao, competencia, lancamentos, faturasPagas, new Date()) : null;
  }, [cartoes, lancamentos, faturasPagas]);
  const statusLancamentoCartao = useCallback(
    (l: Lancamento) => calcStatusLancamento(l, cartoes, faturasPagas, new Date()),
    [cartoes, faturasPagas],
  );
  const progressoParcelamento = useCallback(
    (p: Parcelamento) => calcProgresso(p, lancamentos, cartoes, faturasPagas, new Date()),
    [lancamentos, cartoes, faturasPagas],
  );

  const lancamentosMes = useMemo(() => lancamentosDoMes(anoSelecionado, mesSelecionado), [lancamentosDoMes, anoSelecionado, mesSelecionado]);
  const somaCategoria = (c: Lancamento["categoria"]) => sumMoney(lancamentosMes.filter((l) => l.categoria === c).map((l) => l.valor));
  const entradas = somaCategoria("entrada");
  const reembolsos = sumMoney(lancamentosMes.filter((l) => l.categoria === "entrada" && l.reembolso).map((l) => l.valor));
  const rendaPlanejamento = sumMoney([entradas, -reembolsos]);
  const contasFixas = somaCategoria("conta_fixa");
  const totalCartao = somaCategoria("cartao");
  const variaveis = somaCategoria("variavel");
  const totalSaidas = sumMoney([contasFixas, totalCartao, variaveis]);
  const saldo = sumMoney([entradas, -totalSaidas]);

  const irParaMes = useCallback((delta: number) => {
    const alvo = somarMeses(mesSelecionado, anoSelecionado, delta);
    setMesSelecionado(alvo.mes);
    setAnoSelecionado(alvo.ano);
  }, [mesSelecionado, anoSelecionado]);

  return {
    loading, ocultarValores, setOcultarValores,
    mesSelecionado, setMesSelecionado, anoSelecionado, setAnoSelecionado, irParaMes,
    // entidades
    metas: metasE.itens, aportes: aportesE.itens, lancamentos, parcelamentos: parcE.itens, prioridades,
    cartoes, subcategorias, orcamentos, recorrencias, faturasPagas, membros, household,
    // totais do mês selecionado
    lancamentosMes, entradas, reembolsos, rendaPlanejamento, contasFixas, totalCartao, variaveis, totalSaidas, saldo,
    // helpers derivados
    subcategoriasAtivas, getSubcategoria, getCartao, limiteEfetivo, lancamentosDoMes, faturasDoCartao, resumoFatura,
    statusLancamentoCartao, progressoParcelamento,
    // CRUD
    addMeta: metasE.add, updateMeta: metasE.update, deleteMeta: metasE.remove,
    addAporte: aportesE.add, deleteAporte: aportesE.remove,
    addLancamento, updateLancamento: lancE.update, deleteLancamento: lancE.remove,
    inserirLancamentos, updateLancamentos, deleteLancamentos,
    updateParcelamento: parcE.update, salvarParcelamento, excluirParcelamento,
    addPrioridade: prioE.add, updatePrioridade: prioE.update, deletePrioridade: prioE.remove, reordenarPrioridades,
    addCartao: cartoesE.add, updateCartao: cartoesE.update, deleteCartao,
    addSubcategoria: subE.add, updateSubcategoria: subE.update, reordenarSubcategorias,
    definirLimiteMeses,
    addRecorrencia: recE.add, updateRecorrencia: recE.update, deleteRecorrencia: recE.remove,
    marcarFaturaPaga, desmarcarFaturaPaga,
    entrarHousehold, recarregarMembros: carregarMembros,
  };
}

type FinanceContextType = ReturnType<typeof useFinanceDataInternal>;
const FinanceCtx = createContext<FinanceContextType | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const value = useFinanceDataInternal();
  return createElement(FinanceCtx.Provider, { value }, children);
}

export function useFinanceData() {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error("useFinanceData deve ser usado dentro de <FinanceProvider>");
  return ctx;
}

// Lista padrão (referência/fallback). A fonte da verdade é a tabela subcategorias (seed_subcategorias).
export const SUBCATEGORIAS_PADRAO: Omit<Subcategoria, "id">[] = [
  { slug: "alimentacao",       label: "Alimentação",                   cor: "#10B981", limitePadrao: 1880, tipo: "necessidade", contaNoOrcamento: true,  ordem: 1,  ativa: true },
  { slug: "reserva",           label: "Reserva / Investimentos",       cor: "#84CC16", limitePadrao: 1500, tipo: "poupanca",    contaNoOrcamento: true,  ordem: 2,  ativa: true },
  { slug: "gastos_extras",     label: "Gastos Extras / Parcelamentos", cor: "#EF4444", limitePadrao: 850,  tipo: "desejo",      contaNoOrcamento: true,  ordem: 3,  ativa: true },
  { slug: "manutencao",        label: "Manutenção",                    cor: "#F97316", limitePadrao: 800,  tipo: "necessidade", contaNoOrcamento: true,  ordem: 4,  ativa: true },
  { slug: "transporte",        label: "Transporte",                    cor: "#F59E0B", limitePadrao: 750,  tipo: "necessidade", contaNoOrcamento: true,  ordem: 5,  ativa: true },
  { slug: "dizimo",            label: "Dízimos",                       cor: "#A16207", limitePadrao: 730,  tipo: "doacao",      contaNoOrcamento: true,  ordem: 6,  ativa: true },
  { slug: "gastos_pessoais",   label: "Gastos Pessoais",               cor: "#EC4899", limitePadrao: 700,  tipo: "desejo",      contaNoOrcamento: true,  ordem: 7,  ativa: true },
  { slug: "saude",             label: "Saúde",                         cor: "#3B82F6", limitePadrao: 700,  tipo: "necessidade", contaNoOrcamento: true,  ordem: 8,  ativa: true },
  { slug: "lazer",             label: "Lazer",                         cor: "#8B5CF6", limitePadrao: 600,  tipo: "desejo",      contaNoOrcamento: true,  ordem: 9,  ativa: true },
  { slug: "assinaturas",       label: "Assinaturas",                   cor: "#06B6D4", limitePadrao: 500,  tipo: "desejo",      contaNoOrcamento: true,  ordem: 10, ativa: true },
  { slug: "moradia",           label: "Moradia & Contas Fixas",        cor: "#64748B", limitePadrao: 490,  tipo: "necessidade", contaNoOrcamento: true,  ordem: 11, ativa: true },
  { slug: "compras_terceiros", label: "Compras de Terceiros",          cor: "#14B8A6", limitePadrao: 0,    tipo: "terceiros",   contaNoOrcamento: false, ordem: 12, ativa: true },
];
