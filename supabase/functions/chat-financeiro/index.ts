import { GoogleGenAI } from 'npm:@google/genai@2.19.0'
import { DICIONARIO_CONTEXTO, ErroHttp, corsHeaders, ehObjeto, json, lerCorpoJson, respostaDeErro } from '../_shared/http.ts'

type Mensagem = { role: 'user' | 'model'; content: string }

const MAX_MENSAGENS = 20
const MAX_CARACTERES = 8000

function validar(corpo: unknown): { messages: Mensagem[]; contextoFinanceiro: Record<string, unknown> } {
  if (!ehObjeto(corpo)) throw new ErroHttp(400, 'Corpo inválido')
  const { messages, contextoFinanceiro } = corpo
  if (!Array.isArray(messages) || messages.length === 0) throw new ErroHttp(400, 'messages deve ser uma lista não vazia')
  const validas = messages.every(
    (m) => ehObjeto(m) && (m.role === 'user' || m.role === 'model') && typeof m.content === 'string' && m.content.length <= MAX_CARACTERES,
  )
  if (!validas) throw new ErroHttp(400, 'Mensagem inválida')
  if (!ehObjeto(contextoFinanceiro)) throw new ErroHttp(400, 'contextoFinanceiro inválido')
  return { messages: (messages as Mensagem[]).slice(-MAX_MENSAGENS), contextoFinanceiro }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const { messages, contextoFinanceiro } = validar(await lerCorpoJson(req))

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new ErroHttp(500, 'GEMINI_API_KEY não configurada no Supabase.')

    const ai = new GoogleGenAI({ apiKey })

    // Instrução de sistema focada em consultoria de longo prazo e simulações
    const systemInstruction = `Você é um consultor financeiro sênior e especialista em planejamento familiar e arquitetura de patrimônio.
Sua comunicação é empática, analítica, altamente prática e orientada a objetivos de médio e longo prazo.

${DICIONARIO_CONTEXTO}

Contexto financeiro atual da família:
${JSON.stringify(contextoFinanceiro)}

Diretrizes para atendimento no Chat:
1. Responda à dúvida do usuário levando SEMPRE em consideração a realidade financeira dele (renda para planejamento, saldo, limites por subcategoria, faturas e parcelas futuras).
2. Se o usuário perguntar sobre grandes aquisições (ex: terrenos, reformas, carros, investimentos), faça simulações práticas:
   - Calcule o impacto no orçamento mensal e nas faturas futuras (considere parcelasFuturas e o mês planejado das prioridades).
   - Apresente estratégias reais (ex: Renda Fixa/Tesouro Direto, Financiamento Imobiliário/SBPE, Consórcio, realocação de categorias de gasto).
   - Indique prós e contras de cada caminho com base no fôlego financeiro atual dele.
3. Se o usuário pedir para cortar gastos para atingir um objetivo específico, aponte exatamente em quais subcategorias há margem (compare gasto × limite).
4. Ao citar meses, escreva o nome do mês (não o número 0–11).
5. Mantenha o tom conversacional, estruturado (use tópicos ou destaques em negrito quando ajudar na leitura) e direto ao ponto. Evite respostas excessivamente longas e prolixas.`

    // Formata o histórico recebido para o padrão exigido pelo SDK do Gemini
    const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] }))

    let reply: string
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents,
        config: { systemInstruction, temperature: 0.4 },
      })
      reply = response.text || 'Desculpe, não consegui processar sua resposta no momento.'
    } catch (erro) {
      console.error('Falha no Gemini (chat-financeiro):', erro)
      throw new ErroHttp(502, 'Falha ao consultar o modelo de IA')
    }

    return json(req, { reply })
  } catch (error) {
    return respostaDeErro(req, error, 'chat-financeiro')
  }
})
