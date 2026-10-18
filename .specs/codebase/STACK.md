# Tech Stack

**Analyzed:** 2026-10-18

> Runtime = **Vite SPA** (Lovable-generated). Next.js leftovers removed 2026-10-18; decision: stay on Vite.

## Core

- Framework: React 18.3 + Vite 5.4 (`@vitejs/plugin-react-swc`)
- Language: TypeScript 5.8, `strict: false`, `strictNullChecks: false`, `noImplicitAny: false`
- Runtime: Browser SPA; backend = Supabase (Postgres + Auth + Edge Functions on Deno)
- Package manager: npm (`package-lock.json`) — `bun.lock` also present (stale duplicate)
- Routing: `react-router-dom` 6.30, `BrowserRouter basename="/controle-financeiro"`
- Deploy: GitHub Pages via `gh-pages -d dist` (`npm run deploy`), Vite `base: "/controle-financeiro/"`

## Frontend

- UI: shadcn/ui (Radix primitives, style `default`, base `slate`) in `src/components/ui/`
- Styling: Tailwind 3.4 + `tailwindcss-animate` + `@tailwindcss/typography`, CSS vars in `src/index.css`
- Fonts: Inter + Playfair Display (Google Fonts `@import`)
- Icons: `lucide-react`
- Charts: `recharts` (PieChart in Dashboard)
- State: custom React Context (`FinanceProvider` in `src/lib/finance-store.ts`) + `AuthProvider`. `@tanstack/react-query` provider mounted but **unused** for data
- Forms: uncontrolled `<form>` + `FormData`. `react-hook-form`/`zod` installed but unused in pages
- Toasts: `sonner` (primary) + shadcn `toaster` (both mounted)
- Markdown: `react-markdown` (chat replies)

## Backend

- API style: direct Supabase client queries (PostgREST) from browser + 2 Edge Functions
- Database: Supabase Postgres, RLS per `household_id`
- Auth: Supabase Auth — email/password + Google OAuth; session in `localStorage`

## Testing

- Unit: Vitest 3.2 + jsdom + Testing Library (only placeholder test)
- E2E: Playwright config via `lovable-agent-playwright-config` (package **not installed**)

## External Services

- BaaS: Supabase (project `hhvveuwnfwazqnazenqd`)
- LLM: Google Gemini via `@google/genai` (`npm:` import in Edge Functions), model `gemini-3.6-flash`

## Development Tools

- Lint: ESLint 9 flat config `eslint.config.js` (typescript-eslint, react-hooks, react-refresh)
- Dev tag: `lovable-tagger` (dev mode only)
- Deno extension for `supabase/functions` (`.vscode/settings.json`)
