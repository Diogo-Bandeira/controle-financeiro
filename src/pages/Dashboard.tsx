import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Wallet, CalendarClock, CreditCard, Target, PiggyBank, BarChart3 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Progress } from "@/components/ui/progress";
import { ConsultorIA } from "@/components/ConsultorIA";
import { OrcamentoCategorias } from "@/components/OrcamentoCategorias";
import { EstadoVazio, PaginaCarregando } from "@/components/EstadoVazio";
import { useFinanceData, formatCurrency, MESES, type Lancamento } from "@/lib/finance-store";
import { formatDiaMes, formatDiaMesData, formatMesAno, MESES_CURTOS } from "@/lib/format";
import { compararMesAno, diasEntre, indiceMes, parseISODate, somarMeses, type MesAno } from "@/lib/fatura";
import { sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const COR_EIXO = "hsl(var(--muted-foreground))";
const tooltipStyle = {
  contentStyle: { backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
};

const rotuloMes = ({ mes, ano }: MesAno) => `${MESES_CURTOS[mes]}/${String(ano).slice(2)}`;

const SERIES_RECORRENTES = [
  { chave: "recCartao", nome: "Recorrentes no cartão", cor: "hsl(var(--primary))" },
  { chave: "recFixas", nome: "Contas fixas recorrentes", cor: "hsl(var(--warning))" },
  { chave: "recOutras", nome: "Outras saídas recorrentes", cor: "hsl(var(--primary) / 0.45)" },
];

interface ItemTooltip {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
  payload?: { saldo: number };
}

// Tooltip do gráfico de compromissos: séries do mês + saldo previsto (entradas recorrentes − compromissos).
function TooltipCompromissos({ active, label, payload }: { active?: boolean; label?: string; payload?: ItemTooltip[] }) {
  if (!active || !payload?.length) return null;
  const saldo = payload[0].payload?.saldo ?? 0;
  return (
    <div style={tooltipStyle.contentStyle} className="px-3 py-2 space-y-0.5 text-popover-foreground">
      <p style={tooltipStyle.labelStyle}>{label}</p>
      {payload.filter((p) => (p.value ?? 0) > 0).map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span>{formatCurrency(p.value ?? 0)}</span>
        </p>
      ))}
      <p className="flex justify-between gap-4 border-t pt-1 mt-1 font-semibold">
        <span>Saldo previsto</span>
        <span className={saldo >= 0 ? "text-success" : "text-destructive"}>{formatCurrency(saldo)}</span>
      </p>
    </div>
  );
}

export default function Dashboard() {
  const {
    loading, ocultarValores, mesSelecionado, anoSelecionado, lancamentos, lancamentosMes, lancamentosDoMes,
    entradas, reembolsos, rendaPlanejamento, totalSaidas, saldo, cartoes, parcelamentos, metas, aportes,
    resumoFatura, progressoParcelamento,
  } = useFinanceData();

  if (loading) return <PaginaCarregando />;

  const hoje = new Date();
  const sel = { mes: mesSelecionado, ano: anoSelecionado };
  const compacto = (v: number) =>
    ocultarValores ? "•••" : new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const tooltipBRL = (v: number) => formatCurrency(v);

  // ─── A pagar e faturas ─────────────────────────────────────────────────
  const cartoesAtivos = cartoes.filter((c) => c.ativo);
  const faturasMes = cartoesAtivos.map((c) => ({ cartao: c, fatura: resumoFatura(c.id, sel) })).filter((f) => f.fatura);
  const contasPendentesMes = lancamentosMes.filter((l) => l.categoria === "conta_fixa" && l.status === "pendente");
  const aPagar = sumMoney([
    ...contasPendentesMes.map((l) => l.valor),
    ...faturasMes.filter((f) => f.fatura.status !== "paga").map((f) => f.fatura.total),
  ]);
  const contasProximas = lancamentos
    .filter((l) => l.categoria === "conta_fixa" && l.status === "pendente")
    .map((l) => ({ l, dias: diasEntre(hoje, parseISODate(l.data)) }))
    .filter(({ dias }) => dias >= 0 && dias <= 7)
    .sort((a, b) => a.dias - b.dias);

  const situacaoFatura = (status: string, dataFechamento: Date) => {
    if (status === "paga") return { texto: "paga", cls: "text-success" };
    if (status === "fechada") return { texto: "fechada", cls: "text-warning" };
    if (status === "futura") return { texto: `fecha ${formatDiaMesData(dataFechamento)}`, cls: "text-muted-foreground" };
    const dias = diasEntre(hoje, dataFechamento);
    return { texto: dias <= 0 ? "fecha hoje" : `fecha em ${dias} dia${dias === 1 ? "" : "s"}`, cls: dias <= 3 ? "text-warning" : "text-muted-foreground" };
  };

  // ─── Compromissos dos próximos 6 meses (parcelas + recorrências) ─────────
  const meses6 = Array.from({ length: 6 }, (_, i) => somarMeses(sel.mes, sel.ano, i));
  const progressos = parcelamentos.map((p) => ({ p, prog: progressoParcelamento(p) }));
  const legados = progressos.filter(({ prog }) => !prog.vinculado && prog.restantes > 0);
  const mesAtual = { mes: hoje.getMonth(), ano: hoje.getFullYear() };
  const series = [
    ...cartoes.map((c) => ({ chave: c.id, nome: c.nome, cor: c.cor ?? "#64748B" })),
    { chave: "legado", nome: "Legado (estimado)", cor: COR_EIXO },
    ...SERIES_RECORRENTES,
  ];
  const dadosCompromissos = meses6.map((m) => {
    const doMes = lancamentosDoMes(m.ano, m.mes);
    const soma = (f: (l: Lancamento) => boolean) => sumMoney(doMes.filter(f).map((l) => l.valor));
    const recorrente = (categoria: Lancamento["categoria"]) => (l: Lancamento) => l.origem === "recorrente" && l.categoria === categoria;
    const porCartao = Object.fromEntries(cartoes.map((c) => [c.id, soma((l) => !!l.parcelamentoId && l.cartaoId === c.id)]));
    const legado = sumMoney(
      legados
        .filter(({ prog }) => compararMesAno(m, mesAtual) >= 0 && prog.termino && compararMesAno(m, prog.termino) <= 0)
        .map(({ p }) => p.valorParcela),
    );
    const saidasRec = { recCartao: soma(recorrente("cartao")), recFixas: soma(recorrente("conta_fixa")), recOutras: soma(recorrente("variavel")) };
    const entradasRec = soma(recorrente("entrada"));
    const compromissos = sumMoney([...Object.values(porCartao), legado, ...Object.values(saidasRec)]);
    return { rotulo: rotuloMes(m), ...porCartao, legado, ...saidasRec, entradasRec, saldo: sumMoney([entradasRec, -compromissos]) };
  });
  const seriesUsadas = series.filter((s) => dadosCompromissos.some((d) => (d[s.chave] ?? 0) > 0));
  const temEntradasRec = dadosCompromissos.some((d) => d.entradasRec > 0);
  const terminandoEmBreve = progressos
    .filter(({ prog }) => !prog.concluido && prog.termino && indiceMes(prog.termino) - indiceMes(sel) >= 0 && indiceMes(prog.termino) - indiceMes(sel) <= 2)
    .sort((a, b) => compararMesAno(a.prog.termino, b.prog.termino));
  const liberaTotal = sumMoney(terminandoEmBreve.map(({ p }) => p.valorParcela));

  // ─── Evolução 12 meses ─────────────────────────────────────────────────
  const evolucao = Array.from({ length: 12 }, (_, i) => somarMeses(sel.mes, sel.ano, i - 11)).map((m) => {
    const ls = lancamentosDoMes(m.ano, m.mes);
    const ent = sumMoney(ls.filter((l) => l.categoria === "entrada").map((l) => l.valor));
    const sai = sumMoney(ls.filter((l) => l.categoria !== "entrada").map((l) => l.valor));
    return { rotulo: rotuloMes(m), entradas: ent, saidas: sai, saldo: sumMoney([ent, -sai]) };
  });
  const temEvolucao = evolucao.some((e) => e.entradas > 0 || e.saidas > 0);

  // ─── Poupança e metas ──────────────────────────────────────────────────
  const reservaMes = sumMoney(lancamentosMes.filter((l) => l.categoria !== "entrada" && l.subcategoria === "reserva").map((l) => l.valor));
  const taxaPoupanca = rendaPlanejamento > 0 ? (reservaMes / rendaPlanejamento) * 100 : null;
  const doMesSel = (iso: string) => {
    const d = parseISODate(iso);
    return d.getMonth() === sel.mes && d.getFullYear() === sel.ano;
  };
  const metasResumo = metas.slice(0, 4).map((meta) => {
    const aps = aportes.filter((a) => a.metaId === meta.id);
    const atual = sumMoney([meta.valorAtual, ...aps.map((a) => a.valor)]);
    const aporteMes = sumMoney(aps.filter((a) => doMesSel(a.data)).map((a) => a.valor));
    const pct = meta.valorMeta > 0 ? Math.min((atual / meta.valorMeta) * 100, 100) : 0;
    return { meta, atual, aporteMes, pct };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Visão Geral</h2>
        <p className="text-muted-foreground text-sm">Resumo financeiro de {MESES[mesSelecionado]} / {anoSelecionado}</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-success" /></div>
            <span className="stat-label">Entradas</span>
          </div>
          <p className="stat-value text-success">{formatCurrency(entradas)}</p>
          {reembolsos > 0 && <p className="text-xs text-muted-foreground mt-1">dos quais reembolsos {formatCurrency(reembolsos)}</p>}
          <p className="text-xs text-muted-foreground">renda para planejamento {formatCurrency(rendaPlanejamento)}</p>
        </div>
        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center"><TrendingDown className="h-4 w-4 text-destructive" /></div>
            <span className="stat-label">Saídas</span>
          </div>
          <p className="stat-value text-destructive">{formatCurrency(totalSaidas)}</p>
        </div>
        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Wallet className="h-4 w-4 text-primary" /></div>
            <span className="stat-label">Saldo</span>
          </div>
          <p className={cn("stat-value", saldo >= 0 ? "text-success" : "text-destructive")}>{formatCurrency(saldo)}</p>
        </div>
        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center"><CalendarClock className="h-4 w-4 text-warning" /></div>
            <span className="stat-label">A pagar ainda neste mês</span>
          </div>
          <p className="stat-value">{formatCurrency(aPagar)}</p>
          <p className="text-xs text-muted-foreground mt-1">contas pendentes + faturas não pagas</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Próximas faturas e vencimentos */}
        <div className="finance-card">
          <h3 className="section-title mb-4">Próximas faturas e vencimentos</h3>
          {faturasMes.length === 0 && contasProximas.length === 0 ? (
            <EstadoVazio
              icone={CreditCard}
              titulo="Nada a vencer por aqui"
              descricao="Cadastre seus cartões para acompanhar faturas e vencimentos."
              acao={<Link to="/cartoes" className="text-sm text-primary hover:underline">Ir para Cartões</Link>}
            />
          ) : (
            <div className="space-y-4">
              {faturasMes.length > 0 && (
                <div className="divide-y">
                  {faturasMes.map(({ cartao, fatura }) => {
                    const sit = situacaoFatura(fatura.status, fatura.dataFechamento);
                    return (
                      <div key={cartao.id} className="flex items-center gap-3 py-2.5">
                        <span className="h-8 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cartao.cor ?? "#64748B" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{cartao.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            vence {formatDiaMesData(fatura.dataVencimento)} · <span className={sit.cls}>{sit.texto}</span>
                          </p>
                        </div>
                        <span className="font-semibold text-sm whitespace-nowrap">{formatCurrency(fatura.total)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {contasProximas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Contas pendentes (7 dias)</p>
                  <div className="divide-y">
                    {contasProximas.map(({ l, dias }) => (
                      <div key={l.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="flex-1 truncate">{l.descricao}</span>
                        <span className={cn("text-xs whitespace-nowrap", dias <= 2 ? "text-warning font-semibold" : "text-muted-foreground")}>
                          {dias === 0 ? "vence hoje" : `vence ${formatDiaMes(l.data)}`}
                        </span>
                        <span className="font-medium whitespace-nowrap">{formatCurrency(l.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <OrcamentoCategorias />
      </div>

      {/* Compromissos dos próximos 6 meses */}
      <div className="finance-card">
        <h3 className="section-title mb-4">Compromissos dos próximos 6 meses</h3>
        {seriesUsadas.length === 0 && !temEntradasRec ? (
          <EstadoVazio
            icone={CreditCard}
            titulo="Sem parcelas ou recorrências nos próximos meses"
            acao={<Link to="/parcelamentos" className="text-sm text-primary hover:underline">Ver parcelamentos</Link>}
          />
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dadosCompromissos} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fill: COR_EIXO, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compacto} tick={{ fill: COR_EIXO, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<TooltipCompromissos />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {seriesUsadas.map((s) => (
                    <Bar key={s.chave} dataKey={s.chave} name={s.nome} stackId="compromissos" fill={s.cor} maxBarSize={48} />
                  ))}
                  {temEntradasRec && (
                    <Line dataKey="entradasRec" name="Entradas recorrentes" type="monotone" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {terminandoEmBreve.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">Termina em breve</p>
                  <p className="text-xs text-muted-foreground">libera {formatCurrency(liberaTotal)}/mês</p>
                </div>
                <div className="divide-y">
                  {terminandoEmBreve.map(({ p, prog }) => (
                    <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="flex-1 truncate">{p.descricao}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">termina em {formatMesAno(prog.termino.mes, prog.termino.ano)}</span>
                      <span className="font-medium whitespace-nowrap text-success">+{formatCurrency(p.valorParcela)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Evolução 12 meses */}
      <div className="finance-card">
        <h3 className="section-title mb-4">Evolução dos últimos 12 meses</h3>
        {!temEvolucao ? (
          <EstadoVazio icone={BarChart3} titulo="Ainda não há histórico suficiente" descricao="Os lançamentos dos meses aparecem aqui." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={evolucao} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fill: COR_EIXO, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={compacto} tick={{ fill: COR_EIXO, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={tooltipBRL} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="entradas" name="Entradas" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="saidas" name="Saídas" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Line dataKey="saldo" name="Saldo" type="monotone" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* Taxa de poupança */}
        <div className="finance-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center"><PiggyBank className="h-4 w-4 text-success" /></div>
            <span className="stat-label">Taxa de poupança</span>
          </div>
          <p className="stat-value">{taxaPoupanca == null ? "—" : `${taxaPoupanca.toFixed(1)}%`}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrency(reservaMes)} em Reserva ÷ {formatCurrency(rendaPlanejamento)} de renda para planejamento
          </p>
        </div>

        {/* Progresso das metas */}
        <div className="finance-card">
          <h3 className="section-title mb-4">Progresso das Metas</h3>
          {metasResumo.length === 0 ? (
            <EstadoVazio
              icone={Target}
              titulo="Nenhuma meta cadastrada"
              acao={<Link to="/metas" className="text-sm text-primary hover:underline">Criar uma meta</Link>}
            />
          ) : (
            <div className="space-y-4">
              {metasResumo.map(({ meta, atual, aporteMes, pct }) => (
                <div key={meta.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium truncate">{meta.nome}</span>
                    <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1 gap-2">
                    <span>{formatCurrency(atual)} de {formatCurrency(meta.valorMeta)}</span>
                    <span className={aporteMes > 0 ? "text-success" : undefined}>aporte no mês {formatCurrency(aporteMes)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConsultorIA />
    </div>
  );
}
