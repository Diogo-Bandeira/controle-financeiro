import { useFinanceData, formatCurrency, MESES, CATEGORIAS, type Lancamento } from "@/lib/finance-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Pencil, Copy, CopyPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const catKeys = Object.keys(CATEGORIAS) as Lancamento["categoria"][];

const anoAtual = new Date().getFullYear();
const ANOS = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];

// ─── Subcategorias do cartão ──────────────────────────────────────────────────
const SUBCATEGORIAS: { valor: string; label: string; cor: string }[] = [
  { valor: "lazer",           label: "Lazer",           cor: "#8B5CF6" },
  { valor: "gasolina",        label: "Gasolina",        cor: "#F59E0B" },
  { valor: "alimentacao",     label: "Alimentação",     cor: "#10B981" },
  { valor: "gastos_pessoais", label: "Gastos Pessoais", cor: "#EC4899" },
  { valor: "saude",           label: "Saúde",           cor: "#3B82F6" },
  { valor: "assinaturas",     label: "Assinaturas",     cor: "#06B6D4" },
  { valor: "vestuario",       label: "Vestuário",       cor: "#EF4444" },
];

function getSubcategoria(valor: string | null | undefined) {
  return SUBCATEGORIAS.find((s) => s.valor === valor) ?? null;
}

// Bolinha colorida de subcategoria
function DotSubcategoria({ valor }: { valor: string | null | undefined }) {
  const sub = getSubcategoria(valor);
  if (!sub) return null;
  return (
    <span
      title={sub.label}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border"
      style={{
        backgroundColor: sub.cor + "18", // 10% de opacidade
        borderColor: sub.cor + "50",
        color: sub.cor,
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: sub.cor }}
      />
      {sub.label}
    </span>
  );
}

