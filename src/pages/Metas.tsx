import { useFinanceData, formatCurrency, type Aporte, type Meta } from "@/lib/finance-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MoneyInput } from "@/components/MoneyInput";
import { DataField } from "@/components/CamposData";
import { EstadoVazio, PaginaCarregando } from "@/components/EstadoVazio";
import { formatDataBR, formatMesAno } from "@/lib/format";
import { parseISODate, toISODate } from "@/lib/fatura";
import { round2 } from "@/lib/money";
import { aporteMensalNecessario, evolucaoMeta, mesesAte, projecaoConclusao, ritmoMedio, saldoMeta } from "@/lib/metas";
import { ChevronDown, Pencil, PiggyBank, Plus, Target, Trash2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useState } from "react";
import { toast } from "sonner";

interface FormMeta {
  nome: string;
  valorMeta: number;
  valorAtual: number;
  prazo: string;
  taxaPct: string;
}

const formVazio: FormMeta = { nome: "", valorMeta: 0, valorAtual: 0, prazo: "", taxaPct: "" };

function MetaCard({ meta, aportes, onEditar, onExcluir, onAportar, onExcluirAporte }: {
  meta: Meta;
  aportes: Aporte[];
  onEditar: () => void;
  onExcluir: () => void;
  onAportar: () => void;
  onExcluirAporte: (a: Aporte) => void;
}) {
  const hoje = new Date();
  const atual = saldoMeta(meta.valorAtual, aportes);
  const falta = Math.max(round2(meta.valorMeta - atual), 0);
  const pct = meta.valorMeta > 0 ? Math.min((atual / meta.valorMeta) * 100, 100) : 0;
  const ritmo = ritmoMedio(aportes, hoje);
  const necessario = meta.prazo ? aporteMensalNecessario(atual, meta.valorMeta, mesesAte(hoje, parseISODate(meta.prazo)), meta.taxaRendimentoMensal) : null;
  const projecao = projecaoConclusao(atual, meta.valorMeta, ritmo, meta.taxaRendimentoMensal, hoje);
  const noRitmo = necessario == null ? null : falta === 0 || ritmo >= necessario;
  const serie = evolucaoMeta(meta.valorAtual, aportes, { mes: hoje.getMonth(), ano: hoje.getFullYear() }).map((p) => ({
    ...p, rotulo: formatMesAno(p.mes, p.ano),
  }));
  const ordenados = [...aportes].sort((a, b) => b.data.localeCompare(a.data));
  const gradId = `grad-${meta.id}`;
  const conclusao = (() => {
    if (falta === 0) return "Concluída";
    return projecao ? formatMesAno(projecao.mes, projecao.ano) : "Sem previsão";
  })();

  return (
    <div className="finance-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{meta.nome}</h3>
            <p className="text-xs text-muted-foreground">
              {meta.prazo ? `Prazo ${formatDataBR(meta.prazo)}` : "Sem prazo"}
              {meta.taxaRendimentoMensal ? ` · ${(meta.taxaRendimentoMensal * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.m.` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 items-center">
          {noRitmo != null && (
            <Badge variant="outline" className={noRitmo ? "bg-success/10 text-success border-success/30" : "bg-destructive/10 text-destructive border-destructive/30"}>
              {noRitmo ? "No ritmo" : "Atrasado"}
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEditar} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExcluir} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>

      <div>
        <Progress value={pct} className="h-3" />
        <p className="text-xs text-muted-foreground mt-1 text-right font-medium">{pct.toFixed(1)}% concluído</p>
      </div>

      <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-sm">
        <div><span className="text-muted-foreground text-xs">Meta</span><p className="font-semibold">{formatCurrency(meta.valorMeta)}</p></div>
        <div><span className="text-muted-foreground text-xs">Atual</span><p className="font-semibold text-primary">{formatCurrency(atual)}</p></div>
        <div><span className="text-muted-foreground text-xs">Falta</span><p className="font-semibold text-destructive">{formatCurrency(falta)}</p></div>
        <div>
          <span className="text-muted-foreground text-xs">Aporte necessário</span>
          <p className="font-semibold">{necessario == null ? "—" : `${formatCurrency(necessario)}/mês`}</p>
        </div>
        <div><span className="text-muted-foreground text-xs">Ritmo (3 meses)</span><p className="font-semibold text-success">{formatCurrency(ritmo)}/mês</p></div>
        <div>
          <span className="text-muted-foreground text-xs">Conclusão prevista</span>
          <p className="font-semibold capitalize">{conclusao}</p>
        </div>
      </div>

      <div className="h-20 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="rotulo" hide />
            <Tooltip
              formatter={(v: number) => [formatCurrency(v), "Saldo"]}
              labelFormatter={(l: string) => l}
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--popover-foreground))" }}
            />
            <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#${gradId})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onAportar}>
          <PiggyBank className="h-4 w-4 mr-1" /> Registrar aporte
        </Button>
      </div>

      {ordenados.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
            {ordenados.length} aporte(s)
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 divide-y">
            {ordenados.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="text-muted-foreground text-xs w-20">{formatDataBR(a.data)}</span>
                <span className="flex-1 font-medium">{formatCurrency(a.valor)}</span>
                {a.lancamentoId && <span className="text-[10px] text-muted-foreground">lançamento</span>}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onExcluirAporte(a)} aria-label="Excluir aporte">
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export default function Metas() {
  const { metas, aportes, addMeta, updateMeta, deleteMeta, addAporte, deleteAporte, loading } = useFinanceData();
  const [editMeta, setEditMeta] = useState<Meta | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormMeta>(formVazio);
  const [excluir, setExcluir] = useState<Meta | null>(null);
  const [aportando, setAportando] = useState<Meta | null>(null);
  const [aporteData, setAporteData] = useState(toISODate(new Date()));
  const [aporteValor, setAporteValor] = useState(0);

  const set = <K extends keyof FormMeta>(k: K, v: FormMeta[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = (meta: Meta | null) => {
    setEditMeta(meta);
    setForm(meta ? {
      nome: meta.nome,
      valorMeta: meta.valorMeta,
      valorAtual: meta.valorAtual,
      prazo: meta.prazo ?? "",
      taxaPct: meta.taxaRendimentoMensal != null ? String(round2(meta.taxaRendimentoMensal * 100)).replace(".", ",") : "",
    } : formVazio);
    setOpen(true);
  };

  const saveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    const taxa = form.taxaPct.trim() ? Number(form.taxaPct.replace(",", ".")) : null;
    if (taxa != null && (Number.isNaN(taxa) || taxa < 0 || taxa > 20)) { toast.error("Taxa mensal inválida"); return; }
    const dados = {
      nome: form.nome.trim(),
      valorMeta: form.valorMeta,
      valorAtual: form.valorAtual,
      rendimento: editMeta?.rendimento ?? 0,
      prazo: form.prazo || null,
      taxaRendimentoMensal: taxa == null ? null : Number((taxa / 100).toFixed(4)),
    };
    const ok = editMeta ? await updateMeta({ ...dados, id: editMeta.id }) : await addMeta(dados);
    if (!ok) return;
    setOpen(false);
    setEditMeta(null);
  };

  const abrirAporte = (meta: Meta) => {
    setAportando(meta);
    setAporteData(toISODate(new Date()));
    setAporteValor(0);
  };

  const salvarAporte = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aportando) return;
    if (aporteValor <= 0) { toast.error("Informe o valor do aporte"); return; }
    const ok = await addAporte({ metaId: aportando.id, data: aporteData, valor: aporteValor, lancamentoId: null });
    if (!ok) return;
    toast.success("Aporte registrado");
    setAportando(null);
  };

  if (loading) return <PaginaCarregando cards={2} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Gestão de Metas</h2>
          <p className="text-muted-foreground text-sm">Acompanhe suas metas financeiras</p>
        </div>
        <Button onClick={() => abrir(null)}><Plus className="h-4 w-4 mr-1" /> Nova Meta</Button>
      </div>

      {metas.length === 0 ? (
        <div className="finance-card">
          <EstadoVazio
            icone={Target}
            titulo="Nenhuma meta cadastrada"
            descricao="Defina um objetivo, prazo e rendimento para saber quanto aportar por mês."
            acao={<Button size="sm" onClick={() => abrir(null)}><Plus className="h-4 w-4 mr-1" /> Criar meta</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metas.map((meta) => (
            <MetaCard
              key={meta.id}
              meta={meta}
              aportes={aportes.filter((a) => a.metaId === meta.id)}
              onEditar={() => abrir(meta)}
              onExcluir={() => setExcluir(meta)}
              onAportar={() => abrirAporte(meta)}
              onExcluirAporte={(a) => deleteAporte(a.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditMeta(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editMeta ? "Editar Meta" : "Nova Meta"}</DialogTitle></DialogHeader>
          <form onSubmit={saveMeta} className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={form.nome} onChange={(e) => set("nome", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor da meta</Label><MoneyInput value={form.valorMeta} onChange={(v) => set("valorMeta", v)} /></div>
              <div><Label>Saldo inicial</Label><MoneyInput value={form.valorAtual} onChange={(v) => set("valorAtual", v)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <Label>Prazo</Label>
                  {form.prazo && <button type="button" className="text-xs text-primary hover:underline" onClick={() => set("prazo", "")}>limpar</button>}
                </div>
                <DataField value={form.prazo} onChange={(v) => set("prazo", v)} />
              </div>
              <div>
                <Label htmlFor="taxa">Rendimento (% a.m.)</Label>
                <Input id="taxa" inputMode="decimal" placeholder="0,90" value={form.taxaPct} onChange={(e) => set("taxaPct", e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Atual = saldo inicial + aportes registrados.</p>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aportando} onOpenChange={(v) => !v && setAportando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar aporte · {aportando?.nome}</DialogTitle></DialogHeader>
          <form onSubmit={salvarAporte} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><DataField value={aporteData} onChange={setAporteData} /></div>
              <div><Label>Valor</Label><MoneyInput value={aporteValor} onChange={setAporteValor} /></div>
            </div>
            <Button type="submit" className="w-full">Registrar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(v) => !v && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta?</AlertDialogTitle>
            <AlertDialogDescription>"{excluir?.nome}" e todos os seus aportes serão removidos. Os lançamentos vinculados continuam.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (excluir) deleteMeta(excluir.id); setExcluir(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
