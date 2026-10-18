# Code Conventions

Observed in `src/` (excluding generated `components/ui/`).

## Language

- **Domain names in Portuguese**: entities, functions, state, UI text, comments, toasts. `Lancamento`, `Parcelamento`, `Meta`, `Prioridade`, `mesSelecionado`, `copiarDoMesAnterior`, `pedirAnalise`.
- Framework/tech terms stay English: `addLancamento`, `updateMeta`, `loading`, `handleSubmit`.
- Edge Functions: Portuguese prompts; LLM response keys snake_case Portuguese (`resumo_executivo`, `plano_acao`).

## Naming Conventions

**Files:**
- Pages/components: PascalCase `.tsx` — `Lancamentos.tsx`, `ChatFinanceiro.tsx`, `AppLayout.tsx`
- Hooks: `useAuth.tsx` (camel) and `use-mobile.tsx`/`use-toast.ts` (kebab, shadcn origin)
- Lib: kebab-case — `finance-store.ts`
- Edge Functions: kebab dirs — `chat-financeiro/index.ts`

**Functions:** camelCase. CRUD = `add|update|delete` + Entity. Handlers: `handleSubmit`, `handleAdd`, `handleGoogleLogin`. Actions in PT: `abrirNovo`, `abrirEdicao`, `pagarParcela`, `carregarConversas`.

**Components:** pages `export default function Name()`; widgets named export `export function ConsultorIA()`.

**Variables:** camelCase client-side; DB columns snake_case (`valor_meta`, `household_id`); exception: `cartao_nome` kept snake_case in client `Lancamento` type.

**Constants:** UPPER_SNAKE arrays/maps — `MESES`, `CATEGORIAS`, `SUBCATEGORIAS`, `ANOS`.

**Types:** `interface` for entities, `type` for local shapes (`Message`, `AnaliseFinanceira`). Union literals for enums: `"alta" | "media" | "baixa"`.

## Code Organization

**Imports:** `@/` alias → `src/`. Order loosely: store/hooks → ui components → icons (`lucide-react`) → react → sonner. Not enforced.

**File structure (pages):** imports → module constants/helpers → default component: `useFinanceData()` destructure → local `useState` → handlers → `if (loading) return <Loader2 …/>` guard → JSX.

**Forms:** uncontrolled inputs with `name`, read via `new FormData(e.currentTarget)` + `Number(fd.get(...))`. Dialog-based create/edit (`Dialog open/onOpenChange` resets edit state).

**Styling:** Tailwind utility classes inline, `cn()` for conditionals, custom classes `finance-card`, `font-display`, sidebar tokens (`bg-sidebar`, `text-sidebar-foreground`). Dynamic colors via inline `style` with hex+alpha suffix.

## Type Safety

- Loose TS (`strict: false`). `as any` used to bypass stale generated types (`(l as any).cartao_nome`).
- Generated DB types `src/integrations/supabase/types.ts` (Lovable) — partially stale.
- Casts on DB enums: `l.categoria as Lancamento["categoria"]`.
- `Number()` coerces NUMERIC columns to JS number.

## Error Handling

- Store: `const { data, error } = await …; if (error) { toast.error("Erro ao …"); return; }` — no throw, no rollback.
- Components with direct Supabase calls: `try { … if (error) throw error } catch { console.error; toast.error } finally { setLoading(false) }`.
- Edge Functions: `try/catch` → `400 { error: message }`.
- User-facing messages in Portuguese.

## Comments

- Sparse, Portuguese. Several change-log style comments (`// CORRIGIDO: …`, `// ← NOVO: …`, `// Correção do TypeScript`, `// Função BLINDADA…`). Section banners in store (`// ─── Types ───`).