export default function Lancamentos() {
  const {
    mesSelecionado, setMesSelecionado,
    anoSelecionado, setAnoSelecionado,
    lancamentos, lancamentosMes, entradas, totalSaidas, saldo,
    addLancamento, updateLancamento, deleteLancamento, loading,
  } = useFinanceData();

  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Lancamento | null>(null);
  const [cat, setCat] = useState<Lancamento["categoria"]>("entrada");
  const [subcat, setSubcat] = useState<string>("");
  const [copiando, setCopiando] = useState(false);

  const abrirNovo = () => {
    setEditando(null);
    setCat("entrada");
    setSubcat("");
    setOpen(true);
  };

  const abrirEdicao = (l: Lancamento) => {
    setEditando(l);
    setCat(l.categoria);
    setSubcat(l.subcategoria ?? "");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const descricao = fd.get("descricao") as string;
    const valor = Number(fd.get("valor"));
    const subcategoria = cat === "cartao" && subcat ? subcat : null;

    if (editando) {
      await updateLancamento({ ...editando, descricao, valor, categoria: cat, subcategoria });
    } else {
      await addLancamento({ descricao, valor, categoria: cat, mes: mesSelecionado, ano: anoSelecionado, subcategoria });
    }
    setOpen(false);
    setEditando(null);
  };

  const copiarParaProximoMes = async (l: Lancamento) => {
    const proximoMes = l.mes === 11 ? 0 : l.mes + 1;
    const proximoAno = l.mes === 11 ? l.ano + 1 : l.ano;
    await addLancamento({
      descricao: l.descricao,
      valor: l.valor,
      categoria: l.categoria,
      subcategoria: l.subcategoria ?? null,
      mes: proximoMes,
      ano: proximoAno,
    });
    toast.success(`Copiado para ${MESES[proximoMes]}/${proximoAno}`);
  };

  const copiarDoMesAnterior = async () => {
    const mesAnterior = mesSelecionado === 0 ? 11 : mesSelecionado - 1;
    const anoAnterior = mesSelecionado === 0 ? anoSelecionado - 1 : anoSelecionado;
    const fonte = lancamentos.filter((l) => l.mes === mesAnterior && l.ano === anoAnterior);
    if (fonte.length === 0) {
      toast.error(`Nenhum lançamento em ${MESES[mesAnterior]}/${anoAnterior}`);
      return;
    }
    setCopiando(true);
    for (const l of fonte) {
      await addLancamento({
        descricao: l.descricao,
        valor: l.valor,
        categoria: l.categoria,
        subcategoria: l.subcategoria ?? null,
        mes: mesSelecionado,
        ano: anoSelecionado,
      });
    }
    setCopiando(false);
    toast.success(`${fonte.length} lançamento(s) copiado(s) de ${MESES[mesAnterior]}!`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Lançamentos Mensais</h2>
          <p className="text-muted-foreground text-sm">{MESES[mesSelecionado]} / {anoSelecionado}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={String(anoSelecionado)} onValueChange={(v) => setAnoSelecionado(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={String(mesSelecionado)} onValueChange={(v) => setMesSelecionado(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={copiarDoMesAnterior} disabled={copiando}>
            {copiando
              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
              : <CopyPlus className="h-4 w-4 mr-1" />}
            Copiar mês anterior
          </Button>

          {/* Modal novo/editar */}
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditando(null); }}>
            <DialogTrigger asChild>
              <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editando ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Descrição</Label>
                  <Input name="descricao" defaultValue={editando?.descricao} required />
                </div>
                <div>
                  <Label>Valor (R$)</Label>
                  <Input name="valor" type="number" step="0.01" defaultValue={editando?.valor} required />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={cat} onValueChange={(v) => { setCat(v as Lancamento["categoria"]); setSubcat(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {catKeys.map((k) => <SelectItem key={k} value={k}>{CATEGORIAS[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subcategoria — aparece só quando categoria é cartão */}
                {cat === "cartao" && (
                  <div>
                    <Label>Subcategoria <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
                    <Select value={subcat} onValueChange={setSubcat}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {SUBCATEGORIAS.map((s) => (
                          <SelectItem key={s.valor} value={s.valor}>
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                              {s.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button type="submit" className="w-full">
                  {editando ? "Salvar alterações" : "Adicionar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="finance-card text-center">
          <p className="stat-label">Entradas</p>
          <p className="text-lg font-bold text-success">{formatCurrency(entradas)}</p>
        </div>
        <div className="finance-card text-center">
          <p className="stat-label">Saídas</p>
          <p className="text-lg font-bold text-destructive">{formatCurrency(totalSaidas)}</p>
        </div>
        <div className="finance-card text-center">
          <p className="stat-label">Saldo</p>
          <p className={`text-lg font-bold ${saldo >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(saldo)}
          </p>
        </div>
      </div>

      {/* Tabs por categoria */}
      <Tabs defaultValue="entrada">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {catKeys.map((k) => (
            <TabsTrigger key={k} value={k} className="text-xs flex-1 min-w-[100px]">
              {CATEGORIAS[k]}
            </TabsTrigger>
          ))}
        </TabsList>

        {catKeys.map((k) => {
          const items = lancamentosMes.filter((l) => l.categoria === k);
          const total = items.reduce((s, l) => s + l.valor, 0);

          // Para cartão: agrupa por subcategoria para mostrar mini-resumo
          const subcatTotais = k === "cartao"
            ? SUBCATEGORIAS.map((s) => ({
                ...s,
                total: items
                  .filter((l) => l.subcategoria === s.valor)
                  .reduce((acc, l) => acc + l.valor, 0),
              })).filter((s) => s.total > 0)
            : [];

          return (
            <TabsContent key={k} value={k}>
              <div className="finance-card">
                <div className="flex justify-between mb-3">
                  <h3 className="font-semibold">{CATEGORIAS[k]}</h3>
                  <span className="font-bold">{formatCurrency(total)}</span>
                </div>

                {/* Mini-resumo por subcategoria (só na aba cartão) */}
                {k === "cartao" && subcatTotais.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b">
                    {subcatTotais.map((s) => (
                      <div
                        key={s.valor}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border"
                        style={{
                          backgroundColor: s.cor + "18",
                          borderColor: s.cor + "50",
                          color: s.cor,
                        }}
                      >
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.cor }} />
                        <span className="font-medium">{s.label}</span>
                        <span className="font-bold">{formatCurrency(s.total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {items.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum lançamento nesta categoria.</p>
                ) : (
                  <div className="divide-y">
                    {items.map((l) => (
                      <div key={l.id} className="flex items-center justify-between py-2.5 gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {/* Bolinha de subcategoria (só para cartão) */}
                          {k === "cartao" && <DotSubcategoria valor={l.subcategoria} />}
                          <span className="text-sm truncate">{l.descricao}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-medium text-sm">{formatCurrency(l.valor)}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(l)} title="Editar">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copiarParaProximoMes(l)} title="Copiar para o próximo mês">
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLancamento(l.id)} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}