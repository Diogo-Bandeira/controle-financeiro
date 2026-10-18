# Testing Infrastructure

## Test Frameworks

**Unit/Integration:** Vitest 3.2, jsdom 20, `@testing-library/react` 16, `@testing-library/jest-dom`
**E2E:** Playwright 1.57 via `lovable-agent-playwright-config` — **package not installed**, config unusable as-is
**Coverage:** none configured

## Test Organization

**Location:** `src/**/*.{test,spec}.{ts,tsx}` (per `vitest.config.ts`)
**Setup:** `src/test/setup.ts` — jest-dom matchers + `window.matchMedia` stub
**Globals:** `globals: true` (`describe/it/expect` without import; types via `vitest/globals`)
**Existing tests:** `src/test/example.test.ts` — placeholder `expect(true).toBe(true)`. **Zero real tests.**

## Testing Patterns

### Unit Tests
**Approach:** none established. Candidates: pure helpers (`formatCurrency`, month rollover in `copiarParaProximoMes`, totals in finance-store).
**Location suggestion:** colocated `*.test.ts(x)` or `src/test/`.

### Integration Tests
None. Store and components import `@/integrations/supabase/client` directly — testing requires `vi.mock("@/integrations/supabase/client")`.

### E2E Tests
None. `playwright-fixture.ts` re-exports Lovable fixture.

### Edge Functions
None. Deno runtime; no `deno test` setup.

## Test Execution

```
npm test          # vitest run
npm run test:watch
npm run lint      # eslint .
npm run build     # vite build (no tsc typecheck step)
```

## Test Coverage Matrix

| Code Layer | Required Test Type | Location Pattern | Run Command |
| --- | --- | --- | --- |
| Pure helpers / derived totals (`src/lib/`) | unit | `src/lib/*.test.ts` | `npm test` |
| Store (`finance-store.ts`) | integration (mock supabase) | `src/lib/*.test.ts(x)` | `npm test` |
| Pages / components | integration (RTL) | `src/**/*.test.tsx` | `npm test` |
| Edge Functions | none (currently) | `supabase/functions/*` | — |
| DB / RLS | none (currently) | `supabase/` | — |
| E2E flows | none (Playwright broken) | — | — |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| Vitest unit | Yes | per-file worker, jsdom | `vitest.config.ts` defaults; no shared state |
| Vitest w/ supabase mock | Yes if `vi.mock` per file | module mock per file | singleton client `src/integrations/supabase/client.ts` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests | `npm test` |
| Full | After integration tests | `npm test && npm run lint` |
| Build | After phase completion | `npx tsc -p tsconfig.app.json --noEmit && npm run lint && npm test && npm run build` |

Note: lint + tsc currently fail on pre-existing errors (see CONCERNS.md); build + test pass.
