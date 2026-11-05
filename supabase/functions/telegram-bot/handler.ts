// Webhook do Telegram: valida o secret, responde 200 logo e processa em segundo plano.
// Fluxo: chat vinculado → dedup por update_id → limite por hora → comando | callback | parser local | 1 chamada de IA.
// Dependências injetadas (repo, Telegram, IA, relógio) para testar sem rede. Nunca registra o conteúdo das mensagens.

import { ErroHttp, ehObjeto } from "../_shared/http.ts";
import { calcularFatura, cartaoConfigurado, parseISODate, type MesAno } from "../_shared/dominio/fatura.ts";
import type { LancamentoHistorico } from "../_shared/dominio/sugestao.ts";
import { competenciasFatura, textoFaturas, textoGastoSubcategoria, textoLimites, textoResumo, usoDaSubcategoria } from "./consultas.ts";
import { hojeEmSaoPaulo, mesDe } from "./datas.ts";
import { escaparHtml } from "./html.ts";
import { ErroIA, paraBase64, type InterpretarComIA, type TipoErroIA } from "./gemini.ts";
import {
  AJUDA, CODIGO_INVALIDO, FALLBACK_FALHA, FALLBACK_LIMITE, FALLBACK_MIDIA_LIMITE, FALLBACK_MINUTO, INSTRUCOES_VINCULO, LIMITE_POR_HORA,
  MIDIA_GRANDE, MIDIA_NAO_SUPORTADA, NAO_ENTENDI, OPCOES_TIPO, PERGUNTA_EXPIRADA, agruparGravados, boasVindas,
  formatarConfirmacao, tecladoConfirmacao, tecladoOpcoes, textoPergunta, type ItemGravado, type UsoSubcategoria,
} from "./mensagens.ts";
import { campoFaltante, completarPeloHistorico, montarGravacao, type CampoFaltante } from "./montagem.ts";
import { encontrarCartao, interpretarLocal, type ContextoParser } from "./parser.ts";
import type { Repositorio, TipoMensagem } from "./repo.ts";
import type { TelegramApi } from "./telegram.ts";
import type { Categoria, Consulta, LancamentoGravado, Rascunho, Teclado, Vinculo } from "./tipos.ts";
import { validarSaidaIA, type InterpretacaoIA } from "./validacao.ts";

// ─── Tipos do Telegram (só o que o bot usa) ──────────────────────────────────

interface UsuarioTg {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}
interface ArquivoTg {
  file_id: string;
  file_size?: number;
  duration?: number;
  mime_type?: string;
  width?: number;
  height?: number;
}
interface MensagemTg {
  message_id: number;
  chat: { id: number; type: string };
  from?: UsuarioTg;
  text?: string;
  caption?: string;
  voice?: ArquivoTg;
  audio?: ArquivoTg;
  photo?: ArquivoTg[];
  document?: ArquivoTg;
}
interface CallbackTg {
  id: string;
  from: UsuarioTg;
  data?: string;
  message?: { message_id: number; chat: { id: number; type: string } };
}
export interface UpdateTg {
  update_id: number;
  message?: MensagemTg;
  callback_query?: CallbackTg;
}

// ─── Dependências ────────────────────────────────────────────────────────────

export interface Dependencias {
  segredo: string;
  repo: Repositorio;
  telegram: TelegramApi;
  ia: InterpretarComIA;
  agora?: () => Date;
  /** Mantém o processamento vivo depois da resposta (EdgeRuntime.waitUntil). */
  emSegundoPlano?: (p: Promise<unknown>) => void;
  /** Só ids e tipos de erro; nunca conteúdo. */
  log?: (evento: string, dados: Record<string, unknown>) => void;
}

const LIMITE_CORPO = 256 * 1024;
const LIMITE_MIDIA = 5 * 1024 * 1024;
const DURACAO_MAXIMA_AUDIO = 120;
const MENSAGENS_POR_HORA = 40;
const JANELA_DESFAZER_MS = 24 * 60 * 60 * 1000;
const UMA_HORA_MS = 60 * 60 * 1000;
const LIMPEZA_A_CADA = 50;

