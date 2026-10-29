import { Link } from "react-router-dom";
import { useFinanceData, formatCurrency } from "@/lib/finance-store";
import { Progress } from "@/components/ui/progress";
import { sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const nivel = (pct: number) => {
  if (pct > 100) return "estourou";
  return pct >= 80 ? "alerta" : "normal";
};

// Painel de teto mensal por subcategoria: limite efetivo x gasto do mês
// Sem limite: qualquer gasto conta como estouro (∞).
function percentualUsado(gasto: number, limite: number): number {
  if (limite > 0) return (gasto / limite) * 100;
  return gasto > 0 ? Infinity : 0;
}

export function OrcamentoCategorias({ className }: { className?: string }) {
  const { lancamentosMes, subcategorias, subcategoriasAtivas, limiteEfetivo, mesSelecionado, anoSelecionado, reembolsos } = useFinanceData();

  const saidas = lancamentosMes.filter((l) => l.categoria !== "entrada");
  const gastoPor = saidas.reduce((mapa, l) => {
    const chave = l.subcategoria ?? "";
    return mapa.set(chave, [...(mapa.get(chave) ?? []), l.valor]);
  }, new Map<string, number[]>());

  const linhas = subcategoriasAtivas.map((s) => {
    const gasto = sumMoney(gastoPor.get(s.slug) ?? []);
    const limite = limiteEfetivo(s.slug, anoSelecionado, mesSelecionado);
    const pct = percentualUsado(gasto, limite);
    return { s, gasto, limite, pct };
  });
  const dentro = linhas.filter((l) => l.s.contaNoOrcamento).sort((a, b) => b.pct - a.pct);
  const fora = linhas.filter((l) => !l.s.contaNoOrcamento);

  const totalPlanejado = sumMoney(dentro.map((l) => l.limite));
  const totalGasto = sumMoney(dentro.map((l) => l.gasto));
  const slugsConhecidos = new Set(subcategorias.map((s) => s.slug));
  const semCategoria = sumMoney(saidas.filter((l) => !l.subcategoria || !slugsConhecidos.has(l.subcategoria)).map((l) => l.valor));

  return (
    <div className={cn("finance-card", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">Limites do Mês</h3>
        <Link to="/orcamento" className="text-xs text-primary hover:underline">Editar limites</Link>
      </div>

      {dentro.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma subcategoria no orçamento.</p>
      ) : (
        <div className="space-y-3">
          {dentro.map(({ s, gasto, limite, pct }) => {
            const n = nivel(pct);
            return (
              <div key={s.slug}>
                <div className="flex items-center gap-2 text-sm mb-1">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                  <span className="truncate">{s.label}</span>
                  <span
                    className={cn(
                      "ml-auto whitespace-nowrap text-xs",
                      n === "estourou" && "text-destructive font-semibold",
                      n === "alerta" && "text-warning font-semibold",
                      n === "normal" && "text-muted-foreground",
                    )}
                  >
                    {formatCurrency(gasto)} / {formatCurrency(limite)}
                  </span>
                </div>
                <Progress
                  value={Math.min(Number.isFinite(pct) ? pct : 100, 100)}
                  className={cn("h-1.5", n === "estourou" && "[&>div]:bg-destructive", n === "alerta" && "[&>div]:bg-warning")}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t flex justify-between text-sm">
        <span className="text-muted-foreground">Total planejado</span>
        <span className={cn("font-semibold", totalGasto > totalPlanejado && "text-destructive")}>
          {formatCurrency(totalGasto)} / {formatCurrency(totalPlanejado)}
        </span>
      </div>
      {semCategoria >= 0.01 && (
        <p className="text-xs text-muted-foreground mt-1">Saídas sem subcategoria: {formatCurrency(semCategoria)}</p>
      )}

      {fora.length > 0 && (
        <div className="mt-4 pt-3 border-t space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fora do orçamento</p>
          {fora.map(({ s, gasto }) => (
            <div key={s.slug} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                <span className="truncate">{s.label}</span>
                <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{formatCurrency(gasto)}</span>
              </div>
              {s.slug === "compras_terceiros" && (
                <p className="text-xs text-muted-foreground mt-0.5 pl-4">
                  Compras de terceiros {formatCurrency(gasto)} · Reembolsos recebidos {formatCurrency(reembolsos)} · A receber{" "}
                  <span className="font-semibold text-foreground">{formatCurrency(sumMoney([gasto, -reembolsos]))}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
