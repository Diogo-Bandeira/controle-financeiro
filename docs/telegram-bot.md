# Bot do Telegram — configuração

Lança gastos/entradas por texto, áudio ou foto de comprovante e responde consultas simples. Edge Function `telegram-bot` (webhook) + Gemini só quando o parser local não resolve.

Comandos abaixo para **Git Bash** na raiz do projeto. Projeto Supabase: `elvuavatozpiuwruygyh`.

## 1. Criar o bot no @BotFather

1. No Telegram, abra **@BotFather** → `/newbot`.
2. Escolha o nome e o username (termina em `bot`, ex.: `controle_financeiro_bot`).
3. Guarde o **token** (`123456:ABC...`) e o **username** (sem `@`).
4. Opcional: `/setprivacy` → *Enable* (o bot só aceita chat privado de qualquer forma).

## 2. Secrets da Edge Function

```bash
SEGREDO=$(openssl rand -hex 32)   # guarde: vai no setWebhook
echo "$SEGREDO"

supabase secrets set \
  TELEGRAM_BOT_TOKEN='123456:ABC...' \
  TELEGRAM_WEBHOOK_SECRET="$SEGREDO" \
  GEMINI_MODEL_BOT=gemini-3.5-flash-lite
```

`GEMINI_API_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente das Edge Functions. `GEMINI_MODEL_BOT` é opcional (padrão `gemini-3.5-flash-lite`).

## 3. Banco e função

```bash
supabase db push                          # aplica 20261031120000_telegram_bot.sql
supabase functions deploy telegram-bot    # verify_jwt = false vem do config.toml
supabase gen types typescript --project-id elvuavatozpiuwruygyh > src/integrations/supabase/types.ts   # opcional: substitui a edição manual
```

## 4. Registrar o webhook

```bash
TOKEN='123456:ABC...'
curl -sS "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{
    \"url\": \"https://elvuavatozpiuwruygyh.supabase.co/functions/v1/telegram-bot\",
    \"secret_token\": \"$SEGREDO\",
    \"allowed_updates\": [\"message\", \"callback_query\"],
    \"drop_pending_updates\": true
  }"

curl -sS "https://api.telegram.org/bot$TOKEN/getWebhookInfo"   # conferir: url certa, sem last_error_message
```

## 5. Comandos do menu

```bash
curl -sS "https://api.telegram.org/bot$TOKEN/setMyCommands" \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {"command": "resumo",   "description": "Entradas, saídas e saldo do mês"},
      {"command": "limites",  "description": "Gasto x limite por subcategoria"},
      {"command": "fatura",   "description": "Fatura aberta e a próxima (ex.: /fatura nubank)"},
      {"command": "desfazer", "description": "Desfaz o último lançamento (até 24 h)"},
      {"command": "status",   "description": "Uso da IA hoje"},
      {"command": "ajuda",    "description": "Exemplos de mensagens"}
    ],
    "language_code": "pt"
  }'
```

## 6. Site

1. No `.env`: `VITE_TELEGRAM_BOT_USERNAME="controle_financeiro_bot"` (sem `@`).
2. `npm run deploy`.
3. Em **Configurações → Telegram → Conectar Telegram**: abra o link `t.me/<bot>?start=<CÓDIGO>` e toque em **Iniciar**. O código vale 10 minutos e é de uso único.

## 7. Uso

- `mercado 130`, `uber 23,90 pix ontem`, `mercado 130 nubank`, `tênis 600 3x bradesco`, `tênis 3x200 bradesco`, `+5000 salário`, `conta de luz 180 10/11`.
- Áudio (até 2 min) e foto/PDF de comprovante (até 5 MB) sempre usam a IA.
- Faltou cartão, subcategoria ou forma de pagamento → o bot pergunta com botões (a pergunta expira em 30 min).
- Confirmação com **Desfazer** (24 h), **Trocar subcategoria** e **Trocar cartão** (recalcula a fatura/parcelas).
- `/status` mostra as chamadas de IA do dia. Consumo também em `ia_uso_diario` (Table Editor).

## 8. Migrar para o Gemini pago

1. No [Google AI Studio](https://aistudio.google.com/) → projeto da `GEMINI_API_KEY` → **Set up billing** (ou ative o faturamento no projeto do Google Cloud). Nada muda no código nem nos secrets.
2. Opcional: modelo maior (`supabase secrets set GEMINI_MODEL_BOT=gemini-3.6-flash`).
3. No plano pago o Google não usa o conteúdo para melhorar os produtos (no gratuito, usa — ver `.specs/codebase/CONCERNS.md`).

O bloqueio de "limite diário atingido" vale até a meia-noite de São Paulo; para liberar antes, apague a linha do dia em `ia_uso_diario`.

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| `getWebhookInfo` com `401` em `last_error_message` | `secret_token` diferente de `TELEGRAM_WEBHOOK_SECRET` |
| Bot não responde, sem erro no webhook | `TELEGRAM_BOT_TOKEN` errado (veja os logs da função: `erro_processamento`) |
| "Este chat ainda não está conectado" | Gere um código novo no site e use em até 10 min |
| "Configure o fechamento e o vencimento" | Cartão sem `dia_fechamento`/`dia_vencimento` (tela Cartões) |