/** Comparação em tempo constante (não para no primeiro byte diferente). */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = new TextEncoder().encode(recebido);
  const b = new TextEncoder().encode(esperado);
  let diferenca = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}

/** Lê o update com limite de tamanho. (lerCorpoJson do _shared valida origin/CORS, que não se aplicam ao webhook.) */
async function lerUpdate(req: Request): Promise<UpdateTg> {
  if (req.method !== "POST") throw new ErroHttp(405, "Método não permitido");
  if (Number(req.headers.get("content-length") ?? 0) > LIMITE_CORPO) throw new ErroHttp(413, "Payload muito grande");
  const texto = await req.text();
  if (new TextEncoder().encode(texto).length > LIMITE_CORPO) throw new ErroHttp(413, "Payload muito grande");
  const corpo = (() => {
    try {
      return JSON.parse(texto);
    } catch {
      throw new ErroHttp(400, "JSON inválido");
    }
  })();
  if (!ehObjeto(corpo) || typeof corpo.update_id !== "number") throw new ErroHttp(400, "Update inválido");
  return corpo as unknown as UpdateTg;
}

const nomeDoErro = (e: unknown): string => {
  if (e instanceof ErroIA) return `ia_${e.tipo}`;
  if (ehObjeto(e) && typeof e.code === "string") return `db_${e.code}`;
  return e instanceof Error ? e.name : typeof e;
};

const tipoDaMensagem = (m: MensagemTg): TipoMensagem => {
  if (m.text?.startsWith("/")) return "comando";
  if (m.voice || m.audio) return "audio";
  if (m.photo?.length || m.document) return "foto";
  return "texto";
};

type PayloadPendencia =
  | { acao: "completar"; registroId: string; rascunhos: Rascunho[]; indice: number; campo: CampoFaltante; valores: string[]; rotulos: string[] }
  | { acao: "trocar_subcategoria" | "trocar_cartao"; registroId: string; valores: string[]; rotulos: string[] };

interface Sessao {
  update: UpdateTg;
  vinculo: Vinculo;
  chatId: number;
  registroId: string;
  agora: Date;
  ctx: ContextoParser;
}

// ─── Bot ─────────────────────────────────────────────────────────────────────

