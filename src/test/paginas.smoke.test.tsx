import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FinanceProvider } from "@/lib/finance-store";

// Supabase falso: toda consulta resolve vazia; tabelas com uma linha mínima para exercitar os cards.
const HOUSEHOLD = "h1";
const linhas: Record<string, unknown[]> = {
  cartoes: [{ id: "c1", household_id: HOUSEHOLD, nome: "Bradesco", banco: null, cor: "#EF4444", dia_fechamento: 3, dia_vencimento: 10, limite: 5000, titular: null, ativo: true }],
  subcategorias: [{ id: "s1", household_id: HOUSEHOLD, slug: "lazer", label: "Lazer", cor: "#8B5CF6", limite_padrao: 600, tipo: "desejo", conta_no_orcamento: true, ordem: 1, ativa: true }],
  lancamentos: [{
    id: "l1", household_id: HOUSEHOLD, descricao: "Cinema", valor: 50, categoria: "cartao", mes: new Date().getMonth(), ano: new Date().getFullYear(),
    data: new Date().toISOString().slice(0, 10), subcategoria: "lazer", cartao_id: "c1", parcelamento_id: null, parcela_num: null, recorrencia_id: null,
    status: "pago", reembolso: false, responsavel: null, observacao: null, origem: "manual", created_by: null,
  }],
  parcelamentos: [{ id: "p1", household_id: HOUSEHOLD, descricao: "TV antiga", valor_total: 1200, parcelas: 12, parcelas_pagas: 3, valor_parcela: 100, cartao_id: null, subcategoria: null, data_compra: null, primeira_fatura_mes: null, primeira_fatura_ano: null, quitado: false, observacao: null }],
  metas: [{ id: "m1", household_id: HOUSEHOLD, nome: "Reserva", valor_meta: 10000, valor_atual: 1000, rendimento: 0, prazo: null, taxa_rendimento_mensal: null }],
  prioridades: [{ id: "pr1", household_id: HOUSEHOLD, descricao: "Notebook", valor: 4000, prioridade: "alta", concluida: false, subcategoria: "lazer", mes_planejado: 11, ano_planejado: new Date().getFullYear(), parcelas_previstas: 10, cartao_id: "c1", link: null, observacao: null, ordem: 1, valor_pago: null, lancamento_id: null, parcelamento_id: null }],
};

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabela: string) => {
    const resultado = { data: linhas[tabela] ?? [], error: null };
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
    };
    for (const m of ["select", "eq", "in", "order", "limit", "insert", "update", "upsert", "delete"]) q[m] = () => q;
    return q;
  };
  const canal = { on: () => canal, subscribe: () => canal };
  return {
    supabase: {
      from: consulta,
      rpc: () => Promise.resolve({ data: [], error: null }),
      channel: () => canal,
      removeChannel: () => {},
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.c", user_metadata: {} }, session: null, loading: false, householdId: HOUSEHOLD, signOut: async () => {} }),
}));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const paginas = {
  Dashboard: () => import("@/pages/Dashboard"),
  Lancamentos: () => import("@/pages/Lancamentos"),
  Cartoes: () => import("@/pages/Cartoes"),
  Parcelamentos: () => import("@/pages/Parcelamentos"),
  Orcamento: () => import("@/pages/Orcamento"),
  Prioridades: () => import("@/pages/Prioridades"),
  Metas: () => import("@/pages/Metas"),
  Configuracoes: () => import("@/pages/Configuracoes"),
};

describe("páginas renderizam sem quebrar (Supabase mockado)", () => {
  // Import a frio (recharts etc.) é lento; carrega tudo antes para não estourar o timeout do 1º caso.
  beforeAll(() => Promise.all([...Object.values(paginas).map((f) => f()), import("@/components/AppLayout")]), 120000);

  it.each(Object.entries(paginas))("%s", async (_nome, carregar) => {
    const { default: Pagina } = await carregar();
    const { default: AppLayout } = await import("@/components/AppLayout");
    render(
      <MemoryRouter>
        <TooltipProvider>
          <FinanceProvider>
            <AppLayout>
              <Pagina />
            </AppLayout>
          </FinanceProvider>
        </TooltipProvider>
      </MemoryRouter>,
    );
    expect(await screen.findAllByRole("heading")).not.toHaveLength(0);
  }, 20000);
});
