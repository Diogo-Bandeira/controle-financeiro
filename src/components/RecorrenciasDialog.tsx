import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/MoneyInput";
import { MesAnoField } from "@/components/CamposData";
import { CartaoChip, OpcaoCor, SubcategoriaChip } from "@/components/SubcategoriaChip";
import { EstadoVazio } from "@/components/EstadoVazio";
import { CATEGORIAS, formatCurrency, useFinanceData, type Categoria, type Lancamento, type Recorrencia } from "@/lib/finance-store";
import { formatMesAno } from "@/lib/format";
import { parseISODate, toISODate, type MesAno } from "@/lib/fatura";
import { MESES_RECORRENCIA, futurosDaRecorrencia, futurosForaDaVigencia, pendentesDaRecorrenciaApos, propagarEdicao } from "@/lib/recorrencias";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RecorrenciasDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** "Tornar recorrente": abre direto o formulário pré-preenchido a partir do lançamento. */
  aPartirDe?: Lancamento | null;
}

type DadosRecorrencia = Omit<Recorrencia, "id">;

const SEM = "__nenhum__";
const catKeys = Object.keys(CATEGORIAS) as Categoria[];

const normalizar = (f: DadosRecorrencia): DadosRecorrencia => ({
  ...f,
  descricao: f.descricao.trim(),
  subcategoria: f.categoria === "entrada" ? null : f.subcategoria,
  cartaoId: f.categoria === "cartao" ? f.cartaoId : null,
  reembolso: f.categoria === "entrada" && f.reembolso,
});

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function novaRecorrencia(l: Lancamento | null | undefined, hoje: Date): DadosRecorrencia {
  const data = l ? parseISODate(l.data) : hoje;
  return {
    descricao: l?.descricao ?? "",
    valor: l?.valor ?? 0,
    categoria: l?.categoria ?? "conta_fixa",
    subcategoria: l?.subcategoria ?? null,
    cartaoId: l?.cartaoId ?? null,
    dia: data.getDate(),
    inicioAno: data.getFullYear(),
    inicioMes: data.getMonth(),
    fimAno: null,
    fimMes: null,
    reembolso: l?.reembolso ?? false,
    responsavel: l?.responsavel ?? null,
    ativo: true,
  };
}

