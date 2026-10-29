import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, GripVertical, Pencil, PiggyBank, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/MoneyInput";
import { EstadoVazio, PaginaCarregando } from "@/components/EstadoVazio";
import { useFinanceData, formatCurrency, type Subcategoria, type TipoSubcategoria } from "@/lib/finance-store";
import { MESES, PALETA_CORES, TIPOS_SUBCATEGORIA } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { normalizarTexto } from "@/lib/texto";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const tiposKeys = Object.keys(TIPOS_SUBCATEGORIA) as TipoSubcategoria[];

/** Valor monetário editável inline: salva no blur ou Enter; Esc desfaz. */
function CelulaValor({ valor, onCommit, className }: { valor: number; onCommit: (v: number) => void; className?: string }) {
  const [rascunho, setRascunho] = useState(valor);
  useEffect(() => setRascunho(valor), [valor]);

  return (
    <MoneyInput
      value={rascunho}
      onChange={setRascunho}
      className={cn("h-8 text-right", className)}
      onBlur={() => { if (rascunho !== valor) onCommit(rascunho); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setRascunho(valor);
      }}
    />
  );
}

function corNivel(pct: number) {
  if (pct > 100) return "text-destructive";
  return pct >= 80 ? "text-warning" : "text-muted-foreground";
}

interface FormSub {
  label: string;
  cor: string;
  tipo: TipoSubcategoria;
  contaNoOrcamento: boolean;
  limitePadrao: number;
}

const formVazio: FormSub = { label: "", cor: PALETA_CORES[0], tipo: "desejo", contaNoOrcamento: true, limitePadrao: 0 };

