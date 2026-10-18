# Codebase Concerns

**Analysis Date:** 2026-10-18

## Security Considerations

**Unauthenticated Gemini proxy (cost abuse):**
- Risk: `consultor-financeiro` has `verify_jwt = false` and CORS `*`; anyone with the function URL can burn `GEMINI_API_KEY` quota. Payload is client-controlled → prompt injection trivial (low impact, but no size limits either).
- Files: `supabase/config.toml`, `supabase/functions/consultor-financeiro/index.ts`, `supabase/functions/chat-financeiro/index.ts`
- Current mitigation: none in code. `chat-financeiro` relies on default JWT verify (not declared).
- Recommendations: `verify_jwt = true` for both (declare explicitly); validate body size/shape (zod); restrict CORS origin to GH Pages domain; optionally rate-limit per user.

**Financial context trusted from client:**
- Risk: Edge Functions accept totals/lists from browser instead of reading DB with user JWT. Not a leak, but AI output can be fed fabricated data; and server can't enforce scope.
- Fix approach: in function, create Supabase client with caller's `Authorization` header and query data server-side.

**Chat tables not under version control:**
- Risk: RLS policies for `conversas_chat`/`mensagens_chat` unknown/unreviewable — possible cross-household read if created without policies.
- Files: no migration; used in `src/components/ChatFinanceiro.tsx`
- Recommendations: `supabase db pull` / write migration with RLS (`household_id` / join via `conversa_id`).

## Tech Debt

**Pre-existing lint/type errors:**
- Issue: `npm run lint` → 10 errors (`no-explicit-any` in `src/`, `supabase/`; `no-require-imports` in `tailwind.config.ts`). `tsc -p tsconfig.app.json` fails on stale generated types (chat tables, `cartao_nome`) and `ConsultorIA.tsx:84` (`analise.alerta` not in type).
- Impact: gates can't be green until fixed; `vite build` doesn't typecheck, so it passes anyway.
- Fix approach: regenerate types (see Schema drift), then fix the remaining `any`.

**Schema drift (migrations ≠ live DB ≠ generated types):**
- Issue: `lancamentos.subcategoria`, `lancamentos.cartao_nome`, `conversas_chat`, `mensagens_chat` absent from migration. `types.ts` lacks `cartao_nome` and chat tables → `(l as any).cartao_nome` hacks.
- Files: `supabase/migrations/*`, `src/integrations/supabase/types.ts`, `src/lib/finance-store.ts:87,130`
- Impact: fresh env (`supabase db reset`) breaks app; typings lie.
- Fix approach: `supabase db pull` → migration; `supabase gen types typescript` → regenerate `types.ts`; remove `as any`.

**Duplicated domain constants/types:**
- Issue: entity mapping snake→camel repeated in load + insert per entity (`finance-store.ts`).
- Fix approach: one mapper fn per entity.

**Committed build + double lockfile:**
- Issue: `dist/` tracked despite `.gitignore`; `bun.lock` + `package-lock.json` both present (package-lock currently modified).
- Fix approach: `git rm -r --cached dist`; keep one lockfile (npm, per scripts).

**Unused deps:** `@tanstack/react-query` (provider only), `react-hook-form`, `zod`, `@hookform/resolvers`, `@google/genai` (frontend), `next-themes`, many shadcn ui files. Low risk; bundle bloat.

## Known Bugs

**Chat fails for households without metas:**
- Symptoms: first chat message → "Household não encontrado." toast.
- Trigger: new user with zero `metas` rows sends a chat message.
- Files: `src/components/ChatFinanceiro.tsx` (~L113–123)
- Root cause: household_id resolved via `supabase.from('metas').select('household_id').limit(1).single()` instead of `useAuth().householdId`.

**`useAuth` effect resubscribes + stale closure:**
- Symptoms: auth listener torn down/recreated whenever `user.id` changes; `getProfile` may run twice on login; inside listener `user` is closure value.
- Files: `src/hooks/useAuth.tsx` (deps `[user?.id]`)
- Fix: empty deps, compare via ref or functional state.

**Chat persists partial conversations silently:**
- Symptoms: user message insert result ignored; if AI call fails, DB has user msg without reply; UI state keeps it too. Insert errors on `mensagens_chat` never surfaced.
- Files: `src/components/ChatFinanceiro.tsx` (sendMessage)

**"Copiar do mês anterior" non-atomic + duplicates:**
- Symptoms: sequential inserts; failure midway leaves partial copy; clicking twice duplicates all; per-item error toasts.
- Files: `src/pages/Lancamentos.tsx` (`copiarDoMesAnterior`)
- Fix: single bulk `insert([...])` in store; guard against existing rows.

**GH Pages deep-link refresh 404:**
- Symptoms: reload on `/controle-financeiro/metas` → GitHub 404 (no SPA fallback `404.html`).
- Files: `public/` (missing), `vite.config.ts`
- Root cause: BrowserRouter on static host. Verify before fixing.

## Fragile Areas

**`finance-store.ts`:**
- Why fragile: one 289-line hook owns all entities, mapping, totals; every page re-renders on any change; local state patched without refetch (multi-user household edits not synced — no realtime).
- Safe modification: keep return shape stable (pages destructure it); add mappers rather than inline.
- Test coverage: none.

**Money as JS floats:**
- Files: `finance-store.ts` totals (`reduce` sums), `Parcelamentos.tsx` (`valorTotal / parcelas` unrounded).
- Impact: cent rounding errors in totals/parcelas. Fix: integer cents or round at boundaries.

**Edge Function error handling:**
- `consultor-financeiro`: `JSON.parse(response.text)` unguarded; error response omits `Content-Type`; all errors → 400 (should be 5xx for upstream). Model id `gemini-3.6-flash` unverified — confirm against Gemini docs.

## Scaling Limits

**Full-table loads:**
- Current: loads all `lancamentos` of household (all years) on login; chat sends full history each message.
- Limit: grows linearly; fine for single family for years. Chat token cost grows per turn.
- Path: filter by `ano`; cap chat history window.

## Dependencies at Risk

- `lovable-tagger`, `lovable-agent-playwright-config` (latter not installed) — vendor lock to Lovable tooling.
- Deno `std@0.168.0` `serve` deprecated → use `Deno.serve`. `npm:@google/genai` unpinned → breaking changes on redeploy.

## Test Coverage Gaps

- **Totals/saldo calc** (`finance-store.ts`) — wrong dashboard numbers unnoticed. Priority: High.
- **Month/year rollover** (copy functions) — Dec→Jan edge. Priority: High.
- **RLS policies** — tenancy leak unnoticed. Priority: High.
- **Edge Functions** — no tests. Priority: Medium.
- Pages/UI — none. Priority: Low.
