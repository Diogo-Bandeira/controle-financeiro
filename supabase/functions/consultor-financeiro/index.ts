import { GoogleGenAI, Type, type Schema } from 'npm:@google/genai@2.19.0'
import { DICIONARIO_CONTEXTO, ErroHttp, corsHeaders, ehObjeto, json, lerCorpoJson, respostaDeErro } from '../_shared/http.ts'

// O Schema reflete os 4 passos do prompt
const relatorioFinanceiroSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    resumo_executivo: { type: Type.STRING },
    raio_x_alertas: { type: Type.STRING },
    alavancagem_metas_prioridades: { type: Type.STRING },
    plano_acao: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Exatamente 3 dicas práticas e específicas',
    },
  },
  required: ['resumo_executivo', 'raio_x_alertas', 'alavancagem_metas_prioridades', 'plano_acao'],
}

function validar(corpo: unknown): Record<string, unknown> {
  if (!ehObjeto(corpo)) throw new ErroHttp(400, 'Corpo inválido')
  if (!ehObjeto(corpo.resumo)) throw new ErroHttp(400, 'resumo é obrigatório')
  if (!Array.isArray(corpo.lancamentos)) throw new ErroHttp(400, 'lancamentos deve ser uma lista')
  return corpo
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const contexto = validar(await lerCorpoJson(req))

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new ErroHttp(500, 'GEMINI_API_KEY não configurada.')

    const ai = new GoogleGenAI({ apiKey })

    const systemInstruction = `Você é um consultor financeiro sênior, especialista em planejamento familiar e inteligência de dados. Sua comunicação é direta, analítica, empática e focada em resultados práticos.

    ${DICIONARIO_CONTEXTO}

    Sua missão é cruzar os dados fornecidos e entregar um diagnóstico completo, estruturado da seguinte forma:

    1. RESUMO EXECUTIVO
    - Avalie o saldo final usando a renda para planejamento (entradas − reembolsos) versus as saídas pessoais.
    - Analise a proporção gasta por tipo de subcategoria (necessidade, desejo, poupança, doação). Informe se a proporção está saudável.

    2. RAIO-X DOS GASTOS E ALERTAS
    - Identifique para onde o dinheiro está indo. Destaque as subcategorias que mais consumiram recursos e as que passaram do limite do mês.
    - Emita um alerta severo se as saídas pessoais ultrapassarem 85% da renda para planejamento ou se as faturas/parcelas futuras estiverem asfixiando o fluxo de caixa.

    3. ALAVANCAGEM DE METAS E PRIORIDADES
    - Analise o progresso das metas (atual, prazo, aportes). O ritmo de aportes é suficiente para o prazo?
    - Olhe as prioridades de compra pendentes e o mês planejado. Há fôlego para a prioridade "alta" considerando limites e parcelas futuras?

    4. PLANO DE AÇÃO (3 DICAS PRÁTICAS)
    - Forneça 3 recomendações acionáveis, específicas e personalizadas baseadas nos dados reais. Não use dicas genéricas. Diga exatamente qual despesa cortar ou como realocar o saldo para acelerar uma meta específica.
    Ao citar meses, escreva o nome do mês (não o número 0–11).`

    const promptText = `Dados financeiros do mês (JSON):\n${JSON.stringify(contexto)}`

    let texto: string
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: relatorioFinanceiroSchema,
          temperature: 0.2,
        },
      })
      texto = response.text || '{}'
    } catch (erro) {
      console.error('Falha no Gemini (consultor-financeiro):', erro)
      throw new ErroHttp(502, 'Falha ao consultar o modelo de IA')
    }

    try {
      return json(req, JSON.parse(texto))
    } catch {
      throw new ErroHttp(502, 'Resposta da IA em formato inválido')
    }
  } catch (error) {
    return respostaDeErro(req, error, 'consultor-financeiro')
  }
})
