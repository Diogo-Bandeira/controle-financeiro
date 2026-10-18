# Project Structure

**Root:** `controle-financeiro/`

## Directory Tree

```
.
├── index.html                 # Vite entry → src/main.tsx
├── vite.config.ts             # base /controle-financeiro/, port 8080, @ → src
├── vitest.config.ts / playwright.config.ts
├── tailwind.config.ts / postcss.config.js / components.json
├── eslint.config.js           # active lint config
├── src/                       # ★ LIVE APP
│   ├── main.tsx / App.tsx     # bootstrap + routes
│   ├── index.css / App.css
│   ├── pages/                 # Dashboard, Lancamentos, Metas, Parcelamentos, Prioridades, Auth, NotFound
│   ├── components/
│   │   ├── AppLayout.tsx      # sidebar + mobile nav + chat Sheet
│   │   ├── ChatFinanceiro.tsx # AI chat w/ persisted history
│   │   ├── ConsultorIA.tsx    # AI diagnosis card
│   │   └── ui/                # shadcn generated (~50 files)
│   ├── hooks/                 # useAuth, use-mobile, use-toast
│   ├── lib/                   # finance-store.ts, utils.ts (cn)
│   ├── integrations/supabase/ # client.ts, types.ts (generated)
│   └── test/                  # setup.ts, example.test.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/            # 1 migration (initial schema)
│   └── functions/             # chat-financeiro, consultor-financeiro
├── public/                    # favicon, robots, placeholder.svg
├── dist/                      # ⚠ committed build output
└── bun.lock + package-lock.json  # ⚠ two lockfiles
```

## Module Organization

### Routing / shell
**Location:** `src/App.tsx`, `src/components/AppLayout.tsx`
Routes: `/auth`, `/`, `/metas`, `/lancamentos`, `/parcelamentos`, `/prioridades`, `*`.

### Data store
**Location:** `src/lib/finance-store.ts` — types, CRUD, totals, `MESES`, `CATEGORIAS`, `formatCurrency`.

### Auth
**Location:** `src/hooks/useAuth.tsx`, `src/pages/Auth.tsx`.

### AI
**Location:** `src/components/ChatFinanceiro.tsx`, `src/components/ConsultorIA.tsx`, `supabase/functions/*`.

### Database
**Location:** `supabase/migrations/` (+ untracked dashboard changes — see CONCERNS), types in `src/integrations/supabase/types.ts`.

## Where Things Live

| Capability | UI | Logic | Data access | Config |
| --- | --- | --- | --- | --- |
| Lançamentos | `src/pages/Lancamentos.tsx` | page + store | `finance-store.ts` | `CATEGORIAS`, `SUBCATEGORIAS` (in page) |
| Metas | `src/pages/Metas.tsx` | store | `finance-store.ts` | — |
| Parcelamentos | `src/pages/Parcelamentos.tsx` | page (`pagarParcela`) | `finance-store.ts` | — |
| Prioridades | `src/pages/Prioridades.tsx` | store | `finance-store.ts` | — |
| Dashboard | `src/pages/Dashboard.tsx` | store totals | `finance-store.ts` | — |
| Auth | `src/pages/Auth.tsx` | `useAuth.tsx` | `supabase.auth`, `profiles` | `.env` VITE_* |
| AI diagnóstico | `ConsultorIA.tsx` | `consultor-financeiro` fn | Gemini | `GEMINI_API_KEY` secret |
| AI chat | `ChatFinanceiro.tsx` | `chat-financeiro` fn | `conversas_chat`, `mensagens_chat`, Gemini | `GEMINI_API_KEY` |
