import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface EstadoVazioProps {
  icone: LucideIcon;
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  className?: string;
}

export function EstadoVazio({ icone: Icone, titulo, descricao, acao, className }: EstadoVazioProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-8 px-4 gap-2", className)}>
      <Icone className="h-10 w-10 text-muted-foreground/60" />
      <p className="font-medium text-sm">{titulo}</p>
      {descricao && <p className="text-xs text-muted-foreground max-w-xs">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

/** Skeleton de página: título + cards. Substitui o spinner de tela cheia. */
export function PaginaCarregando({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
