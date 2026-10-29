import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinanceData } from "@/lib/finance-store";
import { MESES, MESES_CURTOS } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Seletor de mês global (←, mês/ano, →). Controla mesSelecionado/anoSelecionado do store. */
export function SeletorMes({ className }: { className?: string }) {
  const { mesSelecionado, anoSelecionado, setMesSelecionado, setAnoSelecionado, irParaMes } = useFinanceData();
  const [aberto, setAberto] = useState(false);
  const hoje = new Date();
  const ehAtual = mesSelecionado === hoje.getMonth() && anoSelecionado === hoje.getFullYear();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => irParaMes(-1)} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-8 px-2 font-semibold min-w-[132px]">
            {MESES[mesSelecionado]} {anoSelecionado}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="center">
          <div className="flex items-center gap-2 mb-3">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(anoSelecionado - 1)} aria-label="Ano anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              className="h-8 text-center"
              value={anoSelecionado}
              onChange={(e) => {
                const ano = Number(e.target.value);
                if (ano > 1900 && ano < 3000) setAnoSelecionado(ano);
              }}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(anoSelecionado + 1)} aria-label="Próximo ano">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MESES_CURTOS.map((m, i) => (
              <Button
                key={m}
                size="sm"
                variant={i === mesSelecionado ? "default" : "ghost"}
                className="capitalize"
                onClick={() => { setMesSelecionado(i); setAberto(false); }}
              >
                {m}
              </Button>
            ))}
          </div>
          {!ehAtual && (
            <Button
              variant="link"
              size="sm"
              className="w-full mt-2"
              onClick={() => { setMesSelecionado(hoje.getMonth()); setAnoSelecionado(hoje.getFullYear()); setAberto(false); }}
            >
              Ir para o mês atual
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => irParaMes(1)} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
