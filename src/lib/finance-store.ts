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
  categoria: "entrada" | "dizimo" | "conta_fixa" | "cartao" | "variavel";
  mes: number;
  ano: number;
  subcategoria?: string | null; // Tipo de gasto (Lazer, Alimentação, etc)
  cartao_nome?: string | null;  // NOVO: Nome do cartão (Itau, Nubank, etc)
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
        supabase.from("parcelamentos").select("*").eq("household_id", householdId),
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
        cartao_nome: l.cartao_nome ?? null, // Carregando o nome do cartão
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
        cartao_nome: l.cartao_nome ?? null, // Salvando o nome do cartão
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
        cartao_nome: l.cartao_nome ?? null, // Atualizando o nome do cartão
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

  // Helpers de CRUD para outras entidades omitidos por brevidade, manter iguais ao original
  const addMeta = useCallback(async (meta: Omit<Meta, "id">) => { /* manter original */ }, [householdId]);
  const updateMeta = useCallback(async (meta: Meta) => { /* manter original */ }, []);
  const deleteMeta = useCallback(async (id: string) => { /* manter original */ }, []);
  const addParcelamento = useCallback(async (p: Omit<Parcelamento, "id">) => { /* manter original */ }, [householdId]);
  const updateParcelamento = useCallback(async (p: Parcelamento) => { /* manter original */ }, []);
  const deleteParcelamento = useCallback(async (id: string) => { /* manter original */ }, []);
  const addPrioridade = useCallback(async (p: Omit<Prioridade, "id">) => { /* manter original */ }, [householdId]);
  const updatePrioridade = useCallback(async (p: Prioridade) => { /* manter original */ }, []);
  const deletePrioridade = useCallback(async (id: string) => { /* manter original */ }, []);

  const lancamentosMes = lancamentos.filter(l => l.mes === mesSelecionado && l.ano === anoSelecionado);
  const entradas = lancamentosMes.filter(l => l.categoria === "entrada").reduce((s, l) => s + l.valor, 0);
  const dizimos = lancamentosMes.filter(l => l.categoria === "dizimo").reduce((s, l) => s + l.valor, 0);
  const contasFixas = lancamentosMes.filter(l => l.categoria === "conta_fixa").reduce((s, l) => s + l.valor, 0);
  const cartoes = lancamentosMes.filter(l => l.categoria === "cartao").reduce((s, l) => s + l.valor, 0);
  const variaveis = lancamentosMes.filter(l => l.categoria === "variavel").reduce((s, l) => s + l.valor, 0);
  const totalSaidas = dizimos + contasFixas + cartoes + variaveis;
  const saldo = entradas - totalSaidas;

  return {
    metas, lancamentos, parcelamentos, prioridades,
    mesSelecionado, setMesSelecionado,
    anoSelecionado, setAnoSelecionado,
    loading, lancamentosMes,
    entradas, dizimos, contasFixas, cartoes, variaveis, totalSaidas, saldo,
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
export const CATEGORIAS: Record<string, string> = { entrada: "Entradas", dizimo: "Dízimos", conta_fixa: "Contas Fixas", cartao: "Compras no Cartão", variavel: "Variáveis" };
export function formatCurrency(value: number): string { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }