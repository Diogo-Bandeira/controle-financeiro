import { useFinanceData, formatCurrency, SUBCATEGORIAS } from "@/lib/finance-store";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const totalPlanejado = SUBCATEGORIAS.reduce((s, c) => s + c.limite, 0);

// Painel de teto mensal por subcategoria: limite planejado x gasto do mês
export function OrcamentoCategorias({ className }: { className?: string }) {
  const { lancamentosMes } = useFinanceData();

  const saidas = lancamentosMes.filter((l) => l.categoria !== "entrada");
  const gastoPor = saidas.reduce((mapa, l) => {
    const chave = l.subcategoria ?? "";
    return mapa.set(chave, (mapa.get(chave) ?? 0) + l.valor);
  }, new Map<string, number>());
  const totalGasto = SUBCATEGORIAS.reduce((s, c) => s + (gastoPor.get(c.valor) ?? 0), 0);
  const semCategoria = saidas.reduce((s, l) => s + l.valor, 0) - totalGasto;

  return (
    <div className={cn("finance-card", className)}>
      <h3 className="section-title mb-4">Limites do Mês</h3>
      <div className="space-y-3">
        {SUBCATEGORIAS.map((s) => {
          const gasto = gastoPor.get(s.valor) ?? 0;
          const estourou = gasto > s.limite;
          return (
            <div key={s.valor}>
              <div className="flex items-center gap-2 text-sm mb-1">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                <span className="truncate">{s.label}</span>
                <span className={cn("ml-auto whitespace-nowrap text-xs", estourou ? "text-destructive font-semibold" : "text-muted-foreground")}>
                  {formatCurrency(gasto)} / {formatCurrency(s.limite)}
                </span>
              </div>
              <Progress
                value={Math.min((gasto / s.limite) * 100, 100)}
                className={cn("h-1.5", estourou && "[&>div]:bg-destructive")}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t flex justify-between text-sm">
        <span className="text-muted-foreground">Total planejado</span>
        <span className={cn("font-semibold", totalGasto > totalPlanejado && "text-destructive")}>
          {formatCurrency(totalGasto)} / {formatCurrency(totalPlanejado)}
        </span>
      </div>
      {semCategoria >= 0.01 && (
        <p className="text-xs text-muted-foreground mt-1">
          Saídas sem subcategoria: {formatCurrency(semCategoria)}
        </p>
      )}
    </div>
  );
}
