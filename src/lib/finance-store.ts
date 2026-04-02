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
  ano: number; // CORRIGIDO: adicionado ano para evitar mistura entre anos
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

// ─── Context ──────────────────────────────────────────────────────────────────

type FinanceContextType = ReturnType<typeof useFinanceDataInternal>;
const FinanceCtx = createContext<FinanceContextType | null>(null);

// ─── Internal hook (lógica real) ─────────────────────────────────────────────

function useFinanceDataInternal() {
  const { householdId } = useAuth();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [parcelamentos, setParcelamentos] = useState<Parcelamento[]>([]);
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  // CORRIGIDO: loading começa false; vai true só durante fetch real
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // CORRIGIDO: se não há householdId, mantém loading=false sem travar
    if (!householdId) return;

    const loadData = async () => {
      setLoading(true);
      const [metasRes, lancRes, parcRes, prioRes] = await Promise.all([
        supabase.from("metas").select("*").eq("household_id", householdId),
        supabase.from("lancamentos").select("*").eq("household_id", householdId),
        supabase.from("parcelamentos").select("*").eq("household_id", householdId),
        supabase.from("prioridades").select("*").eq("household_id", householdId),
      ]);

      // CORRIGIDO: erros do Supabase agora geram toast para o usuário
      if (metasRes.error) toast.error("Erro ao carregar metas");
      if (lancRes.error) toast.error("Erro ao carregar lançamentos");
      if (parcRes.error) toast.error("Erro ao carregar parcelamentos");
      if (prioRes.error) toast.error("Erro ao carregar prioridades");

      setMetas(
        (metasRes.data ?? []).map((m) => ({
          id: m.id,
          nome: m.nome,
          valorMeta: Number(m.valor_meta),
          valorAtual: Number(m.valor_atual),
          rendimento: Number(m.rendimento),
        }))
      );
      setLancamentos(
        (lancRes.data ?? []).map((l) => ({
          id: l.id,
          descricao: l.descricao,
          valor: Number(l.valor),
          categoria: l.categoria as Lancamento["categoria"],
          mes: l.mes,
          ano: l.ano, // CORRIGIDO: inclui ano
        }))
      );
      setParcelamentos(
        (parcRes.data ?? []).map((p) => ({
          id: p.id,
          descricao: p.descricao,
          valorTotal: Number(p.valor_total),
          parcelas: p.parcelas,
          parcelasPagas: p.parcelas_pagas,
          valorParcela: Number(p.valor_parcela),
        }))
      );
      setPrioridades(
        (prioRes.data ?? []).map((p) => ({
          id: p.id,
          descricao: p.descricao,
          valor: Number(p.valor),
          prioridade: p.prioridade as Prioridade["prioridade"],
          concluida: p.concluida,
        }))
      );
      setLoading(false);
    };

    loadData();
  }, [householdId]);

  // ─── CRUD: Metas ───────────────────────────────────────────────────────────

  const addMeta = useCallback(
    async (meta: Omit<Meta, "id">) => {
      if (!householdId) return;
      const { data, error } = await supabase
        .from("metas")
        .insert({
          household_id: householdId,
          nome: meta.nome,
          valor_meta: meta.valorMeta,
          valor_atual: meta.valorAtual,
          rendimento: meta.rendimento,
        })
        .select()
        .single();
      if (error) { toast.error("Erro ao adicionar meta"); return; }
      if (data) {
        setMetas((prev) => [
          ...prev,
          { id: data.id, nome: data.nome, valorMeta: Number(data.valor_meta), valorAtual: Number(data.valor_atual), rendimento: Number(data.rendimento) },
        ]);
      }
    },
    [householdId]
  );

  const updateMeta = useCallback(
    async (meta: Meta) => {
      const { error } = await supabase
        .from("metas")
        .update({ nome: meta.nome, valor_meta: meta.valorMeta, valor_atual: meta.valorAtual, rendimento: meta.rendimento })
        .eq("id", meta.id);
      if (error) { toast.error("Erro ao atualizar meta"); return; }
      setMetas((prev) => prev.map((m) => (m.id === meta.id ? meta : m)));
    },
    []
  );

  const deleteMeta = useCallback(async (id: string) => {
    const { error } = await supabase.from("metas").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar meta"); return; }
    setMetas((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ─── CRUD: Lançamentos ─────────────────────────────────────────────────────

  const addLancamento = useCallback(
    async (l: Omit<Lancamento, "id">) => {
      if (!householdId) return;
      const { data, error } = await supabase
        .from("lancamentos")
        .insert({
          household_id: householdId,
          descricao: l.descricao,
          valor: l.valor,
          categoria: l.categoria,
          mes: l.mes,
          ano: l.ano, // CORRIGIDO: salva o ano
        })
        .select()
        .single();
      if (error) { toast.error("Erro ao adicionar lançamento"); return; }
      if (data) {
        setLancamentos((prev) => [
          ...prev,
          { id: data.id, descricao: data.descricao, valor: Number(data.valor), categoria: data.categoria as Lancamento["categoria"], mes: data.mes, ano: data.ano },
        ]);
      }
    },
    [householdId]
  );

  const updateLancamento = useCallback(async (l: Lancamento) => {
  const { error } = await supabase
    .from("lancamentos")
    .update({
      descricao: l.descricao,
      valor: l.valor,
      categoria: l.categoria,
      mes: l.mes,
      ano: l.ano,
    })
    .eq("id", l.id);
  if (error) { toast.error("Erro ao atualizar lançamento"); return; }
  setLancamentos((prev) => prev.map((x) => (x.id === l.id ? l : x)));
}, []);

  const deleteLancamento = useCallback(async (id: string) => {
    const { error } = await supabase.from("lancamentos").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar lançamento"); return; }
    setLancamentos((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ─── CRUD: Parcelamentos ───────────────────────────────────────────────────

  const addParcelamento = useCallback(
    async (p: Omit<Parcelamento, "id">) => {
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
        .select()
        .single();
      if (error) { toast.error("Erro ao adicionar parcelamento"); return; }
      if (data) {
        setParcelamentos((prev) => [
          ...prev,
          {
            id: data.id,
            descricao: data.descricao,
            valorTotal: Number(data.valor_total),
            parcelas: data.parcelas,
            parcelasPagas: data.parcelas_pagas,
            valorParcela: Number(data.valor_parcela),
          },
        ]);
      }
    },
    [householdId]
  );

  const updateParcelamento = useCallback(async (p: Parcelamento) => {
    // CORRIGIDO: atualiza todos os campos, não só parcelas_pagas
    const { error } = await supabase
      .from("parcelamentos")
      .update({
        descricao: p.descricao,
        valor_total: p.valorTotal,
        parcelas: p.parcelas,
        parcelas_pagas: p.parcelasPagas,
        valor_parcela: p.valorParcela,
      })
      .eq("id", p.id);
    if (error) { toast.error("Erro ao atualizar parcelamento"); return; }
    setParcelamentos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  }, []);

  const deleteParcelamento = useCallback(async (id: string) => {
    const { error } = await supabase.from("parcelamentos").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar parcelamento"); return; }
    setParcelamentos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ─── CRUD: Prioridades ─────────────────────────────────────────────────────

  const addPrioridade = useCallback(
    async (p: Omit<Prioridade, "id">) => {
      if (!householdId) return;
      const { data, error } = await supabase
        .from("prioridades")
        .insert({ household_id: householdId, descricao: p.descricao, valor: p.valor, prioridade: p.prioridade, concluida: p.concluida })
        .select()
        .single();
      if (error) { toast.error("Erro ao adicionar prioridade"); return; }
      if (data) {
        setPrioridades((prev) => [
          ...prev,
          { id: data.id, descricao: data.descricao, valor: Number(data.valor), prioridade: data.prioridade as Prioridade["prioridade"], concluida: data.concluida },
        ]);
      }
    },
    [householdId]
  );

  const updatePrioridade = useCallback(async (p: Prioridade) => {
    // CORRIGIDO: atualiza todos os campos, não só concluida
    const { error } = await supabase
      .from("prioridades")
      .update({ descricao: p.descricao, valor: p.valor, prioridade: p.prioridade, concluida: p.concluida })
      .eq("id", p.id);
    if (error) { toast.error("Erro ao atualizar prioridade"); return; }
    setPrioridades((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  }, []);

  const deletePrioridade = useCallback(async (id: string) => {
    const { error } = await supabase.from("prioridades").delete().eq("id", id);
    if (error) { toast.error("Erro ao deletar prioridade"); return; }
    setPrioridades((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ─── Computed values ───────────────────────────────────────────────────────

  // CORRIGIDO: filtra por mes E ano para não misturar anos diferentes
  const lancamentosMes = lancamentos.filter(
    (l) => l.mes === mesSelecionado && l.ano === anoSelecionado
  );
  const entradas = lancamentosMes.filter((l) => l.categoria === "entrada").reduce((s, l) => s + l.valor, 0);
  const dizimos = lancamentosMes.filter((l) => l.categoria === "dizimo").reduce((s, l) => s + l.valor, 0);
  const contasFixas = lancamentosMes.filter((l) => l.categoria === "conta_fixa").reduce((s, l) => s + l.valor, 0);
  const cartoes = lancamentosMes.filter((l) => l.categoria === "cartao").reduce((s, l) => s + l.valor, 0);
  const variaveis = lancamentosMes.filter((l) => l.categoria === "variavel").reduce((s, l) => s + l.valor, 0);
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

// ─── Provider (envolve o app para compartilhar estado entre páginas) ──────────

export function FinanceProvider({ children }: { children: ReactNode }) {
  const value = useFinanceDataInternal();
  return createElement(FinanceCtx.Provider, { value }, children);
}

// ─── Hook público (lê do Context compartilhado) ───────────────────────────────

export function useFinanceData() {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error("useFinanceData deve ser usado dentro de <FinanceProvider>");
  return ctx;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const CATEGORIAS: Record<string, string> = {
  entrada: "Entradas",
  dizimo: "Dízimos",
  conta_fixa: "Contas Fixas",
  cartao: "Cartões de Crédito",
  variavel: "Variáveis",
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
