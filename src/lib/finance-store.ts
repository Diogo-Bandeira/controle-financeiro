import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { createElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Meta {
  id: string;
  nome: string;
  valorMeta: number;
  valorAtual: number;
  rendimento: number;
}

export interface Lancamento {
  id: string;
  descricao: string;
  valor: number;
  categoria: "entrada" | "conta_fixa" | "cartao" | "variavel";
  mes: number;
  ano: number;
  subcategoria?: string | null;
  cartao_nome?: string | null;
}

export interface Parcelamento {
  id: string;
  descricao: string;
  valorTotal: number;
  parcelas: number;
  parcelasPagas: number;
  valorParcela: number;
}

export interface Prioridade {
  id: string;
  descricao: string;
  valor: number;
  prioridade: "alta" | "media" | "baixa";
  concluida: boolean;
}

type FinanceContextType = ReturnType<typeof useFinanceDataInternal>;
const FinanceCtx = createContext<FinanceContextType | null>(null);

function useFinanceDataInternal() {
  const { householdId } = useAuth();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[]>([]);
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!householdId) return;

    const loadData = async () => {
      setLoading(true);
      const [metasRes, lancRes, parcRes, prioRes] = await Promise.all([
        supabase.from("metas").select("*").eq("household_id", householdId),
        supabase.from("lancamentos").select("*").eq("household_id", householdId),
        supabase.from("parcelamentos").select("*").eq("household_id", householdId).order("created_at", { ascending: true }),
        supabase.from("prioridades").select("*").eq("household_id", householdId),
      ]);

      if (metasRes.error) toast.error("Erro ao carregar metas");
      if (lancRes.error) toast.error("Erro ao carregar lançamentos");
      if (parcRes.error) toast.error("Erro ao carregar parcelamentos");
      if (prioRes.error) toast.error("Erro ao carregar prioridades");

      setMetas((metasRes.data ?? []).map(m => ({
        id: m.id, nome: m.nome, valorMeta: Number(m.valor_meta), valorAtual: Number(m.valor_atual), rendimento: Number(m.rendimento)
      })));
      
      setLancamentos((lancRes.data ?? []).map(l => ({
        id: l.id,
        descricao: l.descricao,
        valor: Number(l.valor),
        categoria: l.categoria as Lancamento["categoria"],
        mes: l.mes,
        ano: l.ano,
        subcategoria: l.subcategoria ?? null,
        cartao_nome: l.cartao_nome ?? null,
      })));

      setParcelamentos((parcRes.data ?? []).map(p => ({
        id: p.id, descricao: p.descricao, valorTotal: Number(p.valor_total), parcelas: p.parcelas, parcelasPagas: p.parcelas_pagas, valorParcela: Number(p.valor_parcela)
      })));

      setPrioridades((prioRes.data ?? []).map(p => ({
        id: p.id, descricao: p.descricao, valor: Number(p.valor), prioridade: p.prioridade as Prioridade["prioridade"], concluida: p.concluida
      })));

      setLoading(false);
    };

    loadData();
  }, [householdId]);

  const addLancamento = useCallback(async (l: Omit<Lancamento, "id">) => {
    if (!householdId) return;
    const { data, error } = await supabase
      .from("lancamentos")
      .insert({
        household_id: householdId,
        descricao: l.descricao,
        valor: l.valor,
        categoria: l.categoria,
        mes: l.mes,
        ano: l.ano,
        subcategoria: l.subcategoria ?? null,
        cartao_nome: l.cartao_nome ?? null,
      })
      .select().single();

    if (error) { toast.error("Erro ao adicionar lançamento"); return; }
    if (data) {
      setLancamentos(prev => [...prev, {
        id: data.id,
        descricao: data.descricao,
        valor: Number(data.valor),
        categoria: data.categoria as Lancamento["categoria"],
        mes: data.mes,
        ano: data.ano,
        subcategoria: data.subcategoria ?? null,
        cartao_nome: data.cartao_nome ?? null,
      }]);
    }
  }, [householdId]);

  const updateLancamento = useCallback(async (l: Lancamento) => {
    const { error } = await supabase
      .from("lancamentos")
      .update({
        descricao: l.descricao,
        valor: l.valor,
        categoria: l.categoria,
        mes: l.mes,
        ano: l.ano,
        subcategoria: l.subcategoria ?? null,
        cartao_nome: l.cartao_nome ?? null,
      })
      .eq("id", l.id);
    if (error) { toast.error("Erro ao atualizar lançamento"); return; }
    setLancamentos(prev => prev.map(x => x.id === l.id ? l : x));
  }, []);

  const deleteLancamento = useCallback(async (id: string) => {
    const { error } = await supabase.from("lancamentos").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar lançamento"); return; }
    setLancamentos(prev => prev.filter(l => l.id !== id));
  }, []);

  const addParcelamento = useCallback(async (p: Omit<Parcelamento, "id">) => {
    if (!householdId) return;
    const { data, error } = await supabase
      .from("parcelamentos")
      .insert({
        household_id: householdId,
        descricao: p.descricao,
        valor_total: p.valorTotal,
        parcelas: p.parcelas,
        parcelas_pagas: p.parcelasPagas,
        valor_parcela: p.valorParcela,
      })
      .select().single();
    if (error) { toast.error("Erro ao adicionar parcelamento"); return; }
    if (data) {
      setParcelamentos(prev => [...prev, {
        id: data.id, descricao: data.descricao, valorTotal: Number(data.valor_total), parcelas: data.parcelas, parcelasPagas: data.parcelas_pagas, valorParcela: Number(data.valor_parcela)
      }]);
    }
  }, [householdId]);

  // Função BLINDADA para atualizar o parcelamento e avisar caso o banco bloqueie
  const updateParcelamento = useCallback(async (p: Parcelamento) => {
    const { data, error } = await supabase
      .from("parcelamentos")
      .update({
        descricao: p.descricao,
        valor_total: p.valorTotal,
        parcelas: p.parcelas,
        parcelas_pagas: p.parcelasPagas,
        valor_parcela: p.valorParcela,
      })
      .eq("id", p.id)
      .select(); // Obrigatório para o Supabase devolver o resultado

    if (error) { 
      toast.error("Erro ao atualizar banco de dados."); 
      return; 
    }

    if (!data || data.length === 0) {
      toast.error("Pagamento NÃO registrado! Verifique a permissão de UPDATE (RLS) no Supabase.");
      return;
    }

    setParcelamentos(prev => prev.map(x => x.id === p.id ? p : x));
    toast.success("Pagamento registrado com sucesso!");
  }, []);

  const deleteParcelamento = useCallback(async (id: string) => {
    const { error } = await supabase.from("parcelamentos").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar parcelamento"); return; }
    setParcelamentos(prev => prev.filter(p => p.id !== id));
  }, []);

  // CRUD Metas
  const addMeta = useCallback(async (meta: Omit<Meta, "id">) => {
    if (!householdId) return;
    const { data, error } = await supabase.from("metas").insert({
      household_id: householdId, nome: meta.nome, valor_meta: meta.valorMeta, valor_atual: meta.valorAtual, rendimento: meta.rendimento
    }).select().single();
    if (error) { toast.error("Erro ao adicionar meta"); return; }
    if (data) setMetas(prev => [...prev, { id: data.id, nome: data.nome, valorMeta: Number(data.valor_meta), valorAtual: Number(data.valor_atual), rendimento: Number(data.rendimento) }]);
  }, [householdId]);

  const updateMeta = useCallback(async (meta: Meta) => {
    const { error } = await supabase.from("metas").update({ nome: meta.nome, valor_meta: meta.valorMeta, valor_atual: meta.valorAtual, rendimento: meta.rendimento }).eq("id", meta.id);
    if (error) { toast.error("Erro ao atualizar meta"); return; }
    setMetas(prev => prev.map(m => m.id === meta.id ? meta : m));
  }, []);

  const deleteMeta = useCallback(async (id: string) => {
    const { error } = await supabase.from("metas").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar meta"); return; }
    setMetas(prev => prev.filter(m => m.id !== id));
  }, []);

  // CRUD Prioridades
  const addPrioridade = useCallback(async (p: Omit<Prioridade, "id">) => {
    if (!householdId) return;
    const { data, error } = await supabase.from("prioridades").insert({ household_id: householdId, descricao: p.descricao, valor: p.valor, prioridade: p.prioridade, concluida: p.concluida }).select().single();
    if (error) { toast.error("Erro ao adicionar prioridade"); return; }
    if (data) setPrioridades(prev => [...prev, { id: data.id, descricao: data.descricao, valor: Number(data.valor), prioridade: data.prioridade as Prioridade["prioridade"], concluida: data.concluida }]);
  }, [householdId]);

  const updatePrioridade = useCallback(async (p: Prioridade) => {
    const { error } = await supabase.from("prioridades").update({ descricao: p.descricao, valor: p.valor, prioridade: p.prioridade, concluida: p.concluida }).eq("id", p.id);
    if (error) { toast.error("Erro ao atualizar prioridade"); return; }
    setPrioridades(prev => prev.map(x => x.id === p.id ? p : x));
  }, []);

  const deletePrioridade = useCallback(async (id: string) => {
    const { error } = await supabase.from("prioridades").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar prioridade"); return; }
    setPrioridades(prev => prev.filter(p => p.id !== id));
  }, []);

  const lancamentosMes = lancamentos.filter(l => l.mes === mesSelecionado && l.ano === anoSelecionado);
  const entradas = lancamentosMes.filter(l => l.categoria === "entrada").reduce((s, l) => s + l.valor, 0);
  const contasFixas = lancamentosMes.filter(l => l.categoria === "conta_fixa").reduce((s, l) => s + l.valor, 0);
  const cartoes = lancamentosMes.filter(l => l.categoria === "cartao").reduce((s, l) => s + l.valor, 0);
  const variaveis = lancamentosMes.filter(l => l.categoria === "variavel").reduce((s, l) => s + l.valor, 0);
  const totalSaidas = contasFixas + cartoes + variaveis;
  const saldo = entradas - totalSaidas;

  return {
    metas, lancamentos, parcelamentos, prioridades,
    mesSelecionado, setMesSelecionado,
    anoSelecionado, setAnoSelecionado,
    loading, lancamentosMes,
    entradas, contasFixas, cartoes, variaveis, totalSaidas, saldo,
    addMeta, updateMeta, deleteMeta,
    addLancamento, updateLancamento, deleteLancamento,
    addParcelamento, updateParcelamento, deleteParcelamento,
    addPrioridade, updatePrioridade, deletePrioridade,
  };
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const value = useFinanceDataInternal();
  return createElement(FinanceCtx.Provider, { value }, children);
}

export function useFinanceData() {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error("useFinanceData deve ser usado dentro de <FinanceProvider>");
  return ctx;
}

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const CATEGORIAS: Record<string, string> = { entrada: "Entradas", conta_fixa: "Contas Fixas", cartao: "Compras no Cartão", variavel: "Variáveis" };

// Subcategorias (tipo de gasto) de qualquer saída, com teto mensal planejado
export interface Subcategoria { valor: string; label: string; cor: string; limite: number }
export const SUBCATEGORIAS: Subcategoria[] = [
  { valor: "alimentacao",     label: "Alimentação",                   cor: "#10B981", limite: 1880 },
  { valor: "moradia",         label: "Moradia & Contas Fixas",        cor: "#64748B", limite: 500 },
  { valor: "manutencao",      label: "Manutenção",                    cor: "#F97316", limite: 940 },
  { valor: "transporte",      label: "Transporte",                    cor: "#F59E0B", limite: 800 },
  { valor: "saude",           label: "Saúde",                         cor: "#3B82F6", limite: 700 },
  { valor: "gastos_pessoais", label: "Gastos Pessoais",               cor: "#EC4899", limite: 940 },
  { valor: "assinaturas",     label: "Assinaturas",                   cor: "#06B6D4", limite: 550 },
  { valor: "lazer",           label: "Lazer",                         cor: "#8B5CF6", limite: 700 },
  { valor: "gastos_extras",   label: "Gastos Extras / Parcelamentos", cor: "#EF4444", limite: 850 },
  { valor: "reserva",         label: "Reserva / Investimentos",       cor: "#84CC16", limite: 1800 },
];
export function formatCurrency(value: number): string { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }