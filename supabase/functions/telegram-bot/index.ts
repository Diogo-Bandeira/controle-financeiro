// Edge Function do bot do Telegram (webhook). verify_jwt = false: a autenticação é o secret do webhook.
// Monta as dependências reais; a lógica fica em handler.ts.

import { createClient } from "@supabase/supabase-js";
import { criarInterpretador } from "./gemini.ts";
import { criarHandler } from "./handler.ts";
import { criarRepositorio } from "./repo.ts";
import { criarTelegram } from "./telegram.ts";

const env = (nome: string): string => Deno.env.get(nome) ?? "";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const handler = criarHandler({
  segredo: env("TELEGRAM_WEBHOOK_SECRET"),
  repo: criarRepositorio(db),
  telegram: criarTelegram(env("TELEGRAM_BOT_TOKEN")),
  ia: criarInterpretador(env("GEMINI_API_KEY"), env("GEMINI_MODEL_BOT") || "gemini-3.5-flash-lite"),
  emSegundoPlano: (p) => (typeof EdgeRuntime !== "undefined" ? EdgeRuntime.waitUntil(p) : void p),
});

Deno.serve(handler);