export function criarHandler(deps: Dependencias): (req: Request) => Promise<Response> {
  const { repo, telegram } = deps;
  const agora = deps.agora ?? (() => new Date());
  const emSegundoPlano = deps.emSegundoPlano ?? ((p: Promise<unknown>) => void p);
  const log = deps.log ?? ((evento, dados) => console.error(JSON.stringify({ evento, ...dados })));

  const carregarContexto = async (householdId: string, instante: Date): Promise<ContextoParser> => {
    const [cartoes, subcategorias] = await Promise.all([repo.cartoes(householdId), repo.subcategorias(householdId)]);
    return { hoje: hojeEmSaoPaulo(instante), cartoes, subcategorias };
  };

  const responsavelDe = (v: Vinculo) => v.nomeExibicao;

  // ─── Confirmação ───────────────────────────────────────────────────────

  async function usosDosItens(s: Sessao, itens: ItemGravado[]): Promise<(UsoSubcategoria | null)[]> {
    const alvos = itens.map((i) => {
      const [l] = i.lancamentos;
      const sub = l.categoria === "entrada" ? null : s.ctx.subcategorias.find((x) => x.slug === l.subcategoria);
      return sub ? { sub, competencia: { mes: l.mes, ano: l.ano } } : null;
    });
    const meses = alvos.flatMap((a) => (a ? [a.competencia] : []));
    if (meses.length === 0) return alvos.map(() => null);
    const [lancs, orcamentos] = await Promise.all([repo.lancamentosDosMeses(s.vinculo.householdId, meses), repo.orcamentos(s.vinculo.householdId, meses)]);
    return alvos.map((a) => (a ? usoDaSubcategoria(a.sub, a.competencia, lancs, orcamentos) : null));
  }

  async function mostrarConfirmacao(s: Sessao, registroId: string, lancamentos: LancamentoGravado[], editarId: number | null) {
    const itens = agruparGravados(lancamentos);
    const usos = await usosDosItens(s, itens);
    const texto = formatarConfirmacao(itens.map((item, i) => ({ item, uso: usos[i] })), { ...s.ctx, mesAtual: mesDe(s.ctx.hoje) });
    await enviarOuEditar(s.chatId, editarId, texto, tecladoConfirmacao(registroId, itens));
  }

  const enviarOuEditar = async (chatId: number, editarId: number | null, texto: string, teclado?: Teclado) => {
    if (editarId) await telegram.editar(chatId, editarId, texto, teclado);
    else await telegram.enviar(chatId, texto, teclado);
  };

  // ─── Lançamento: completar, perguntar, gravar ──────────────────────────

  function opcoesSubcategoria(s: Sessao, historico: LancamentoHistorico[]) {
    const usos = historico.reduce((m, l) => (l.subcategoria ? m.set(l.subcategoria, (m.get(l.subcategoria) ?? 0) + 1) : m), new Map<string, number>());
    const ordenadas = [...s.ctx.subcategorias].sort((a, b) => (usos.get(b.slug) ?? 0) - (usos.get(a.slug) ?? 0));
    return { valores: ordenadas.map((x) => x.slug), rotulos: ordenadas.map((x) => x.label) };
  }

  const opcoesCartao = (s: Sessao) => ({ valores: s.ctx.cartoes.map((c) => c.id), rotulos: s.ctx.cartoes.map((c) => c.nome) });

  async function perguntar(s: Sessao, registroId: string, rascunhos: Rascunho[], indice: number, editarId: number | null) {
    const campo = campoFaltante(rascunhos[indice]) as CampoFaltante;
    const opcoes = await (async () => {
      if (campo === "tipo") return { valores: OPCOES_TIPO.map((o) => o.tipo), rotulos: OPCOES_TIPO.map((o) => o.label) };
      if (campo === "cartao") return opcoesCartao(s);
      return opcoesSubcategoria(s, await repo.historico(s.vinculo.householdId));
    })();
    const payload: PayloadPendencia = { acao: "completar", registroId, rascunhos, indice, campo, ...opcoes };
    const id = await repo.criarPendencia(s.vinculo.householdId, s.chatId, payload);
    const texto = textoPergunta(campo, rascunhos[indice], indice, rascunhos.length);
    await enviarOuEditar(s.chatId, editarId, texto, tecladoOpcoes(id, opcoes.rotulos, campo !== "subcategoria"));
  }

  async function gravar(s: Sessao, registroId: string, rascunhos: Rascunho[], editarId: number | null) {
    const montagens = rascunhos.map((r) => montarGravacao(r, { hoje: s.ctx.hoje, cartoes: s.ctx.cartoes, responsavel: responsavelDe(s.vinculo) }));
    const erro = montagens.find((m) => m.tipo === "erro");
    if (erro?.tipo === "erro") return enviarOuEditar(s.chatId, editarId, erro.mensagem);

    const h = s.vinculo.householdId;
    const simples = montagens.flatMap((m) => (m.tipo === "simples" ? [m.lancamento] : []));
    const [inseridos, parcelados] = await Promise.all([
      simples.length ? repo.inserirLancamentos(h, simples) : Promise.resolve([]),
      Promise.all(montagens.flatMap((m) => (m.tipo === "parcelado" ? [repo.salvarParcelamento(h, m.parcelamento, m.lancamentos)] : []))),
    ]);
    const todos = [...inseridos, ...parcelados.flatMap((p) => p.lancamentos)];
    await repo.salvarResultado(registroId, todos.map((l) => l.id), parcelados[0]?.parcelamentoId ?? null);
    await mostrarConfirmacao(s, registroId, todos, editarId);
  }

  async function prosseguir(s: Sessao, registroId: string, rascunhos: Rascunho[], editarId: number | null) {
    const indice = rascunhos.findIndex((r) => campoFaltante(r) != null);
    if (indice >= 0) return perguntar(s, registroId, rascunhos, indice, editarId);
    return gravar(s, registroId, rascunhos, editarId);
  }

  async function lancar(s: Sessao, rascunhos: Rascunho[]) {
    const historico = await repo.historico(s.vinculo.householdId);
    const completos = rascunhos.map((r) => completarPeloHistorico(r, historico, s.ctx.cartoes));
    await prosseguir(s, s.registroId, completos, null);
  }

  // ─── IA ────────────────────────────────────────────────────────────────

  const FALLBACKS: Record<TipoErroIA, string> = { limite_diario: FALLBACK_LIMITE, limite_minuto: FALLBACK_MINUTO, falha: FALLBACK_FALHA };

  async function chamarIA(s: Sessao, texto: string | null, midia: { mimeType: string; base64: string } | null): Promise<InterpretacaoIA | null> {
    const h = s.vinculo.householdId;
    const uso = await repo.usoIa(h, s.ctx.hoje);
    if (uso.limiteAtingido) {
      await telegram.enviar(s.chatId, midia ? FALLBACK_MIDIA_LIMITE : FALLBACK_LIMITE);
      return null;
    }
    await repo.marcarUsoIa(s.registroId);
    try {
      const bruto = await deps.ia({ texto, midia, hoje: s.ctx.hoje, cartoes: s.ctx.cartoes, subcategorias: s.ctx.subcategorias });
      await repo.registrarUsoIa(h, { chamadas: 1 });
      return validarSaidaIA(bruto, s.ctx);
    } catch (e) {
      const tipo: TipoErroIA = e instanceof ErroIA ? e.tipo : "falha";
      log("ia_erro", { update_id: s.update.update_id, tipo, status: e instanceof ErroIA ? e.status : null });
      await repo.registrarUsoIa(h, { chamadas: 1, erros429: tipo === "falha" ? 0 : 1, limiteDiario: tipo === "limite_diario" });
      await telegram.enviar(s.chatId, FALLBACKS[tipo]);
      return null;
    }
  }

  async function tratarInterpretacao(s: Sessao, r: InterpretacaoIA) {
    if (r.intencao === "lancamento" && r.rascunhos.length) {
      if (r.descartados) await telegram.enviar(s.chatId, `Ignorei ${r.descartados} item(ns) com valor ou parcelas fora da faixa aceita.`);
      return lancar(s, r.rascunhos);
    }
    if (r.intencao === "consulta" && r.consulta) return responderConsulta(s, r.consulta);
    if (r.intencao === "ajuda") return telegram.enviar(s.chatId, AJUDA);
    await telegram.enviar(s.chatId, r.duvida ? escaparHtml(r.duvida) : NAO_ENTENDI);
  }

  // ─── Consultas ─────────────────────────────────────────────────────────

  async function responderConsulta(s: Sessao, c: Consulta) {
    const h = s.vinculo.householdId;
    const mesAtual = mesDe(s.ctx.hoje);
    const competencia: MesAno = c.mes != null ? { mes: c.mes, ano: c.ano ?? mesAtual.ano } : mesAtual;
    const dadosDe = (meses: MesAno[]) => Promise.all([repo.lancamentosDosMeses(h, meses), repo.orcamentos(h, meses)]);

    if (c.tipo === "fatura") {
      const hoje = parseISODate(s.ctx.hoje);
      const cartoes = c.cartaoId ? s.ctx.cartoes.filter((x) => x.id === c.cartaoId) : s.ctx.cartoes;
      const meses = cartoes.flatMap((x) => competenciasFatura(x, hoje));
      const lancs = meses.length ? await repo.lancamentosDosMeses(h, meses) : [];
      return telegram.enviar(s.chatId, textoFaturas(cartoes, hoje, lancs));
    }
    const [lancs, orcamentos] = await dadosDe([competencia]);
    const sub = s.ctx.subcategorias.find((x) => x.slug === c.subcategoria);
    if (c.tipo === "gasto_subcategoria" && sub) {
      return telegram.enviar(s.chatId, textoGastoSubcategoria(sub, competencia, mesAtual, lancs, orcamentos));
    }
    if (c.tipo === "limites" || c.tipo === "gasto_subcategoria") {
      return telegram.enviar(s.chatId, textoLimites(competencia, s.ctx.subcategorias, lancs, orcamentos));
    }
    return telegram.enviar(s.chatId, textoResumo(competencia, mesAtual, s.ctx.subcategorias, lancs, orcamentos));
  }

  // ─── Desfazer e trocas ─────────────────────────────────────────────────

  async function desfazer(s: Sessao, registroId: string | null, editarId: number | null) {
    const h = s.vinculo.householdId;
    const desde = new Date(s.agora.getTime() - JANELA_DESFAZER_MS);
    const reg = registroId ? await repo.mensagem(registroId, h) : await repo.ultimaComLancamento(s.chatId, h, desde);
    if (!reg || reg.lancamentoIds.length === 0) return enviarOuEditar(s.chatId, editarId, "Nada para desfazer.");
    if (new Date(reg.createdAt) < desde) return telegram.enviar(s.chatId, "Já passou de 24 h. Exclua pelo site.");
    await repo.excluir(h, reg.lancamentoIds, reg.parcelamentoId);
    await repo.salvarResultado(reg.id, [], null);
    await enviarOuEditar(s.chatId, editarId, `Desfeito ↩️ (${reg.lancamentoIds.length} lançamento(s) removido(s)).`);
  }

  async function iniciarTroca(s: Sessao, acao: "trocar_subcategoria" | "trocar_cartao", registroId: string, messageId: number): Promise<string | undefined> {
    const reg = await repo.mensagem(registroId, s.vinculo.householdId);
    if (!reg || reg.lancamentoIds.length === 0) return "Esse lançamento não existe mais.";
    const opcoes = acao === "trocar_cartao" ? opcoesCartao(s) : opcoesSubcategoria(s, await repo.historico(s.vinculo.householdId));
    const payload: PayloadPendencia = { acao, registroId, ...opcoes };
    const id = await repo.criarPendencia(s.vinculo.householdId, s.chatId, payload);
    await telegram.editarTeclado(s.chatId, messageId, tecladoOpcoes(id, opcoes.rotulos, acao === "trocar_cartao"));
  }

  async function aplicarTroca(s: Sessao, acao: "trocar_subcategoria" | "trocar_cartao", registroId: string, valor: string, messageId: number) {
    const h = s.vinculo.householdId;
    const reg = await repo.mensagem(registroId, h);
    if (!reg || reg.lancamentoIds.length === 0) return enviarOuEditar(s.chatId, messageId, "Esse lançamento não existe mais.");
    const lancs = await repo.lancamentosPorIds(h, reg.lancamentoIds);
    const parcelamentoId = lancs.find((l) => l.parcelamento_id)?.parcelamento_id ?? null;

    if (acao === "trocar_subcategoria") {
      await repo.atualizarLancamentos(h, reg.lancamentoIds, { subcategoria: valor });
      if (parcelamentoId) await repo.atualizarParcelamento(h, parcelamentoId, { subcategoria: valor });
      return mostrarConfirmacao(s, registroId, await repo.lancamentosPorIds(h, reg.lancamentoIds), messageId);
    }

    const cartao = s.ctx.cartoes.find((c) => c.id === valor);
    const nomeCartao = escaparHtml(cartao?.nome ?? "");
    if (!cartaoConfigurado(cartao)) {
      await telegram.enviar(s.chatId, `Configure o fechamento e o vencimento do cartão <b>${nomeCartao}</b> no site.`);
      return mostrarConfirmacao(s, registroId, lancs, messageId);
    }
    const parc = parcelamentoId ? await repo.parcelamento(h, parcelamentoId) : null;
    if (!parc) {
      const [l] = lancs;
      const { mes, ano } = calcularFatura(parseISODate(l.data), cartao.diaFechamento, cartao.diaVencimento);
      await repo.atualizarLancamentos(h, [l.id], { cartao_id: cartao.id, mes, ano });
      return mostrarConfirmacao(s, registroId, await repo.lancamentosPorIds(h, reg.lancamentoIds), messageId);
    }
    // Parcelado: regera as parcelas a partir da fatura da compra no novo cartão (mesma transação).
    const rascunho: Rascunho = {
      descricao: parc.descricao, valor: parc.valor_total, valorEParcela: false, parcelas: parc.parcelas, data: parc.data_compra,
      tipo: "cartao", cartaoId: cartao.id, subcategoria: parc.subcategoria, reembolso: false,
    };
    const m = montarGravacao(rascunho, { hoje: s.ctx.hoje, cartoes: s.ctx.cartoes, responsavel: responsavelDe(s.vinculo) });
    if (m.tipo !== "parcelado") return;
    const salvo = await repo.salvarParcelamento(h, { ...m.parcelamento, id: parc.id, observacao: parc.observacao }, m.lancamentos, reg.lancamentoIds);
    await repo.salvarResultado(reg.id, salvo.lancamentos.map((l) => l.id), salvo.parcelamentoId);
    await mostrarConfirmacao(s, registroId, salvo.lancamentos, messageId);
  }

  // ─── Callbacks ─────────────────────────────────────────────────────────

  async function responderPendencia(s: Sessao, pendenciaId: string, escolha: string, messageId: number): Promise<string | undefined> {
    const p = await repo.pendencia(pendenciaId, s.chatId);
    if (!p || new Date(p.expiraEm) < s.agora) {
      if (p) await repo.apagarPendencia(p.id);
      await telegram.editar(s.chatId, messageId, PERGUNTA_EXPIRADA);
      return "Expirou";
    }
    const payload = p.payload as PayloadPendencia;

    if (escolha === "o") {
      await telegram.editarTeclado(s.chatId, messageId, tecladoOpcoes(p.id, payload.rotulos, true));
      return;
    }
    if (escolha === "x") {
      await repo.apagarPendencia(p.id);
      if (payload.acao === "completar") {
        await telegram.editar(s.chatId, messageId, "Cancelado.");
        return;
      }
      const reg = await repo.mensagem(payload.registroId, s.vinculo.householdId);
      await mostrarConfirmacao(s, payload.registroId, await repo.lancamentosPorIds(s.vinculo.householdId, reg?.lancamentoIds ?? []), messageId);
      return;
    }

    const valor = payload.valores[Number(escolha)];
    if (valor == null) return "Opção inválida";
    await repo.apagarPendencia(p.id);

    if (payload.acao !== "completar") {
      await aplicarTroca(s, payload.acao, payload.registroId, valor, messageId);
      return;
    }

    const atual = payload.rascunhos[payload.indice];
    const preenchido: Rascunho = (() => {
      if (payload.campo === "tipo") return { ...atual, tipo: valor as Categoria };
      if (payload.campo === "cartao") return { ...atual, cartaoId: valor };
      return { ...atual, subcategoria: valor };
    })();
    const historico = payload.campo === "tipo" ? await repo.historico(s.vinculo.householdId) : [];
    const completo = payload.campo === "tipo" ? completarPeloHistorico(preenchido, historico, s.ctx.cartoes) : preenchido;
    const rascunhos = payload.rascunhos.map((r, i) => (i === payload.indice ? completo : r));
    await prosseguir(s, payload.registroId, rascunhos, messageId);
  }

  async function processarCallback(s: Sessao, cb: CallbackTg) {
    let aviso: string | undefined;
    try {
      const messageId = cb.message?.message_id;
      const [acao, id, extra] = (cb.data ?? "").split(":");
      if (!messageId || !id) return;
      if (acao === "p") aviso = await responderPendencia(s, id, extra ?? "", messageId);
      if (acao === "d") await desfazer(s, id, messageId);
      if (acao === "s") aviso = await iniciarTroca(s, "trocar_subcategoria", id, messageId);
      if (acao === "c") aviso = await iniciarTroca(s, "trocar_cartao", id, messageId);
    } finally {
      await telegram.responderCallback(cb.id, aviso);
    }
  }

  // ─── Comandos ──────────────────────────────────────────────────────────

  async function vincular(chatId: number, codigo: string, de: UsuarioTg | undefined) {
    const valido = /^[A-Za-z0-9]{6}$/.test(codigo);
    const nome = [de?.first_name, de?.last_name].filter(Boolean).join(" ") || null;
    const v = valido ? await repo.vincular(codigo, chatId, { id: de?.id ?? 0, username: de?.username ?? null, nome }) : null;
    await telegram.enviar(chatId, v ? boasVindas(v.nomeExibicao) : CODIGO_INVALIDO);
  }

  async function processarComando(s: Sessao, texto: string, de: UsuarioTg | undefined) {
    const [bruto, ...args] = texto.trim().split(/\s+/);
    const comando = bruto.split("@")[0].toLowerCase();
    const arg = args.join(" ");
    switch (comando) {
      case "/start":
      case "/vincular":
        return arg ? vincular(s.chatId, arg, de) : telegram.enviar(s.chatId, AJUDA);
      case "/sair":
        await repo.desativarVinculo(s.chatId);
        return telegram.enviar(s.chatId, "Desconectado. Para conectar de novo, gere um código em <b>Configurações → Telegram</b>.");
      case "/resumo":
        return responderConsulta(s, { tipo: "resumo_mes", subcategoria: null, cartaoId: null, mes: null, ano: null });
      case "/limites":
        return responderConsulta(s, { tipo: "limites", subcategoria: null, cartaoId: null, mes: null, ano: null });
      case "/fatura": {
        const cartao = arg ? encontrarCartao(arg, s.ctx.cartoes) : null;
        if (arg && !cartao) return telegram.enviar(s.chatId, `Não achei o cartão "${escaparHtml(arg)}".`);
        return responderConsulta(s, { tipo: "fatura", subcategoria: null, cartaoId: cartao?.id ?? null, mes: null, ano: null });
      }
      case "/desfazer":
        return desfazer(s, null, null);
      case "/status": {
        const uso = await repo.usoIa(s.vinculo.householdId, s.ctx.hoje);
        const limite = uso.limiteAtingido ? "sim — áudio, foto e IA voltam amanhã" : "não";
        return telegram.enviar(s.chatId, `<b>IA hoje</b>\nChamadas: ${uso.chamadas}\nErros de limite (429): ${uso.erros429}\nLimite diário atingido: ${limite}`);
      }
      default:
        return telegram.enviar(s.chatId, AJUDA);
    }
  }

  // ─── Mensagens com mídia ───────────────────────────────────────────────

  async function processarMidia(s: Sessao, m: MensagemTg) {
    const uso = await repo.usoIa(s.vinculo.householdId, s.ctx.hoje);
    if (uso.limiteAtingido) return telegram.enviar(s.chatId, FALLBACK_MIDIA_LIMITE);

    const arquivo = (() => {
      const audio = m.voice ?? m.audio;
      if (audio) {
        const grande = (audio.duration ?? 0) > DURACAO_MAXIMA_AUDIO || (audio.file_size ?? 0) > LIMITE_MIDIA;
        return grande ? null : { fileId: audio.file_id, mimeType: audio.mime_type ?? "audio/ogg" };
      }
      if (m.document) {
        const aceito = /^image\/|^application\/pdf$/.test(m.document.mime_type ?? "");
        if (!aceito) return undefined;
        return (m.document.file_size ?? 0) > LIMITE_MIDIA ? null : { fileId: m.document.file_id, mimeType: m.document.mime_type as string };
      }
      const maior = (m.photo ?? [])
        .filter((p) => (p.file_size ?? 0) <= LIMITE_MIDIA)
        .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
      return maior ? { fileId: maior.file_id, mimeType: "image/jpeg" } : null;
    })();
    if (arquivo === undefined) return telegram.enviar(s.chatId, MIDIA_NAO_SUPORTADA);
    if (!arquivo) return telegram.enviar(s.chatId, MIDIA_GRANDE);

    const bytes = await telegram.baixar(arquivo.fileId, LIMITE_MIDIA);
    if (!bytes) return telegram.enviar(s.chatId, MIDIA_GRANDE);
    const r = await chamarIA(s, m.caption?.slice(0, 500) ?? null, { mimeType: arquivo.mimeType, base64: paraBase64(bytes) });
    if (r) await tratarInterpretacao(s, r);
  }

  async function processarTexto(s: Sessao, texto: string) {
    const local = interpretarLocal(texto, s.ctx);
    if (local?.tipo === "consulta") return responderConsulta(s, local.consulta);
    if (local?.tipo === "lancamento") return lancar(s, [local.rascunho]);
    const r = await chamarIA(s, texto.slice(0, 1000), null);
    if (r) await tratarInterpretacao(s, r);
  }

  // ─── Update ────────────────────────────────────────────────────────────

  async function processar(update: UpdateTg) {
    const m = update.message;
    const cb = update.callback_query;
    const chat = m?.chat ?? cb?.message?.chat;
    if (!chat || chat.type !== "private") {
      if (cb) await telegram.responderCallback(cb.id);
      return;
    }

    const vinculo = await repo.vinculoDoChat(chat.id);
    if (!vinculo) {
      // Chat não vinculado: só o vínculo, sem IA (protege a cota).
      if (cb) return telegram.responderCallback(cb.id, "Chat não conectado.");
      const [comando, codigo] = (m?.text ?? "").trim().split(/\s+/);
      const ehVinculo = ["/start", "/vincular"].includes((comando ?? "").split("@")[0].toLowerCase());
      if (ehVinculo && codigo) return vincular(chat.id, codigo, m?.from);
      return telegram.enviar(chat.id, INSTRUCOES_VINCULO);
    }

    const tipo: TipoMensagem = cb ? "callback" : tipoDaMensagem(m as MensagemTg);
    const registroId = await repo.registrarUpdate({ householdId: vinculo.householdId, chatId: chat.id, updateId: update.update_id, tipo });
    if (!registroId) {
      log("update_repetido", { update_id: update.update_id });
      if (cb) await telegram.responderCallback(cb.id);
      return;
    }
    if (update.update_id % LIMPEZA_A_CADA === 0) {
      await repo.limparAntigos().catch((e) => log("limpeza_falhou", { erro: nomeDoErro(e) }));
    }

    const instante = agora();
    if (!cb && (await repo.mensagensDesde(chat.id, new Date(instante.getTime() - UMA_HORA_MS))) > MENSAGENS_POR_HORA) {
      return telegram.enviar(chat.id, LIMITE_POR_HORA);
    }

    const s: Sessao = { update, vinculo, chatId: chat.id, registroId, agora: instante, ctx: await carregarContexto(vinculo.householdId, instante) };
    if (cb) return processarCallback(s, cb);
    const msg = m as MensagemTg;
    if (tipo === "comando") return processarComando(s, msg.text as string, msg.from);
    if (tipo === "audio" || tipo === "foto") return processarMidia(s, msg);
    if (msg.text?.trim()) return processarTexto(s, msg.text);
    return telegram.enviar(chat.id, MIDIA_NAO_SUPORTADA);
  }

  const resposta = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

  return async (req: Request) => {
    if (!segredoConfere(req.headers.get("x-telegram-bot-api-secret-token"), deps.segredo)) {
      return resposta(401, { error: "Não autorizado" });
    }
    try {
      const update = await lerUpdate(req);
      const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
      // Erros tratados não voltam ao Telegram como não-2xx (ele reenviaria o update).
      const tarefa = processar(update).catch(async (e) => {
        log("erro_processamento", { update_id: update.update_id, erro: nomeDoErro(e) });
        if (chatId) await telegram.enviar(chatId, "Algo deu errado aqui. Tente de novo em instantes.").catch(() => undefined);
      });
      emSegundoPlano(tarefa);
      return resposta(200, { ok: true });
    } catch (e) {
      if (e instanceof ErroHttp) return resposta(e.status, { error: e.message });
      log("erro_webhook", { erro: nomeDoErro(e) });
      return resposta(200, { ok: true });
    }
  };
}
