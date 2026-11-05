import { describe, expect, it, vi } from "vitest";
import { ErroIA } from "../../../supabase/functions/telegram-bot/gemini.ts";
import { criarHandler, type UpdateTg } from "../../../supabase/functions/telegram-bot/handler.ts";
import type { Repositorio } from "../../../supabase/functions/telegram-bot/repo.ts";
import type { TelegramApi } from "../../../supabase/functions/telegram-bot/telegram.ts";
import type { LancamentoGravado, LinhaLancamento } from "../../../supabase/functions/telegram-bot/tipos.ts";
import { CARTOES, SUBCATEGORIAS } from "./fixtures";

const SEGREDO = "segredo-de-teste";
const CHAT = 10;
const VINCULO = { id: "v1", householdId: "h1", userId: "u1", chatId: CHAT, nomeExibicao: "Ana" };

function montar({ iaFalha, limiteAtingido = false }: { iaFalha?: ErroIA; limiteAtingido?: boolean } = {}) {
  const vistos = new Set<number>();
  const enviados: string[] = [];
  const gravados: LinhaLancamento[] = [];

  const repo: Repositorio = {
    vinculoDoChat: vi.fn(async (chatId: number) => (chatId === CHAT ? VINCULO : null)),
    vincular: vi.fn(async () => null),
    desativarVinculo: vi.fn(async () => undefined),
    registrarUpdate: vi.fn(async ({ updateId }) => {
      if (vistos.has(updateId)) return null;
      vistos.add(updateId);
      return `reg-${updateId}`;
    }),
    marcarUsoIa: vi.fn(async () => undefined),
    salvarResultado: vi.fn(async () => undefined),
    mensagensDesde: vi.fn(async () => 1),
    mensagem: vi.fn(async () => null),
    ultimaComLancamento: vi.fn(async () => null),
    cartoes: vi.fn(async () => CARTOES),
    subcategorias: vi.fn(async () => SUBCATEGORIAS),
    historico: vi.fn(async () => [{ descricao: "Mercado", categoria: "cartao", subcategoria: "alimentacao", cartaoId: "c-nubank" }]),
    usoIa: vi.fn(async () => ({ chamadas: 3, erros429: 0, limiteAtingido })),
    registrarUsoIa: vi.fn(async () => undefined),
    inserirLancamentos: vi.fn(async (_h: string, linhas: LinhaLancamento[]) => {
      gravados.push(...linhas);
      return linhas.map((l, i): LancamentoGravado => ({ ...l, id: `l${i}` }));
    }),
    salvarParcelamento: vi.fn(),
    excluir: vi.fn(async () => undefined),
    lancamentosPorIds: vi.fn(async () => []),
    parcelamento: vi.fn(async () => null),
    atualizarLancamentos: vi.fn(async () => undefined),
    atualizarParcelamento: vi.fn(async () => undefined),
    lancamentosDosMeses: vi.fn(async () => []),
    orcamentos: vi.fn(async () => []),
    criarPendencia: vi.fn(async () => "pend-1"),
    pendencia: vi.fn(async () => null),
    atualizarPendencia: vi.fn(async () => undefined),
    apagarPendencia: vi.fn(async () => undefined),
    limparAntigos: vi.fn(async () => undefined),
  };
  const telegram: TelegramApi = {
    enviar: vi.fn(async (_c: number, texto: string) => {
      enviados.push(texto);
      return 1;
    }),
    editar: vi.fn(async () => undefined),
    editarTeclado: vi.fn(async () => undefined),
    responderCallback: vi.fn(async () => undefined),
    baixar: vi.fn(async () => new Uint8Array([1, 2, 3])),
  };
  const ia = vi.fn(async () => {
    if (iaFalha) throw iaFalha;
    return { intencao: "outro", lancamentos: [], consulta: null, duvida: null };
  });
  const tarefas: Promise<unknown>[] = [];
  const handler = criarHandler({
    segredo: SEGREDO, repo, telegram, ia,
    agora: () => new Date("2026-10-30T15:00:00Z"),
    emSegundoPlano: (p) => tarefas.push(p),
    log: () => undefined,
  });

  const enviar = async (update: UpdateTg, segredo = SEGREDO) => {
    const res = await handler(new Request("https://x/telegram-bot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": segredo },
      body: JSON.stringify(update),
    }));
    await Promise.all(tarefas);
    return res;
  };
  return { repo, telegram, ia, enviar, enviados, gravados };
}

