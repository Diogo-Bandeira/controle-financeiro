import { useFinanceData, formatCurrency, MESES } from "@/lib/finance-store";
import { TrendingUp, TrendingDown, Wallet, Church, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

const anoAtual = new Date().getFullYear();
const ANOS = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];

export default function Dashboard() {
  const {
    metas, mesSelecionado, setMesSelecionado,
    anoSelecionado, setAnoSelecionado,
    entradas, totalSaidas, saldo, dizimos, contasFixas, cartoes, variaveis, loading
  } = useFinanceData();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const necessidades = contasFixas + dizimos;
  const desejos = cartoes + variaveis;

  const pieData = [
    { name: "Contas Fixas", value: contasFixas, color: "hsl(195, 70%, 28%)" },
    { name: "Dízimos", value: dizimos, color: "hsl(42, 85%, 55%)" },
    { name: "Cartões", value: cartoes, color: "hsl(0, 72%, 51%)" },
    { name: "Variáveis", value: variaveis, color: "hsl(152, 60%, 40%)" },
  ].filter((d) => d.value > 0);

  const topMetas = metas.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Visão Geral</h2>
          <p className="text-muted-foreground text-sm">Resumo financeiro de {MESES[mesSelecionado]} / {anoSelecionado}</p>
        </div>
        <div className="flex gap-2">
          <Select value={String(anoSelecionado)} onValueChange={(v) => setAnoSelecionado(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANOS.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(mesSelecionado)} onValueChange={(v) => setMesSelecionado(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <span className="stat-label">Entradas</span>
          </div>
          <p className="stat-value text-success">{formatCurrency(entradas)}</p>
        </div>

        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <span className="stat-label">Saídas</span>
          </div>
          <p className="stat-value text-destructive">{formatCurrency(totalSaidas)}</p>
        </div>

        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <span className="stat-label">Saldo</span>
          </div>
          <p className={`stat-value ${saldo >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(saldo)}</p>
        </div>

        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <Church className="h-4 w-4 text-accent-foreground" />
            </div>
            <span className="stat-label">Dízimo (10%)</span>
          </div>
          <p className="stat-value text-accent-foreground">{formatCurrency(dizimos)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sugerido: {formatCurrency(entradas * 0.1)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="finance-card">
          <h3 className="section-title mb-4">Distribuição de Gastos</h3>
          {pieData.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold ml-auto">{formatCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Nenhum gasto registrado neste mês.</p>
          )}

          <div className="mt-6 space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Necessidades</span>
                <span className="font-medium">{formatCurrency(necessidades)}</span>
              </div>
              <Progress value={entradas > 0 ? (necessidades / entradas) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Desejos</span>
                <span className="font-medium">{formatCurrency(desejos)}</span>
              </div>
              <Progress value={entradas > 0 ? (desejos / entradas) * 100 : 0} className="h-2" />
            </div>
          </div>
        </div>

        {/* Metas preview */}
        <div className="finance-card">
          <h3 className="section-title mb-4">Progresso das Metas</h3>
          {topMetas.length > 0 ? (
            <div className="space-y-4">
              {topMetas.map((meta) => {
                const pct = meta.valorMeta > 0 ? Math.min((meta.valorAtual / meta.valorMeta) * 100, 100) : 0;
                return (
                  <div key={meta.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{meta.nome}</span>
                      <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                    <Progress value={pct} className="h-2.5" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatCurrency(meta.valorAtual)}</span>
                      <span>{formatCurrency(meta.valorMeta)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Nenhuma meta cadastrada.</p>
          )}
        </div>
      </div>
    </div>
  );
}
