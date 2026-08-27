import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI } from "npm:@google/genai"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Trata requisição de pré-voo CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, contextoFinanceiro } = await req.json()

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada no Supabase.')
    }

    const ai = new GoogleGenAI({ apiKey })

    // Instrução de sistema focada em consultoria de longo prazo e simulações
    const systemInstruction = `Você é um consultor financeiro sênior e especialista em planejamento familiar e arquitetura de patrimônio.
Sua comunicação é empática, analítica, altamente prática e orientada a objetivos de médio e longo prazo.

Você possui acesso em tempo real ao contexto financeiro atual da família do usuário:
${JSON.stringify(contextoFinanceiro, null, 2)}

Diretrizes para atendimento no Chat:
1. Responda à dúvida do usuário levando SEMPRE em consideração a realidade financeira dele (saldo livre mensal, total de saídas, renda e dívidas/parcelamentos atuais).
2. Se o usuário perguntar sobre grandes aquisições (ex: terrenos, reformas, carros, investimentos), faça simulações práticas:
   - Calcule o impacto no orçamento mensal.
   - Apresente estratégias reais (ex: Renda Fixa/Tesouro Direto, Financiamento Imobiliário/SBPE, Consórcio, realocação de categorias de gasto).
   - Indique prós e contras de cada caminho com base no fôlego financeiro atual dele.
3. Se o usuário pedir para cortar gastos para atingir um objetivo específico, aponte exatamente em quais categorias ou subcategorias (especialmente do Cartão/Variáveis) há margem para ajuste.
4. Mantenha o tom conversacional, estruturado (use tópicos ou destaques em negrito quando ajudar na leitura) e direto ao ponto. Evite respostas excessivamente longas e prolixas.`;

    // Formata o histórico recebido para o padrão exigido pelo SDK do Gemini
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.4,
      }
    })

    const reply = response.text || 'Desculpe, não consegui processar sua resposta no momento.'

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro na Edge Function chat-financeiro:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})