export default function Orcamento() {
  const {
    loading, subcategorias, subcategoriasAtivas, limiteEfetivo, orcamentos, lancamentosMes, mesSelecionado, anoSelecionado,
    definirLimiteMeses, addSubcategoria, updateSubcategoria, reordenarSubcategorias,
  } = useFinanceData();

  const [dialogo, setDialogo] = useState<{ aberto: boolean; sub: Subcategoria | null }>({ aberto: false, sub: null });
  const [form, setForm] = useState<FormSub>(formVazio);
  const [pendente, setPendente] = useState<{ sub: Subcategoria; valor: number } | null>(null);
  const [nMeses, setNMeses] = useState(3);
  const [arrastando, setArrastando] = useState<string | null>(null);

  if (loading) return <PaginaCarregando />;

  const mesSel = { mes: mesSelecionado, ano: anoSelecionado };
  const arquivadas = subcategorias.filter((s) => !s.ativa);

  const gastoPor = lancamentosMes
    .filter((l) => l.categoria !== "entrada" && l.subcategoria)
    .reduce((m, l) => m.set(l.subcategoria, [...(m.get(l.subcategoria) ?? []), l.valor]), new Map<string, number[]>());

  const linhas = subcategoriasAtivas.map((s) => {
    const override = orcamentos.find((o) => o.subcategoriaSlug === s.slug && o.mes === mesSelecionado && o.ano === anoSelecionado);
    const limite = limiteEfetivo(s.slug, anoSelecionado, mesSelecionado);
    const gasto = sumMoney(gastoPor.get(s.slug) ?? []);
    const pct = limite > 0 ? (gasto / limite) * 100 : 0;
    return { s, override, limite, gasto, pct };
  });
  const noOrcamento = linhas.filter((l) => l.s.contaNoOrcamento);
  const totalPlanejado = sumMoney(noOrcamento.map((l) => l.limite));
  const totalGasto = sumMoney(noOrcamento.map((l) => l.gasto));

  // ─── Ações ─────────────────────────────────────────────────────────────

  const abrirDialogo = (sub: Subcategoria | null) => {
    setForm(sub ? { label: sub.label, cor: sub.cor, tipo: sub.tipo ?? "desejo", contaNoOrcamento: sub.contaNoOrcamento, limitePadrao: sub.limitePadrao } : formVazio);
    setDialogo({ aberto: true, sub });
  };

  const gerarSlug = (label: string) => {
    const base = normalizarTexto(label).replace(/ /g, "_") || "subcategoria";
    const existentes = new Set(subcategorias.map((s) => s.slug));
    if (!existentes.has(base)) return base;
    const n = Array.from({ length: 100 }, (_, i) => i + 2).find((i) => !existentes.has(`${base}_${i}`));
    return `${base}_${n}`;
  };

  const salvarDialogo = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = form.label.trim();
    if (!label) { toast.error("Informe o nome"); return; }
    const ok = dialogo.sub
      ? await updateSubcategoria({ ...dialogo.sub, ...form, label })
      : !!(await addSubcategoria({ ...form, label, slug: gerarSlug(label), ordem: subcategoriasAtivas.length + 1, ativa: true }));
    if (!ok) return;
    toast.success(dialogo.sub ? "Subcategoria atualizada" : "Subcategoria criada");
    setDialogo({ aberto: false, sub: null });
  };

  const alternarAtiva = async (s: Subcategoria) => {
    if (await updateSubcategoria({ ...s, ativa: !s.ativa })) toast.success(s.ativa ? `"${s.label}" arquivada` : `"${s.label}" reativada`);
  };

  const salvarPadrao = (s: Subcategoria, valor: number) => updateSubcategoria({ ...s, limitePadrao: valor });

  const aplicarLimiteMes = async (modo: "mes" | "proximos" | "padrao") => {
    if (!pendente) return;
    const { sub, valor } = pendente;
    setPendente(null);
    if (modo === "padrao") {
      const ok = await salvarPadrao(sub, valor);
      const temOverride = orcamentos.some((o) => o.subcategoriaSlug === sub.slug && o.mes === mesSelecionado && o.ano === anoSelecionado);
      if (ok && temOverride) await definirLimiteMeses(sub.slug, mesSel, 1, null);
      if (ok) toast.success("Limite padrão atualizado");
      return;
    }
    const qtd = modo === "mes" ? 1 : Math.max(1, nMeses);
    if (await definirLimiteMeses(sub.slug, mesSel, qtd, valor)) toast.success(qtd === 1 ? "Limite do mês salvo" : `Limite salvo para ${qtd} meses`);
  };

  const mover = (lista: Subcategoria[], de: number, para: number) => {
    if (para < 0 || para >= lista.length || de === para) return;
    const nova = [...lista];
    const [item] = nova.splice(de, 1);
    nova.splice(para, 0, item);
    reordenarSubcategorias([...nova, ...arquivadas]);
  };

  const ativas = linhas.map((l) => l.s);
  const onDrop = (alvoSlug: string) => {
    if (!arrastando) return;
    mover(ativas, ativas.findIndex((s) => s.slug === arrastando), ativas.findIndex((s) => s.slug === alvoSlug));
    setArrastando(null);
  };

  const celulaLimiteMes = (l: (typeof linhas)[number]) => (
    <div className="flex items-center gap-1 justify-end">
      {/* key muda ao fechar o diálogo de escopo → descarta o rascunho se cancelado */}
      <CelulaValor key={`${l.s.slug}-${pendente?.sub.slug === l.s.slug}`} valor={l.limite} onCommit={(v) => setPendente({ sub: l.s, valor: v })} className={cn("w-32", l.override && "border-primary")} />
      {l.override && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="Voltar ao limite padrão"
          onClick={() => definirLimiteMeses(l.s.slug, mesSel, 1, null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  const acoes = (s: Subcategoria) => (
    <div className="flex items-center gap-0.5 justify-end">
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => abrirDialogo(s)}>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Arquivar" onClick={() => alternarAtiva(s)}>
        <Archive className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Orçamento</h2>
          <p className="text-muted-foreground text-sm">Limites de {MESES[mesSelecionado]} / {anoSelecionado}</p>
        </div>
        <Button onClick={() => abrirDialogo(null)}><Plus className="h-4 w-4 mr-1" /> Nova subcategoria</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="finance-card">
          <p className="stat-label">Total planejado</p>
          <p className="text-xl font-bold">{formatCurrency(totalPlanejado)}</p>
        </div>
        <div className="finance-card">
          <p className="stat-label">Gasto no orçamento</p>
          <p className={cn("text-xl font-bold", totalGasto > totalPlanejado && "text-destructive")}>{formatCurrency(totalGasto)}</p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="finance-card">
          <EstadoVazio
            icone={PiggyBank}
            titulo="Nenhuma subcategoria ativa"
            descricao="Crie subcategorias para planejar seus limites mensais."
            acao={<Button size="sm" onClick={() => abrirDialogo(null)}>Criar subcategoria</Button>}
          />
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="finance-card p-0 overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="w-8" />
                  <th className="text-left font-medium py-3 px-2">Subcategoria</th>
                  <th className="text-left font-medium px-2">Tipo</th>
                  <th className="text-center font-medium px-2" title="Conta no orçamento">No orçam.</th>
                  <th className="text-right font-medium px-2">Limite padrão</th>
                  <th className="text-right font-medium px-2">Limite do mês</th>
                  <th className="text-right font-medium px-2">Gasto</th>
                  <th className="text-right font-medium px-2 w-28">% usado</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.s.id}
                    draggable
                    onDragStart={() => setArrastando(l.s.slug)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(l.s.slug)}
                    onDragEnd={() => setArrastando(null)}
                    className={cn("border-b last:border-0 hover:bg-muted/40", arrastando === l.s.slug && "opacity-50")}
                  >
                    <td className="pl-2 cursor-grab text-muted-foreground"><GripVertical className="h-4 w-4" /></td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: l.s.cor }} />
                        <span className="font-medium">{l.s.label}</span>
                      </div>
                    </td>
                    <td className="px-2 text-muted-foreground">{l.s.tipo ? TIPOS_SUBCATEGORIA[l.s.tipo] : "—"}</td>
                    <td className="px-2 text-center">
                      <Switch checked={l.s.contaNoOrcamento} onCheckedChange={(v) => updateSubcategoria({ ...l.s, contaNoOrcamento: v })} />
                    </td>
                    <td className="px-2"><CelulaValor valor={l.s.limitePadrao} onCommit={(v) => salvarPadrao(l.s, v)} className="w-32 ml-auto" /></td>
                    <td className="px-2">{celulaLimiteMes(l)}</td>
                    <td className="px-2 text-right whitespace-nowrap">{formatCurrency(l.gasto)}</td>
                    <td className="px-2">
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn("text-xs font-semibold", corNivel(l.pct))}>{l.limite > 0 ? `${l.pct.toFixed(0)}%` : "—"}</span>
                        <Progress
                          value={Math.min(l.pct, 100)}
                          className={cn("h-1.5 w-20", l.pct > 100 && "[&>div]:bg-destructive", l.pct >= 80 && l.pct <= 100 && "[&>div]:bg-warning")}
                        />
                      </div>
                    </td>
                    <td className="pr-2">{acoes(l.s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {linhas.map((l, i) => (
              <div key={l.s.id} className="finance-card space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: l.s.cor }} />
                  <span className="font-medium flex-1 truncate">{l.s.label}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => mover(ativas, i, i - 1)} aria-label="Subir">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === linhas.length - 1} onClick={() => mover(ativas, i, i + 1)} aria-label="Descer">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  {acoes(l.s)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{l.s.tipo ? TIPOS_SUBCATEGORIA[l.s.tipo] : "Sem tipo"}</span>
                  <label className="flex items-center gap-2">
                    No orçamento
                    <Switch checked={l.s.contaNoOrcamento} onCheckedChange={(v) => updateSubcategoria({ ...l.s, contaNoOrcamento: v })} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Limite padrão</Label>
                    <CelulaValor valor={l.s.limitePadrao} onCommit={(v) => salvarPadrao(l.s, v)} />
                  </div>
                  <div>
                    <Label className="text-xs">Limite do mês {l.override && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">próprio</Badge>}</Label>
                    {celulaLimiteMes(l)}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Gasto {formatCurrency(l.gasto)}</span>
                    <span className={cn("font-semibold", corNivel(l.pct))}>{l.limite > 0 ? `${l.pct.toFixed(0)}%` : "—"}</span>
                  </div>
                  <Progress value={Math.min(l.pct, 100)} className={cn("h-1.5", l.pct > 100 && "[&>div]:bg-destructive", l.pct >= 80 && l.pct <= 100 && "[&>div]:bg-warning")} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Arraste as linhas para reordenar. Limite do mês com borda destacada = valor próprio deste mês; o "×" volta ao padrão.
          </p>
        </>
      )}

      {arquivadas.length > 0 && (
        <Collapsible className="finance-card">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
            Arquivadas ({arquivadas.length})
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 divide-y">
            {arquivadas.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
                <span className="flex-1 truncate text-muted-foreground">{s.label}</span>
                <Button variant="outline" size="sm" onClick={() => alternarAtiva(s)}>
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Reativar
                </Button>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Criar / editar subcategoria */}
      <Dialog open={dialogo.aberto} onOpenChange={(v) => setDialogo((d) => ({ ...d, aberto: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogo.sub ? "Editar subcategoria" : "Nova subcategoria"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={salvarDialogo} className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoSubcategoria }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tiposKeys.map((t) => <SelectItem key={t} value={t}>{TIPOS_SUBCATEGORIA[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Limite padrão</Label>
                <MoneyInput value={form.limitePadrao} onChange={(v) => setForm((f) => ({ ...f, limitePadrao: v }))} />
              </div>
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {PALETA_CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    onClick={() => setForm((f) => ({ ...f, cor: c }))}
                    className={cn("h-7 w-7 rounded-full border-2 transition-transform", form.cor === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="conta-orc">Conta no orçamento</Label>
              <Switch id="conta-orc" checked={form.contaNoOrcamento} onCheckedChange={(v) => setForm((f) => ({ ...f, contaNoOrcamento: v }))} />
            </div>
            <Button type="submit" className="w-full">{dialogo.sub ? "Salvar" : "Criar"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Escopo da edição do limite do mês */}
      <AlertDialog open={!!pendente} onOpenChange={(v) => { if (!v) setPendente(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Novo limite: {pendente && formatCurrency(pendente.valor)}</AlertDialogTitle>
            <AlertDialogDescription>
              Aplicar a "{pendente?.sub.label}" a partir de {MESES[mesSelecionado]}/{anoSelecionado}:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => aplicarLimiteMes("mes")}>Só este mês</Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 justify-start" onClick={() => aplicarLimiteMes("proximos")}>
                Este e os próximos
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={60}
                className="w-20"
                value={nMeses}
                onChange={(e) => setNMeses(Math.max(1, Number(e.target.value) || 1))}
                aria-label="Quantidade de meses"
              />
              <span className="self-center text-sm text-muted-foreground">meses</span>
            </div>
            <Button variant="outline" className="w-full justify-start" onClick={() => aplicarLimiteMes("padrao")}>Tornar padrão</Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
