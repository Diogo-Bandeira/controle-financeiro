import { useFinanceData } from "@/lib/finance-store";
import { cn } from "@/lib/utils";

interface ChipCorProps {
  cor: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}

/** Chip colorido (fundo 10% da cor). Base do SubcategoriaChip e CartaoChip. */
export function ChipCor({ cor, label, className, children }: ChipCorProps) {
  return (
    <span
      title={label}
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap max-w-full", className)}
      style={{ backgroundColor: cor + "18", borderColor: cor + "50", color: cor }}
    >
      <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: cor }} />
      <span className="truncate">{label}</span>
      {children}
    </span>
  );
}

export function SubcategoriaChip({ slug, className, children }: { slug: string | null | undefined; className?: string; children?: React.ReactNode }) {
  const { getSubcategoria } = useFinanceData();
  const sub = getSubcategoria(slug);
  if (!sub) return null;
  return <ChipCor cor={sub.cor} label={sub.label} className={className}>{children}</ChipCor>;
}

export function CartaoChip({ cartaoId, className, children }: { cartaoId: string | null | undefined; className?: string; children?: React.ReactNode }) {
  const { getCartao } = useFinanceData();
  const cartao = getCartao(cartaoId);
  if (!cartao) return null;
  return <ChipCor cor={cartao.cor ?? "#64748B"} label={cartao.nome} className={cn("rounded-md", className)}>{children}</ChipCor>;
}

/** Bolinha + label para usar dentro de SelectItem. */
export function OpcaoCor({ cor, label }: { cor: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cor }} />
      {label}
    </div>
  );
}
