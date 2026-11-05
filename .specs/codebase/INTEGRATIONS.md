# External Integrations

## Backend-as-a-Service

**Service:** Supabase (project `controle_financeiro_pessoal`, ref `elvuavatozpiuwruygyh` (`.env`, `supabase/config.toml`))
**Purpose:** Postgres DB, Auth, Edge Functions.
**Implementation:** singleton `src/integrations/supabase/client.ts` (`createClient<Database>`, `localStorage` session, auto refresh).
**Configuration:** `.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (template `.env.example`). Baked into static bundle at build.
**Authentication:** anon/publishable key + user JWT; RLS enforces access.

### Database tables

| Table | Source | Key columns |
| --- | --- | --- |
| `households` | migration | `id`, `nome` |
| `profiles` | migration | `user_id` (unique → auth.users), `household_id`, `display_name` |
| `metas` | migration | `valor_meta`, `valor_atual`, `rendimento` (NUMERIC) |
| `lancamentos` | migration + **dashboard** | `categoria` CHECK enum, `mes` 0–11, `ano`, `subcategoria`*, `cartao_nome`* |
| `parcelamentos` | migration | `valor_total`, `parcelas`, `parcelas_pagas`, `valor_parcela` |
| `prioridades` | migration | `prioridade` CHECK `alta/media/baixa`, `concluida` |
| `conversas_chat` | live DB (no migration) | `id`, `household_id`, `titulo`, `created_at` |
| `mensagens_chat` | live DB (no migration) | `conversa_id`, `role`, `content`, `created_at` |

| `telegram_vinculos` | migration `20261031120000` | `chat_id` (unique), `household_id`, `user_id`, `nome_exibicao` (= `responsavel` dos lançamentos), `ativo` |
| `telegram_codigos` | migration | `codigo` (6 chars sem 0/O/1/I), `expira_em` (10 min), `usado_em` — sem policies, só RPC |
| `telegram_mensagens` | migration | `update_id` (unique, dedup), `tipo`, `usou_ia`, `lancamento_ids`, `parcelamento_id` — sem texto; > 30 dias apagado |
| `telegram_pendencias` | migration | `payload` (rascunho + opções dos botões), `expira_em` (30 min) — sem policies |
| `ia_uso_diario` | migration | PK (`household_id`, `dia` SP), `chamadas`, `erros_429`, `limite_diario_atingido` |

\* Not in migration file; present in live DB and generated types.

**RPCs do bot (EXECUTE só `service_role`, SECURITY DEFINER, `p_household_id` explícito):** `bot_inserir_lancamentos`, `bot_salvar_parcelamento`, `bot_excluir_lancamentos`, `bot_vincular_telegram`, `bot_registrar_uso_ia`, `bot_limpar_antigos`. **App:** `gerar_codigo_telegram()` (authenticated).

**DB functions/triggers:** `get_user_household_id` (SECURITY DEFINER), `update_updated_at_column` triggers, `handle_new_user` on `auth.users` insert.

## Auth Providers

- Email/password (`signInWithPassword`, `signUp` with `options.data.full_name`)
- Google OAuth (`signInWithOAuth`, `redirectTo: ${origin}/controle-financeiro/`) — redirect URL must be allowlisted in Supabase Auth settings.

## API Integrations

### Google Gemini

**Purpose:** AI financial diagnosis + chat advisor.
**Location:** `supabase/functions/consultor-financeiro/index.ts`, `supabase/functions/chat-financeiro/index.ts`
**SDK:** `npm:@google/genai` (unpinned in Deno import). Also listed in root `package.json` deps (unused by frontend).
**Authentication:** `GEMINI_API_KEY` Supabase secret (`Deno.env.get`).
**Model:** `gemini-3.6-flash` (both). Temps: 0.2 (consultor), 0.4 (chat).
**Key calls:** `ai.models.generateContent` — consultor uses `responseMimeType: application/json` + `responseSchema`.

### Edge Functions (internal API)

| Function | Invoked from | Request body | Response | JWT verify |
| --- | --- | --- | --- | --- |
| `consultor-financeiro` | `ConsultorIA.tsx` | `{ lancamentos, metas, parcelamentos, prioridades, resumo }` | `{ resumo_executivo, raio_x_alertas, alavancagem_metas_prioridades, plano_acao[] }` | **false** (`config.toml`) |
| `chat-financeiro` | `ChatFinanceiro.tsx` | `{ messages[{role,content}], contextoFinanceiro }` | `{ reply }` | default (not in `config.toml`) |

Both: CORS `*`, `400 { error }` on failure. Deno std `0.168.0` `serve`.

### Telegram Bot API

**Purpose:** lançar gastos/entradas e consultar por texto, áudio ou foto (`docs/telegram-bot.md`).
**Location:** `supabase/functions/telegram-bot/` (`telegram.ts`: `sendMessage`, `editMessageText`, `editMessageReplyMarkup`, `answerCallbackQuery`, `getFile`).
**Authentication:** webhook com `secret_token` (`TELEGRAM_WEBHOOK_SECRET`, header `X-Telegram-Bot-Api-Secret-Token`); chamadas com `TELEGRAM_BOT_TOKEN`. Função com `verify_jwt = false`, banco via `SUPABASE_SERVICE_ROLE_KEY`.
**Gemini no bot:** REST `generateContent` (fetch, sem SDK) com `responseSchema`; modelo `GEMINI_MODEL_BOT` (padrão `gemini-3.5-flash-lite`); 1 chamada por mensagem, só quando o parser local não resolve ou para áudio/foto; 1 nova tentativa só em 5xx. Contexto enviado: data de hoje, nomes dos cartões, slugs/labels das subcategorias (sem valores).
**Front:** `VITE_TELEGRAM_BOT_USERNAME` (link `t.me/<bot>?start=<código>` em Configurações → `TelegramConexao`).

## Hosting

**GitHub Pages** — `npm run deploy` (`predeploy` builds, `gh-pages -d dist`). No CI workflow in repo (`.github/` absent). SPA deep-link refresh on GH Pages has no `404.html` fallback in `public/`.

## Webhooks / Background Jobs

- **Telegram → `telegram-bot`**: `allowed_updates` = `message`, `callback_query`. Responde 200 logo e processa em `EdgeRuntime.waitUntil`; erros tratados nunca viram não-2xx (o Telegram reenviaria). Limpeza oportunista (`bot_limpar_antigos`) a cada 50 `update_id`.
