import { useFinanceData, formatCurrency, type Prioridade, type NivelPrioridade } from "@/lib/finance-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MoneyInput } from "@/components/MoneyInput";
import { MesAnoField } from "@/components/CamposData";
import { CartaoChip, ChipCor, OpcaoCor, SubcategoriaChip } from "@/components/SubcategoriaChip";
import { EstadoVazio, PaginaCarregando } from "@/components/EstadoVazio";
import { LancamentoForm, type LancamentoSalvo } from "@/components/LancamentoForm";
import { ParcelamentoForm } from "@/components/ParcelamentoForm";
import { formatMesAno } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { avaliarEncaixe, type AvaliacaoEncaixe } from "@/lib/metas";
import { cn } from "@/lib/utils";
import { ExternalLink, GripVertical, Pencil, Plus, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

const NIVEIS: NivelPrioridade[] = ["alta", "media", "baixa"];
const prioridadeLabels: Record<NivelPrioridade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const prioridadeColors: Record<NivelPrioridade, string> = {
  alta: "bg-destructive/10 text-destructive border-destructive/20",
  media: "bg-warning/10 text-warning-foreground border-warning/20",
  baixa: "bg-muted text-muted-foreground border-border",
};
const encaixeInfo = {
  cabe: { label: "Cabe", classe: "bg-success/10 text-success border-success/30" },
  aperta: { label: "Aperta", classe: "bg-warning/15 text-warning-foreground border-warning/40" },
  nao_cabe: { label: "Não cabe", classe: "bg-destructive/10 text-destructive border-destructive/30" },
} as const;

const TODAS = "__todas__";
const SEM = "__nenhum__";

type FormPrioridade = Omit<Prioridade, "id" | "concluida" | "ordem" | "valorPago" | "lancamentoId" | "parcelamentoId">;

const formVazio = (): FormPrioridade => ({
  descricao: "", valor: 0, prioridade: "media", subcategoria: null, mesPlanejado: null, anoPlanejado: null,
  parcelasPrevistas: 1, cartaoId: null, link: null, observacao: null,
});

const normalizarLink = (s: string) => {
  const t = s.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

const ordenar = (a: Prioridade, b: Prioridade) => (a.ordem ?? Number.MAX_SAFE_INTEGER) - (b.ordem ?? Number.MAX_SAFE_INTEGER);

export default function Prioridades() {
  const {
    prioridades, addPrioridade, updatePrioridade, deletePrioridade, reordenarPrioridades, loading,
    subcategoriasAtivas, cartoes, getSubcategoria, limiteEfetivo, lancamentosDoMes,
  } = useFinanceData();

  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Prioridade | null>(null);
  const [form, setForm] = useState<FormPrioridade>(formVazio);
  const [planejar, setPlanejar] = useState(false);
  const [filtroSub, setFiltroSub] = useState(TODAS);
  const [filtroNivel, setFiltroNivel] = useState(TODAS);
  const [excluir, setExcluir] = useState<Prioridade | null>(null);
  const [comprando, setComprando] = useState<Prioridade | null>(null);
  const [arrastando, setArrastando] = useState<Prioridade | null>(null);

  const inicialLancamento = useMemo(() => comprando ? {
    descricao: comprando.descricao,
    valor: comprando.valor,
    subcategoria: comprando.subcategoria,
    categoria: comprando.cartaoId ? ("cartao" as const) : ("variavel" as const),
    cartaoId: comprando.cartaoId,
  } : undefined, [comprando]);
  const inicialParcelamento = useMemo(() => comprando ? {
    descricao: comprando.descricao,
    valorTotal: comprando.valor,
    nParcelas: comprando.parcelasPrevistas,
    cartaoId: comprando.cartaoId,
    subcategoria: comprando.subcategoria,
  } : undefined, [comprando]);

  const set = <K extends keyof FormPrioridade>(k: K, v: FormPrioridade[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrirNovo = () => {
    const hoje = new Date();
    setEditando(null);
    setForm({ ...formVazio(), mesPlanejado: hoje.getMonth(), anoPlanejado: hoje.getFullYear() });
    setPlanejar(false);
    setOpen(true);
  };

  const abrirEdicao = (p: Prioridade) => {
    const hoje = new Date();
    setEditando(p);
    setForm({ ...p, mesPlanejado: p.mesPlanejado ?? hoje.getMonth(), anoPlanejado: p.anoPlanejado ?? hoje.getFullYear() });
    setPlanejar(p.mesPlanejado != null);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dados: FormPrioridade = {
      ...form,
      descricao: form.descricao.trim(),
      mesPlanejado: planejar ? form.mesPlanejado : null,
      anoPlanejado: planejar ? form.anoPlanejado : null,
      parcelasPrevistas: Math.max(1, form.parcelasPrevistas),
      link: normalizarLink(form.link ?? ""),
      observacao: form.observacao?.trim() || null,
    };
    const ok = editando
      ? await updatePrioridade({ ...editando, ...dados })
      : await addPrioridade({
          ...dados, concluida: false, valorPago: null, lancamentoId: null, parcelamentoId: null,
          ordem: Math.max(0, ...prioridades.filter((p) => p.prioridade === dados.prioridade).map((p) => p.ordem ?? 0)) + 1,
        });
    if (!ok) return;
    setOpen(false);
    setEditando(null);
  };

  // Encaixe no orçamento do mês planejado (inclui parcelas já geradas em lançamentos)
  const avaliar = (p: Prioridade): (AvaliacaoEncaixe & { limite: number; comprometido: number }) | null => {
    if (!p.subcategoria || p.mesPlanejado == null || p.anoPlanejado == null) return null;
    const limite = limiteEfetivo(p.subcategoria, p.anoPlanejado, p.mesPlanejado);
    const comprometido = sumMoney(
      lancamentosDoMes(p.anoPlanejado, p.mesPlanejado)
        .filter((l) => l.categoria !== "entrada" && l.subcategoria === p.subcategoria)
        .map((l) => l.valor),
    );
    return { ...avaliarEncaixe(p.valor, p.parcelasPrevistas, limite, comprometido), limite, comprometido };
  };

  const registrarCompra = async (p: Prioridade, r: LancamentoSalvo) => {
    const valorPago = r.parcelamento?.valorTotal ?? r.lancamento?.valor ?? p.valor;
    await updatePrioridade({
      ...p, concluida: true, valorPago, lancamentoId: r.lancamento?.id ?? null, parcelamentoId: r.parcelamento?.id ?? null,
    });
    setComprando(null);
  };

  const soltar = (alvo: Prioridade) => {
    if (!arrastando || arrastando.id === alvo.id || arrastando.prioridade !== alvo.prioridade) return;
    const nivel = prioridades.filter((p) => p.prioridade === alvo.prioridade && !p.concluida).sort(ordenar).filter((p) => p.id !== arrastando.id);
    const idx = nivel.findIndex((p) => p.id === alvo.id);
    reordenarPrioridades([...nivel.slice(0, idx), arrastando, ...nivel.slice(idx)]);
    setArrastando(null);
  };

  if (loading) return <PaginaCarregando cards={3} />;

  const pendentes = prioridades.filter((p) => !p.concluida);
  const filtra = (p: Prioridade) =>
    (filtroSub === TODAS || (p.subcategoria ?? SEM) === filtroSub) && (filtroNivel === TODAS || p.prioridade === filtroNivel);
  const visiveis = prioridades.filter(filtra);
  const totalPendente = sumMoney(pendentes.map((p) => p.valor));
  const totalPorNivel = NIVEIS.map((n) => ({ n, total: sumMoney(pendentes.filter((p) => p.prioridade === n).map((p) => p.valor)) }))
    .filter((x) => x.total > 0);
  const totalPorSub = [...new Set(pendentes.map((p) => p.subcategoria ?? SEM))]
    .map((slug) => ({ slug, total: sumMoney(pendentes.filter((p) => (p.subcategoria ?? SEM) === slug).map((p) => p.valor)) }))
    .sort((a, b) => b.total - a.total);
  const concluidas = visiveis.filter((p) => p.concluida);

  const renderItem = (p: Prioridade) => {
    const aval = p.concluida ? null : avaliar(p);
    const sub = getSubcategoria(p.subcategoria);
    const podeArrastar = !p.concluida && filtroSub === TODAS;
    return (
      <div
        key={p.id}
        draggable={podeArrastar}
        onDragStart={() => setArrastando(p)}
        onDragEnd={() => setArrastando(null)}
        onDragOver={(e) => { if (arrastando && arrastando.prioridade === p.prioridade && !p.concluida) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); soltar(p); }}
        className={cn(
          "finance-card !p-3 flex items-start gap-3",
          p.concluida && "opacity-60",
          arrastando?.id === p.id && "opacity-40",
        )}
      >
        {podeArrastar ? (
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-1 cursor-grab" aria-label="Arrastar para reordenar" />
        ) : (
          <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={cn("font-medium text-sm", p.concluida && "line-through")}>{p.descricao}</p>
            {p.link && (
              <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5 text-xs">
                <ExternalLink className="h-3 w-3" /> link
              </a>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{formatCurrency(p.valor)}</span>
            {p.parcelasPrevistas > 1 && <span>em {p.parcelasPrevistas}× de {formatCurrency(p.valor / p.parcelasPrevistas)}</span>}
            {p.mesPlanejado != null && p.anoPlanejado != null && <span>· {formatMesAno(p.mesPlanejado, p.anoPlanejado)}</span>}
            <SubcategoriaChip slug={p.subcategoria} />
            <CartaoChip cartaoId={p.cartaoId} />
            {p.concluida && p.valorPago != null && <span>· pago {formatCurrency(p.valorPago)}</span>}
          </div>
          {p.observacao && <p className="text-xs text-muted-foreground">{p.observacao}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {aval && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={cn("cursor-help", encaixeInfo[aval.status].classe)}>{encaixeInfo[aval.status].label}</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {sub?.label} {formatMesAno(p.mesPlanejado, p.anoPlanejado)}: limite {formatCurrency(aval.limite)}, já comprometido{" "}
                {formatCurrency(aval.comprometido)}, impacto {formatCurrency(aval.impacto)} → {encaixeInfo[aval.status].label.toLowerCase()}
              </TooltipContent>
            </Tooltip>
          )}
          <Badge variant="outline" className={prioridadeColors[p.prioridade]}>{prioridadeLabels[p.prioridade]}</Badge>
          {!p.concluida && (
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setComprando(p)}>
              <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Comprei
            </Button>
          )}
          <Checkbox
            checked={p.concluida}
            onCheckedChange={() => updatePrioridade({ ...p, concluida: !p.concluida })}
            aria-label="Concluída"
            className="mx-1"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(p)} aria-label="Editar">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExcluir(p)} aria-label="Excluir">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Prioridades de Compra</h2>
          <p className="text-muted-foreground text-sm">Total pendente: {formatCurrency(totalPendente)}</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
      </div>

      {pendentes.length > 0 && (
        <div className="finance-card space-y-3">
          <div className="flex flex-wrap gap-2">
            {totalPorNivel.map(({ n, total }) => (
              <Badge key={n} variant="outline" className={cn("text-xs", prioridadeColors[n])}>
                {prioridadeLabels[n]}: {formatCurrency(total)}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {totalPorSub.map(({ slug, total }) => {
              const sub = getSubcategoria(slug);
              const texto = formatCurrency(total);
              return sub ? (
                <ChipCor key={slug} cor={sub.cor} label={sub.label}><span className="font-bold">{texto}</span></ChipCor>
              ) : (
                <ChipCor key={slug} cor="#64748B" label="Sem subcategoria"><span className="font-bold">{texto}</span></ChipCor>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Select value={filtroNivel} onValueChange={setFiltroNivel}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas prioridades</SelectItem>
            {NIVEIS.map((n) => <SelectItem key={n} value={n}>{prioridadeLabels[n]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroSub} onValueChange={setFiltroSub}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas subcategorias</SelectItem>
            <SelectItem value={SEM}>Sem subcategoria</SelectItem>
            {subcategoriasAtivas.map((s) => <SelectItem key={s.slug} value={s.slug}><OpcaoCor cor={s.cor} label={s.label} /></SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {prioridades.length === 0 ? (
        <div className="finance-card">
          <EstadoVazio
            icone={ShoppingBag}
            titulo="Nenhuma prioridade cadastrada"
            descricao="Liste o que pretende comprar e veja se cabe no orçamento do mês planejado."
            acao={<Button size="sm" onClick={abrirNovo}><Plus className="h-4 w-4 mr-1" /> Cadastrar prioridade</Button>}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {NIVEIS.map((n) => {
            const itens = visiveis.filter((p) => p.prioridade === n && !p.concluida).sort(ordenar);
            if (itens.length === 0) return null;
            return (
              <section key={n} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">Prioridade {prioridadeLabels[n].toLowerCase()}</h3>
                {itens.map(renderItem)}
              </section>
            );
          })}
          {concluidas.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Concluídas</h3>
              {concluidas.map(renderItem)}
            </section>
          )}
          {visiveis.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma prioridade com esses filtros.</p>}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditando(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editando ? "Editar prioridade" : "Nova prioridade"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor estimado</Label><MoneyInput value={form.valor} onChange={(v) => set("valor", v)} /></div>
              <div>
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => set("prioridade", v as NivelPrioridade)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{NIVEIS.map((n) => <SelectItem key={n} value={n}>{prioridadeLabels[n]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Subcategoria</Label>
              <Select value={form.subcategoria ?? SEM} onValueChange={(v) => set("subcategoria", v === SEM ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>—</SelectItem>
                  {subcategoriasAtivas.map((s) => <SelectItem key={s.slug} value={s.slug}><OpcaoCor cor={s.cor} label={s.label} /></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={planejar} onCheckedChange={(v) => setPlanejar(v === true)} /> Planejar para um mês
              </label>
              {planejar && (
                <MesAnoField
                  value={{ mes: form.mesPlanejado ?? 0, ano: form.anoPlanejado ?? new Date().getFullYear() }}
                  onChange={(m) => setForm((f) => ({ ...f, mesPlanejado: m.mes, anoPlanejado: m.ano }))}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Forma prevista</Label>
                <Select
                  value={form.parcelasPrevistas > 1 ? "parcelado" : "vista"}
                  onValueChange={(v) => set("parcelasPrevistas", v === "parcelado" ? Math.max(2, form.parcelasPrevistas) : 1)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vista">À vista</SelectItem>
                    <SelectItem value="parcelado">Parcelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.parcelasPrevistas > 1 && (
                <div>
                  <Label>Nº de parcelas</Label>
                  <Input
                    type="number" inputMode="numeric" min={2} max={72} value={form.parcelasPrevistas}
                    onChange={(e) => set("parcelasPrevistas", Math.max(2, Number(e.target.value) || 2))}
                  />
                </div>
              )}
            </div>
            <div>
              <Label>Cartão {form.parcelasPrevistas > 1 ? "" : "(opcional)"}</Label>
              <Select value={form.cartaoId ?? SEM} onValueChange={(v) => set("cartaoId", v === SEM ? null : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>—</SelectItem>
                  {cartoes.filter((c) => c.ativo || c.id === form.cartaoId).map((c) => (
                    <SelectItem key={c.id} value={c.id}><OpcaoCor cor={c.cor ?? "#64748B"} label={c.nome} /></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Link do produto</Label><Input value={form.link ?? ""} onChange={(e) => set("link", e.target.value)} placeholder="https://..." /></div>
            <div><Label>Observação</Label><Textarea rows={2} value={form.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} /></div>
            <Button type="submit" className="w-full">{editando ? "Salvar alterações" : "Adicionar"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(v) => !v && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir prioridade?</AlertDialogTitle>
            <AlertDialogDescription>"{excluir?.descricao}" será removida. Lançamentos já criados pelo "Comprei" continuam.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (excluir) deletePrioridade(excluir.id); setExcluir(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LancamentoForm
        open={!!comprando && comprando.parcelasPrevistas <= 1}
        onOpenChange={(v) => !v && setComprando(null)}
        inicial={inicialLancamento}
        onSalvo={(r) => comprando && registrarCompra(comprando, r)}
      />

      <ParcelamentoForm
        open={!!comprando && comprando.parcelasPrevistas > 1}
        onOpenChange={(v) => !v && setComprando(null)}
        inicial={inicialParcelamento}
        onSalvo={(parcelamento) => comprando && registrarCompra(comprando, { parcelamento })}
      />
    </div>
  );
}
