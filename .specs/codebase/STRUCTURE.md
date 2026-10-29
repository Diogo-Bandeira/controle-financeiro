# Project Structure

**Root:** `controle-financeiro/`

## Directory Tree

```
.
├── index.html                 # Vite entry → src/main.tsx (+ script spa-github-pages)
├── vite.config.ts             # base /controle-financeiro/, port 8080, @ → src
├── vitest.config.ts / playwright.config.ts
├── tailwind.config.ts / postcss.config.js / components.json
├── eslint.config.js
├── public/                    # favicon, robots, 404.html (fallback SPA do GitHub Pages)
├── src/
│   ├── main.tsx / App.tsx     # bootstrap, ThemeProvider, rotas
│   ├── pages/                 # Dashboard, Lancamentos, Cartoes, Parcelamentos, Orcamento,
│   │                          # Prioridades, Metas, Configuracoes, Auth, NotFound
│   ├── components/
│   │   ├── AppLayout.tsx      # sidebar (md+), barra inferior + FAB (mobile), topo com SeletorMes/alertas/tema/ocultar, chat
│   │   ├── LancamentoForm.tsx / ParcelamentoForm.tsx / CartaoFormDialog.tsx
│   │   ├── RecorrenciasDialog.tsx / ImportarExtratoDialog.tsx
│   │   ├── OrcamentoCategorias.tsx  # painel "Limites do Mês"
│   │   ├── SeletorMes.tsx / AlertasPopover.tsx / MoneyInput.tsx / CamposData.tsx
│   │   ├── SubcategoriaChip.tsx (ChipCor, CartaoChip, OpcaoCor) / EstadoVazio.tsx (+ PaginaCarregando)
│   │   ├── ChatFinanceiro.tsx / ConsultorIA.tsx
│   │   └── ui/                # shadcn generated
│   ├── hooks/                 # useAuth, useContextoIA, use-mobile, use-toast
│   ├── lib/
│   │   ├── finance-store.ts   # FinanceProvider / useFinanceData + SUBCATEGORIAS_PADRAO
│   │   ├── store/             # types.ts, mappers.ts, derivados.ts
│   │   ├── fatura.ts money.ts recorrencias.ts parcelamento-ops.ts importacao.ts texto.ts metas.ts format.ts
│   │   └── *.test.ts          # testes unitários do domínio
│   ├── integrations/supabase/ # client.ts, types.ts (atualizado à mão — regenerar após aplicar migrations)
│   └── test/                  # setup.ts, example.test.ts, paginas.smoke.test.tsx
└── supabase/
    ├── config.toml            # verify_jwt = true nas duas functions
    ├── migrations/            # inicial, sync drift, remaps, 20261029120000_cartoes_parcelas_orcamento
    └── functions/             # _shared/http.ts, chat-financeiro, consultor-financeiro
```

## Where Things Live

| Capability | UI | Logic | Data access |
| --- | --- | --- | --- |
| Lançamentos | `pages/Lancamentos.tsx`, `LancamentoForm` | `recorrencias.ts`, `importacao.ts`, `texto.ts` | store (`inserirLancamentos`, `updateLancamentos`, `deleteLancamentos`) |
| Cartões / faturas | `pages/Cartoes.tsx`, `CartaoFormDialog` | `fatura.ts`, `store/derivados.ts` | `cartoes`, `faturas_pagas` |
| Parcelamentos | `pages/Parcelamentos.tsx`, `ParcelamentoForm` | `parcelamento-ops.ts`, `fatura.ts` | RPC `salvar_parcelamento`, `excluir_parcelamento` |
| Orçamento | `pages/Orcamento.tsx`, `OrcamentoCategorias` | `limiteEfetivo` | `subcategorias`, `orcamentos` |
| Prioridades | `pages/Prioridades.tsx` | `metas.ts` (indicador cabe/aperta) | `prioridades` |
| Metas | `pages/Metas.tsx` | `metas.ts` | `metas`, `aportes` |
| Dashboard | `pages/Dashboard.tsx` | store totals + derivados | — |
| Configurações | `pages/Configuracoes.tsx` | — | `households.codigo_convite`, RPC `entrar_household`, `profiles` |
| Auth | `pages/Auth.tsx` | `useAuth.tsx` | `supabase.auth`, `profiles` |
| IA | `ConsultorIA`, `ChatFinanceiro` | `useContextoIA` | Edge Functions → Gemini |
