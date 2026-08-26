import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenAI, Type, Schema } from "npm:@google/genai"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// O novo Schema reflete os 4 passos do seu prompt
const relatorioFinanceiroSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    resumo_executivo: { type: Type.STRING },
    raio_x_alertas: { type: Type.STRING },
    alavancagem_metas_prioridades: { type: Type.STRING },
    plano_acao: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "Exatamente 3 dicas práticas e específicas"
    }
  },
  required: ['resumo_executivo', 'raio_x_alertas', 'alavancagem_metas_prioridades', 'plano_acao']
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Agora recebemos as prioridades e parcelamentos também
    const { lancamentos, metas, parcelamentos, prioridades, resumo } = await req.json()

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.')

    const ai = new GoogleGenAI({ apiKey })

    // SEU PROMPT EXATAMENTE AQUI
    const systemInstruction = `Você é um consultor financeiro sênior, especialista em planejamento familiar e inteligência de dados. Sua comunicação é direta, analítica, empática e focada em resultados práticos.

    Sua missão é cruzar os dados fornecidos e entregar um diagnóstico completo, estruturado da seguinte forma:

    1. RESUMO EXECUTIVO
    - Avalie o saldo final (Entradas - Saídas).
    - Analise a proporção gasta em "Necessidades" (Contas Fixas + Dízimos) versus "Desejos" (Cartão + Variáveis). Informe se a proporção está saudável.

    2. RAIO-X DOS GASTOS E ALERTAS
    - Identifique exatamente para onde o dinheiro está indo. Destaque a subcategoria do Cartão de Crédito ou a despesa Variável que mais consumiu recursos.
    - Emita um alerta severo se as saídas totais ultrapassarem 85% das entradas ou se o "Comprometimento Mensal" com parcelamentos estiver asfixiando o fluxo de caixa.
    - Verifique se o Dízimo registrado condiz com a sugestão de 10% das Entradas.

    3. ALAVANCAGEM DE METAS E PRIORIDADES
    - Analise o progresso das "Top Metas". O ritmo de economia atual é suficiente?
    - Olhe para as "Prioridades de Compra" pendentes. Com base no saldo do mês, o usuário tem fôlego para adquirir o item de prioridade "Alta"?

    4. PLANO DE AÇÃO (3 DICAS PRÁTICAS)
    - Forneça 3 recomendações acionáveis, específicas e personalizadas baseadas nos dados reais apresentados. Não use dicas genéricas. Diga exatamente qual despesa cortar ou como realocar o saldo restante para acelerar uma meta específica.`;

    const promptText = `
    Resumo do Mês: ${JSON.stringify(resumo)}
    Lançamentos: ${JSON.stringify(lancamentos)}
    Metas: ${JSON.stringify(metas)}
    Parcelamentos: ${JSON.stringify(parcelamentos)}
    Prioridades Pendentes: ${JSON.stringify(prioridades)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: relatorioFinanceiroSchema,
        temperature: 0.2,
      }
    });

    const aiResult = JSON.parse(response.text || '{}');

    return new Response(JSON.stringify(aiResult), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
  }
})