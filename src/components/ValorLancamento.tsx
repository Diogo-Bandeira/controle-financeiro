import { formatCurrency } from "@/lib/format";
import { ehCredito } from "@/lib/lancamento";
import type { Lancamento } from "@/lib/store/types";
import { cn } from "@/lib/utils";

type ValorProps = Pick<Lancamento, "categoria" | "valor">;

// Negativo: verde nas saídas (reduz o gasto), vermelho nas entradas.
function corDoValor({ categoria, valor }: ValorProps): string | undefined {
  const entrada = categoria === "entrada";
  if (valor < 0) return entrada ? "text-destructive" : "text-success";
  return entrada ? "text-success" : undefined;
}

/** Valor com sinal e cor: "+R$ 100,00" (entrada), "− R$ 50,00" (crédito). */
export function ValorLancamento({ l, className }: { l: ValorProps; className?: string }) {
  const prefixo = l.categoria === "entrada" && l.valor > 0 ? "+" : "";
  return <span className={cn(corDoValor(l), className)}>{prefixo}{formatCurrency(l.valor)}</span>;
}

export function SeloCredito({ l }: { l: ValorProps }) {
  if (!ehCredito(l)) return null;
  return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success">Crédito</span>;
}
