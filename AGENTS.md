# Stack: Vite SPA (not Next.js)

- React 18 + Vite 5 + TypeScript, react-router-dom (`basename="/controle-financeiro"`).
- All app code lives in `src/` (`@/` alias → `src/`). UI: shadcn/ui + Tailwind 3.
- Backend: Supabase (client in `src/integrations/supabase/client.ts`, migrations and Edge Functions in `supabase/`).
- Deploy: GitHub Pages (`npm run deploy`).
- Codebase docs: `.specs/codebase/`.