const texto = (updateId: number, text: string, chatId = CHAT): UpdateTg => ({
  update_id: updateId,
  message: { message_id: 1, chat: { id: chatId, type: "private" }, from: { id: 5, first_name: "Ana" }, text },
});

describe("handler do webhook", () => {
  it("secret inválido → 401 sem processar", async () => {
    const t = montar();
    const res = await t.enviar(texto(1, "mercado 130"), "errado");
    expect(res.status).toBe(401);
    expect(t.repo.vinculoDoChat).not.toHaveBeenCalled();
  });

  it("chat não vinculado recebe a instrução, sem chamar a IA", async () => {
    const t = montar();
    const res = await t.enviar(texto(2, "quanto gastei com o mercado do bairro ontem à noite", 99));
    expect(res.status).toBe(200);
    expect(t.ia).not.toHaveBeenCalled();
    expect(t.enviados[0]).toContain("ainda não está conectado");
    expect(t.repo.registrarUpdate).not.toHaveBeenCalled();
  });

  it("update_id repetido é ignorado", async () => {
    const t = montar();
    await t.enviar(texto(3, "mercado 130 nubank"));
    await t.enviar(texto(3, "mercado 130 nubank"));
    expect(t.repo.inserirLancamentos).toHaveBeenCalledTimes(1);
    expect(t.enviados).toHaveLength(1);
  });

  it("parser local lança sem IA, com fatura do cartão e origem telegram", async () => {
    const t = montar();
    await t.enviar(texto(4, "mercado 130 nubank"));
    expect(t.ia).not.toHaveBeenCalled();
    expect(t.gravados[0]).toMatchObject({ descricao: "Mercado", valor: 130, categoria: "cartao", cartao_id: "c-nubank", mes: 10, ano: 2026, subcategoria: "alimentacao", origem: "telegram", responsavel: "Ana" });
    expect(t.enviados[0]).toContain("Lançado ✅");
    expect(t.repo.salvarResultado).toHaveBeenCalledWith("reg-4", ["l0"], null);
  });

  it("429 diário → mensagem de fallback e registro do erro", async () => {
    const t = montar({ iaFalha: new ErroIA("limite_diario", 429) });
    await t.enviar(texto(5, "paguei o encanador semana passada"));
    expect(t.ia).toHaveBeenCalledTimes(1);
    expect(t.repo.registrarUsoIa).toHaveBeenCalledWith("h1", { chamadas: 1, erros429: 1, limiteDiario: true });
    expect(t.enviados[0]).toContain("O limite diário da IA acabou");
  });

  it("com o limite atingido, áudio nem é baixado", async () => {
    const t = montar({ limiteAtingido: true });
    await t.enviar({ update_id: 6, message: { message_id: 1, chat: { id: CHAT, type: "private" }, voice: { file_id: "f", duration: 5 } } });
    expect(t.telegram.baixar).not.toHaveBeenCalled();
    expect(t.ia).not.toHaveBeenCalled();
    expect(t.enviados[0]).toContain("Áudio e foto ficam indisponíveis");
  });

  it("acima de 40 mensagens por hora pede para aguardar", async () => {
    const t = montar();
    vi.mocked(t.repo.mensagensDesde).mockResolvedValue(41);
    await t.enviar(texto(7, "mercado 130"));
    expect(t.repo.inserirLancamentos).not.toHaveBeenCalled();
    expect(t.enviados[0]).toContain("Muitas mensagens");
  });

  it("chat em grupo é ignorado", async () => {
    const t = montar();
    await t.enviar({ update_id: 8, message: { message_id: 1, chat: { id: CHAT, type: "group" }, text: "mercado 130" } });
    expect(t.repo.vinculoDoChat).not.toHaveBeenCalled();
    expect(t.enviados).toHaveLength(0);
  });
});