export function RecorrenciasDialog({ open, onOpenChange, aPartirDe }: RecorrenciasDialogProps) {
  const {
    recorrencias, lancamentos, cartoes, subcategoriasAtivas, membros, lancamentoPago, addRecorrencia, salvarRecorrencia, excluirRecorrencia,
  } = useFinanceData();
  const [editando, setEditando] = useState<Recorrencia | null>(null);
  const [form, setForm] = useState<DadosRecorrencia | null>(null);
  const [excluir, setExcluir] = useState<Recorrencia | null>(null);
  const [salvando, setSalvando] = useState(false);
  // "Remover os lançamentos futuros já gerados?" (pausa/fim na edição e exclusão). Padrão: sim.
  const [removerFuturos, setRemoverFuturos] = useState(true);

  useEffect(() => {
    if (!open) return;
    setEditando(null);
    setForm(aPartirDe ? novaRecorrencia(aPartirDe, new Date()) : null);
  }, [open, aPartirDe]);

  // Efeito da edição nos lançamentos futuros já gerados (data > hoje).
  const impacto = useMemo(() => {
    if (!editando || !form) return null;
    const hoje = new Date();
    const nova = { ...normalizar(form), id: editando.id };
    return {
      nova,
      futuros: futurosDaRecorrencia(editando.id, lancamentos, hoje).length,
      atualizar: propagarEdicao(editando, nova, lancamentos, hoje, cartoes),
      apagar: futurosForaDaVigencia(nova, lancamentos, hoje, lancamentoPago),
    };
  }, [editando, form, lancamentos, cartoes, lancamentoPago]);

  const pendentesExcluir = useMemo(
    () => (excluir ? pendentesDaRecorrenciaApos(excluir.id, lancamentos, toISODate(new Date()), lancamentoPago) : []),
    [excluir, lancamentos, lancamentoPago],
  );

  const set = <K extends keyof DadosRecorrencia>(k: K, v: DadosRecorrencia[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const abrirEdicao = (r: Recorrencia) => {
    setEditando(r);
    setForm({ ...r });
    setRemoverFuturos(true);
  };

  const pedirExclusao = (r: Recorrencia) => {
    setExcluir(r);
    setRemoverFuturos(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (form.valor <= 0) { toast.error("Informe o valor"); return; }
    if (form.categoria !== "entrada" && !form.subcategoria) { toast.error("Selecione a subcategoria"); return; }
    if (form.categoria === "cartao" && !form.cartaoId) { toast.error("Selecione o cartão"); return; }
    setSalvando(true);
    const ok = impacto ? await salvarEdicao(impacto) : !!(await addRecorrencia(normalizar(form)));
    setSalvando(false);
    if (!ok) return;
    if (!impacto) toast.success("Recorrência criada");
    setForm(null);
    setEditando(null);
  };

  const salvarEdicao = async ({ nova, atualizar, apagar }: NonNullable<typeof impacto>) => {
    const apagarIds = removerFuturos ? apagar.map((l) => l.id) : [];
    const ok = await salvarRecorrencia(nova, atualizar.filter((l) => !apagarIds.includes(l.id)), apagarIds);
    if (!ok) return false;
    const detalhes = [
      atualizar.length > 0 && plural(atualizar.length, "futuro atualizado", "futuros atualizados"),
      apagarIds.length > 0 && plural(apagarIds.length, "futuro removido", "futuros removidos"),
    ].filter(Boolean);
    toast.success(detalhes.length ? `Recorrência atualizada (${detalhes.join(", ")})` : "Recorrência atualizada");
    return true;
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    const apagarIds = removerFuturos ? pendentesExcluir.map((l) => l.id) : [];
    if (await excluirRecorrencia(excluir.id, apagarIds)) {
      toast.success(
        apagarIds.length
          ? `Recorrência excluída e ${plural(apagarIds.length, "lançamento futuro removido", "lançamentos futuros removidos")}`
          : "Recorrência excluída (lançamentos já gerados foram mantidos)",
      );
    }
    setExcluir(null);
  };

  const fim: MesAno | null = form && form.fimAno != null && form.fimMes != null ? { mes: form.fimMes, ano: form.fimAno } : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form ? (editando ? "Editar recorrência" : "Nova recorrência") : "Lançamentos recorrentes"}</DialogTitle>
            {!form && (
              <DialogDescription>
                Lançadas automaticamente no mês atual e nos {MESES_RECORRENCIA - 1} seguintes, sem duplicar.
              </DialogDescription>
            )}
          </DialogHeader>

          {form ? (
            <form onSubmit={salvar} className="space-y-4">
              <div>
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor</Label>
                  <MoneyInput value={form.valor} onChange={(v) => set("valor", v)} />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.categoria} onValueChange={(v) => set("categoria", v as Categoria)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {catKeys.map((k) => <SelectItem key={k} value={k}>{CATEGORIAS[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.categoria !== "entrada" && (
                <div>
                  <Label>Subcategoria</Label>
                  <Select value={form.subcategoria ?? ""} onValueChange={(v) => set("subcategoria", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {subcategoriasAtivas.map((s) => (
                        <SelectItem key={s.slug} value={s.slug}><OpcaoCor cor={s.cor} label={s.label} /></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.categoria === "cartao" && (
                <div>
                  <Label>Cartão</Label>
                  <Select value={form.cartaoId ?? ""} onValueChange={(v) => set("cartaoId", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {cartoes.filter((c) => c.ativo || c.id === form.cartaoId).map((c) => (
                        <SelectItem key={c.id} value={c.id}><OpcaoCor cor={c.cor ?? "#64748B"} label={c.nome} /></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.categoria === "entrada" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.reembolso} onCheckedChange={(v) => set("reembolso", v === true)} />
                  É reembolso
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{form.categoria === "conta_fixa" ? "Dia do vencimento" : "Dia do mês"}</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    value={form.dia}
                    onChange={(e) => set("dia", Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Select value={form.responsavel ?? SEM} onValueChange={(v) => set("responsavel", v === SEM ? null : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM}>—</SelectItem>
                      {membros.map((m) => <SelectItem key={m.userId} value={m.nome}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Início</Label>
                <MesAnoField
                  value={{ mes: form.inicioMes, ano: form.inicioAno }}
                  onChange={(v) => setForm((f) => (f ? { ...f, inicioMes: v.mes, inicioAno: v.ano } : f))}
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!fim}
                    onCheckedChange={(v) =>
                      setForm((f) => (f ? { ...f, fimMes: v === true ? f.inicioMes : null, fimAno: v === true ? f.inicioAno + 1 : null } : f))
                    }
                  />
                  Tem data de término
                </label>
                {fim && (
                  <MesAnoField value={fim} onChange={(v) => setForm((f) => (f ? { ...f, fimMes: v.mes, fimAno: v.ano } : f))} />
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="rec-ativo">Ativa</Label>
                <Switch id="rec-ativo" checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
              </div>

              <p className="text-xs text-muted-foreground">Será lançada automaticamente nos próximos {MESES_RECORRENCIA} meses.</p>

              {impacto && impacto.futuros > 0 && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
                  <p>
                    {plural(impacto.futuros, "lançamento futuro já gerado", "lançamentos futuros já gerados")}:{" "}
                    {impacto.atualizar.length > 0
                      ? `${plural(impacto.atualizar.length, "será atualizado", "serão atualizados")} ao salvar.`
                      : "nenhum muda com esta edição."}
                  </p>
                  <p className="text-muted-foreground">Os editados individualmente (valor ou descrição diferentes) não mudam.</p>
                  {impacto.apagar.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <Checkbox checked={removerFuturos} onCheckedChange={(v) => setRemoverFuturos(v === true)} />
                      Remover os lançamentos futuros já gerados? ({plural(impacto.apagar.length, "pendente fora da vigência", "pendentes fora da vigência")})
                    </label>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setForm(null); setEditando(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button type="submit" className="flex-1" disabled={salvando}>
                  {editando ? "Salvar alterações" : "Criar recorrência"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <Button className="w-full" onClick={() => setForm(novaRecorrencia(null, new Date()))}>
                <Plus className="h-4 w-4 mr-1" /> Nova recorrência
              </Button>
              {recorrencias.length === 0 ? (
                <EstadoVazio icone={Repeat} titulo="Nenhuma recorrência" descricao="Cadastre contas fixas, salário e assinaturas para gerar os lançamentos todo mês." />
              ) : (
                <div className="divide-y">
                  {recorrencias.map((r) => (
                    <div key={r.id} className={cn("py-2.5 flex items-center gap-2", !r.ativo && "opacity-50")}>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium truncate">{r.descricao}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{CATEGORIAS[r.categoria]} · dia {r.dia}</span>
                          <SubcategoriaChip slug={r.subcategoria} />
                          <CartaoChip cartaoId={r.cartaoId} />
                          <span>
                            desde {formatMesAno(r.inicioMes, r.inicioAno)}
                            {r.fimAno != null && r.fimMes != null && ` até ${formatMesAno(r.fimMes, r.fimAno)}`}
                          </span>
                          {!r.ativo && <span>(inativa)</span>}
                        </div>
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap">{formatCurrency(r.valor)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(r)} title="Editar">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => pedirExclusao(r)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(v) => !v && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              "{excluir?.descricao}" deixa de gerar lançamentos. Os já gerados que ficarem continuam, sem vínculo com a recorrência.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendentesExcluir.length > 0 && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={removerFuturos} onCheckedChange={(v) => setRemoverFuturos(v === true)} />
              Remover os lançamentos futuros já gerados? ({plural(pendentesExcluir.length, "pendente", "pendentes")})
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
