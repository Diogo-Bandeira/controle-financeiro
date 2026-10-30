# Codebase Concerns

**Analysis Date:** 2026-10-29

## Security Considerations

**Financial context trusted from client:**
- Risk: Edge Functions accept totals/lists from browser instead of reading DB with user JWT. Not a leak, but AI output can be fed fabricated data.
- Fix approach: in function, create Supabase client with caller's `Authorization` header and query data server-side.

**No rate limit on Gemini proxies:**
- `verify_jwt = true`, CORS restrito e limite de 200 KB já aplicados; qualquer usuário autenticado ainda pode chamar sem limite de frequência.

**`entrar_household` sem consentimento do dono:**
- Quem tiver o código de convite entra no household. Fix: código rotacionável / expiração.

## Tech Debt

**Generated types hand-edited:**
- `src/integrations/supabase/types.ts` foi atualizado à mão para a migration `20261030120000` (`recorrencias_excecoes`, `atualizar_recorrencia_futuros`). Regenerar com `supabase gen types` após aplicar.

**`lancamentos.cartao_nome` obsoleta:**
- Mantida no banco após backfill para `cartao_id`; o app não usa mais. Remover numa migration futura.

**Committed double lockfile:** `bun.lock` + `package-lock.json`. Keep one (npm).

**Unused deps:** `@tanstack/react-query` (provider only), `react-hook-form`, `zod`, `@hookform/resolvers`, `@google/genai` (frontend), many shadcn ui files.

**Bundle único ~1,5 MB (gzip ~420 KB):** sem code-splitting por rota (recharts pesa). Fix: `React.lazy` nas páginas.

## Known Bugs

Nenhum conhecido no momento. Resolvidos em 2026-10-29: chat sem metas, efeito do `useAuth`, inserts do chat sem tratamento, "copiar mês" não atômico, 404 em deep-link no GH Pages, erros de lint pré-existentes.

## Fragile Areas

**`finance-store.ts`:**
- Um contexto com todas as entidades; qualquer mudança re-renderiza todas as páginas consumidoras. Realtime recarrega a tabela inteira afetada.
- Safe modification: manter o shape do retorno; mappers em `store/mappers.ts`.

**Status de parcela derivado do relógio do cliente:** depende de `new Date()` e do fuso do navegador. Idem para a janela de recorrências e o selo "Previsto".

**Recorrências (janela de 6 meses):**
- Mudar fechamento/vencimento de um cartão gera o que falta, mas não recalcula a competência dos lançamentos recorrentes já gerados nesse cartão (só a edição da recorrência recalcula).
- "Gerar recorrências deste mês" usa o mês selecionado como mês de **data**; recorrências no cartão podem cair na fatura do mês seguinte.
- Geração concorrente (dois membros, Realtime) depende do `ON CONFLICT DO NOTHING` + unique por mês da data; o estado local pode estar defasado por até um recarregamento.

**Parcelamentos legados:** sem cartão/datas até serem vinculados; "termina em" é estimado a partir de hoje.

**Edge Function model id:** `gemini-3.6-flash` não verificado contra a doc do Gemini.

## Scaling Limits

- Carrega todos os `lancamentos` do household (todos os anos). Path: filtrar por janela de anos.
- Chat envia as últimas 20 mensagens + contexto completo a cada turno.

## Test Coverage Gaps

- **RLS policies / RPCs** — validados manualmente num Postgres local, sem teste automatizado. Priority: High.
- **Store com Supabase mockado** — só smoke de renderização (`src/test/paginas.smoke.test.tsx`). Priority: Medium.
- **Edge Functions** — sem testes. Priority: Medium.
- **E2E** — Playwright config depende de `lovable-agent-playwright-config` (não instalado). Priority: Low.
