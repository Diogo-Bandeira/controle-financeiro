# Controle Financeiro

Controle financeiro familiar: lançamentos, metas, parcelamentos, prioridades e consultor com IA (Gemini).

Stack: React + Vite + TypeScript, shadcn/ui, Tailwind, Supabase.

## Rodando localmente

```bash
cp .env.example .env   # preencha com as credenciais do Supabase
npm install
npm run dev            # http://localhost:8080/controle-financeiro/
```

## Scripts

| Comando | Ação |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção em `dist/` |
| `npm test` | Testes (Vitest) |
| `npm run lint` | ESLint |
| `npm run deploy` | Build + publica no GitHub Pages |

## Supabase

- Migrations: `supabase/migrations/`
- Edge Functions: `supabase/functions/` (requer secret `GEMINI_API_KEY`)
