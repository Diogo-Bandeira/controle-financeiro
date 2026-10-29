// Utilitários HTTP comuns às Edge Functions: CORS restrito, limite de payload e respostas JSON.

const ORIGENS_PERMITIDAS = ['https://diogo-bandeira.github.io', 'http://localhost:8080']
const LIMITE_BYTES = 200 * 1024

export class ErroHttp extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ORIGENS_PERMITIDAS.includes(origem) ? origem : ORIGENS_PERMITIDAS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

/** Lê o corpo como JSON validando origem, tamanho (413) e sintaxe (400). */
export async function lerCorpoJson(req: Request): Promise<unknown> {
  const origem = req.headers.get('origin')
  if (origem && !ORIGENS_PERMITIDAS.includes(origem)) throw new ErroHttp(403, 'Origem não permitida')
  if (req.method !== 'POST') throw new ErroHttp(405, 'Método não permitido')

  const declarado = Number(req.headers.get('content-length') ?? 0)
  if (declarado > LIMITE_BYTES) throw new ErroHttp(413, 'Payload muito grande')

  const texto = await req.text()
  if (new TextEncoder().encode(texto).length > LIMITE_BYTES) throw new ErroHttp(413, 'Payload muito grande')

  try {
    return JSON.parse(texto)
  } catch {
    throw new ErroHttp(400, 'JSON inválido')
  }
}

export const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function respostaDeErro(req: Request, error: unknown, contexto: string): Response {
  if (error instanceof ErroHttp) return json(req, { error: error.message }, error.status)
  console.error(`Erro na Edge Function ${contexto}:`, error)
  const mensagem = error instanceof Error ? error.message : 'Erro inesperado'
  return json(req, { error: mensagem }, 502)
}

export const DICIONARIO_CONTEXTO = `Dicionário dos dados financeiros recebidos (JSON):
- periodo.mes vai de 0 a 11 (0 = Janeiro, 11 = Dezembro); periodo.ano é o ano. Todos os campos "mes" seguem essa convenção.
- resumo: entradas (inclui reembolsos), reembolsos (dinheiro que voltou de compras feitas para terceiros), rendaPlanejamento (= entradas − reembolsos; use esta como renda real), totalSaidas, saldo.
- lancamentos: lançamentos do mês. cat: entrada | conta_fixa | cartao | variavel. subcat: subcategoria de gasto. status: pago | pendente. parcela: número da parcela quando vem de um parcelamento. Para cartão, o mês é o da fatura (vencimento).
- cartoes: cartões ativos com dia de fechamento/vencimento, limite e as faturas do mês atual e dos 2 seguintes (total e status: aberta, fechada, paga ou futura).
- parcelasFuturas: soma das parcelas de cartão já lançadas em cada um dos próximos 6 meses.
- limites: limite efetivo e gasto de cada subcategoria no mês; contaNoOrcamento=false significa fora do orçamento pessoal.
- parcelamentos: parcelamentos ativos com valor da parcela, parcelas restantes, valor restante e mês de término.
- prioridades: compras desejadas pendentes, com nível, subcategoria, mês planejado e nº de parcelas previsto.
- metas: alvo, saldo inicial, atual (saldo inicial + aportes), prazo, taxa de rendimento mensal (fração, 0.009 = 0,9% a.m.) e aportes recentes.
IMPORTANTE: a subcategoria "compras_terceiros" (Compras de Terceiros) e os reembolsos NÃO são gasto pessoal da família — são compras feitas para outras pessoas e o dinheiro devolvido por elas. Não os trate como consumo nem como renda ao avaliar a saúde financeira.`
