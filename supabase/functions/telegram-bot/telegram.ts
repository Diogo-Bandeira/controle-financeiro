// Cliente mínimo da Bot API do Telegram (sendMessage, editMessageText, answerCallbackQuery, getFile).

import type { Teclado } from "./tipos.ts";

export interface TelegramApi {
  enviar(chatId: number, texto: string, teclado?: Teclado): Promise<number | null>;
  editar(chatId: number, messageId: number, texto: string, teclado?: Teclado): Promise<void>;
  editarTeclado(chatId: number, messageId: number, teclado: Teclado): Promise<void>;
  responderCallback(callbackId: string, texto?: string): Promise<void>;
  /** Baixa o arquivo; null se passar do limite de bytes. */
  baixar(fileId: string, limiteBytes: number): Promise<Uint8Array | null>;
}

export class ErroTelegram extends Error {
  constructor(public metodo: string, public status: number) {
    super(`Telegram ${metodo}: ${status}`);
  }
}

export function criarTelegram(token: string, fetchFn: typeof fetch = fetch): TelegramApi {
  const api = async (metodo: string, corpo: Record<string, unknown>) => {
    const r = await fetchFn(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await r.json().catch(() => null);
    // "message is not modified" ao editar com o mesmo conteúdo não é erro para o bot.
    if (!json?.ok && !String(json?.description ?? "").includes("not modified")) throw new ErroTelegram(metodo, r.status);
    return json?.result;
  };
  const marcacao = (teclado?: Teclado) => (teclado ? { reply_markup: { inline_keyboard: teclado } } : {});
  const base = { parse_mode: "HTML", link_preview_options: { is_disabled: true } };

  return {
    async enviar(chatId, texto, teclado) {
      const r = await api("sendMessage", { chat_id: chatId, text: texto, ...base, ...marcacao(teclado) });
      return r?.message_id ?? null;
    },
    async editar(chatId, messageId, texto, teclado) {
      await api("editMessageText", { chat_id: chatId, message_id: messageId, text: texto, ...base, ...marcacao(teclado) });
    },
    async editarTeclado(chatId, messageId, teclado) {
      await api("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, ...marcacao(teclado) });
    },
    async responderCallback(callbackId, texto) {
      await api("answerCallbackQuery", { callback_query_id: callbackId, ...(texto ? { text: texto } : {}) });
    },
    async baixar(fileId, limiteBytes) {
      const arquivo = await api("getFile", { file_id: fileId });
      if (!arquivo?.file_path || (arquivo.file_size ?? 0) > limiteBytes) return null;
      const r = await fetchFn(`https://api.telegram.org/file/bot${token}/${arquivo.file_path}`);
      if (!r.ok) throw new ErroTelegram("file", r.status);
      const bytes = new Uint8Array(await r.arrayBuffer());
      return bytes.length > limiteBytes ? null : bytes;
    },
  };
}
