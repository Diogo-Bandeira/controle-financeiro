import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, CalendarClock, CreditCard, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, useFinanceData } from "@/lib/finance-store";
import { formatDiaMes } from "@/lib/format";
import { cartaoConfigurado, diasEntre, faturaAberta, parseISODate } from "@/lib/fatura";
import { sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Alerta {
  id: string;
  icone: typeof Bell;
  texto: string;
  para: string;
  grave?: boolean;
}

function emDias(n: number) {
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  return `em ${n} dias`;
}

/** Alertas do app (sem push): faturas fechando, contas a vencer, limites e cartões sem configuração. */
export function AlertasPopover() {
  const { cartoes, lancamentos, subcategoriasAtivas, limiteEfetivo, resumoFatura } = useFinanceData();

  const alertas = useMemo<Alerta[]>(() => {
    const hoje = new Date();
    const mes = hoje.getMonth();
    const ano = hoje.getFullYear();
    const ativos = cartoes.filter((c) => c.ativo);

    const faturas = ativos.filter(cartaoConfigurado).flatMap((c) => {
      const aberta = faturaAberta(c, hoje);
      const dias = diasEntre(hoje, aberta.dataFechamento);
      if (dias < 0 || dias > 3) return [];
      const total = resumoFatura(c.id, aberta)?.total ?? 0;
      return [{ id: `fat-${c.id}`, icone: CreditCard, texto: `Fatura ${c.nome} fecha ${emDias(dias)} (${formatCurrency(total)})`, para: "/cartoes" }];
    });

    const contas = lancamentos
      .filter((l) => l.status === "pendente" && l.categoria !== "cartao" && l.categoria !== "entrada")
      .flatMap((l) => {
        const dias = diasEntre(hoje, parseISODate(l.data));
        if (dias > 7) return [];
        const quando = dias < 0 ? `venceu em ${formatDiaMes(l.data)}` : `vence ${emDias(dias)}`;
        return [{ id: `conta-${l.id}`, icone: CalendarClock, texto: `${l.descricao} ${quando} (${formatCurrency(l.valor)})`, para: "/lancamentos", grave: dias < 0 }];
      });

    const doMes = lancamentos.filter((l) => l.mes === mes && l.ano === ano && l.categoria !== "entrada");
    const limites = subcategoriasAtivas
      .filter((s) => s.contaNoOrcamento)
      .flatMap((s) => {
        const limite = limiteEfetivo(s.slug, ano, mes);
        if (limite <= 0) return [];
        const gasto = sumMoney(doMes.filter((l) => l.subcategoria === s.slug).map((l) => l.valor));
        const pct = (gasto / limite) * 100;
        if (pct < 80) return [];
        return [{ id: `lim-${s.slug}`, icone: PieChart, texto: `${s.label}: ${pct.toFixed(0)}% do limite do mês`, para: "/orcamento", grave: pct > 100 }];
      });

    const semConfig = ativos
      .filter((c) => c.diaFechamento == null || c.diaVencimento == null)
      .map((c) => ({ id: `cfg-${c.id}`, icone: AlertTriangle, texto: `Cartão ${c.nome}: configure fechamento e vencimento`, para: "/cartoes" }));

    return [...contas, ...faturas, ...limites, ...semConfig];
  }, [cartoes, lancamentos, subcategoriasAtivas, limiteEfetivo, resumoFatura]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={`Alertas (${alertas.length})`}>
          <Bell className="h-4 w-4" />
          {alertas.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {alertas.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b font-semibold text-sm">Alertas</div>
        {alertas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">Tudo em dia por aqui.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto divide-y">
            {alertas.map((a) => (
              <li key={a.id}>
                <Link to={a.para} className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-muted/60">
                  <a.icone className={cn("h-4 w-4 mt-0.5 shrink-0", a.grave ? "text-destructive" : "text-warning")} />
                  <span>{a.texto}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
