import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFinanceData } from "@/lib/finance-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, LineChart, AlertCircle, Target, Lightbulb } from "lucide-react";
import { toast } from "sonner";

// Nova tipagem baseada no seu prompt avançado
type AnaliseFinanceira = {
  resumo_executivo: string;
  raio_x_alertas: string;
  alavancagem_metas_prioridades: string;
  plano_acao: string[];
};

export function ConsultorIA() {
  // Agora puxamos também parcelamentos e prioridades do seu estado global
  const { lancamentosMes, metas, parcelamentos, prioridades, saldo, totalSaidas, entradas } = useFinanceData();
  const [analise, setAnalise] = useState<AnaliseFinanceira | null>(null);
  const [loading, setLoading] = useState(false);

  const pedirAnalise = async () => {
    if (lancamentosMes.length === 0) {
      toast.info("Adicione lançamentos neste mês para a IA analisar.");
      return;
    }

    setLoading(true);
    try {
      // Limpeza de dados para economizar tokens e focar no que importa
      const payload = {
        lancamentos: lancamentosMes.map(l => ({ desc: l.descricao, valor: l.valor, cat: l.categoria, subcat: l.subcategoria })),
        metas: metas.map(m => ({ nome: m.nome, atual: m.valorAtual, alvo: m.valorMeta })),
        parcelamentos: parcelamentos.map(p => ({ desc: p.descricao, valor_mensal: p.valorParcela, total: p.valorTotal })),
        prioridades: prioridades.map(p => ({ desc: p.descricao, valor: p.valor, nivel: p.prioridade })),
        resumo: { entradas, totalSaidas, saldo }
      };

      const { data, error } = await supabase.functions.invoke('consultor-financeiro', {
        body: payload
      });

      if (error) throw error;
      setAnalise(data);
      toast.success("Diagnóstico gerado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao consultar a Inteligência Artificial.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="finance-card bg-gradient-to-br from-background to-primary/5 border-primary/20">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl font-display font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Diagnóstico Financeiro
        </CardTitle>
        <Button onClick={pedirAnalise} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {analise ? "Refazer Diagnóstico" : "Gerar Diagnóstico"}
        </Button>
      </CardHeader>
      
      <CardContent>
        {!analise && !loading && (
          <p className="text-sm text-muted-foreground">
            Clique no botão acima para receber um diagnóstico completo sobre sua saúde financeira, metas e capacidade de compra.
          </p>
        )}

        {analise && (
          <div className="space-y-6 animate-fade-in mt-2">
            
            {/* 1. Resumo Executivo */}
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 font-semibold text-foreground">
                <LineChart className="h-4 w-4 text-primary" /> Resumo Executivo
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {analise.resumo_executivo || analise.alerta || "Resumo não disponível no momento."}
              </p>
            </div>

            {/* 2. Raio-X e Alertas */}
            {analise.raio_x_alertas && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 font-semibold text-foreground">
                  <AlertCircle className="h-4 w-4 text-destructive" /> Raio-X dos Gastos
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {analise.raio_x_alertas}
                </p>
              </div>
            )}

            {/* 3. Metas e Prioridades */}
            {analise.alavancagem_metas_prioridades && (
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 font-semibold text-foreground">
                  <Target className="h-4 w-4 text-success" /> Alavancagem e Fôlego
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {analise.alavancagem_metas_prioridades}
                </p>
              </div>
            )}
            
            {/* 4. Plano de Ação */}
            <div className="space-y-3 bg-card border rounded-lg p-4">
              <h4 className="flex items-center gap-2 font-semibold text-foreground mb-3">
                <Lightbulb className="h-4 w-4 text-warning" /> Plano de Ação
              </h4>
              <ul className="space-y-3">
                {/* BLINDAGEM: Se plano_acao não existir, tenta ler 'dicas'. Se nenhum existir, retorna um array vazio e não quebra a tela */}
                {((analise.plano_acao as string[]) || (analise as any).dicas || []).map((dica, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="text-foreground/90 leading-relaxed">{dica}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}