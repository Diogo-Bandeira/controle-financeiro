import { useFinanceData, formatCurrency, MESES, CATEGORIAS, type Lancamento } from "@/lib/finance-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Pencil, Copy, CopyPlus, CreditCard } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const catKeys = Object.keys(CATEGORIAS) as Lancamento["categoria"][];
const anoAtual = new Date().getFullYear();
const ANOS = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];

const SUBCATEGORIAS: { valor: string; label: string; cor: string }[] = [
  { valor: "lazer",           label: "Lazer",           cor: "#8B5CF6" },
  { valor: "gasolina",        label: "Gasolina",        cor: "#F59E0B" },
  { valor: "alimentacao",     label: "Alimentação",     cor: "#10B981" },
  { valor: "gastos_pessoais", label: "Gastos Pessoais", cor: "#EC4899" },
  { valor: "saude",           label: "Saúde",           cor: "#3B82F6" },
  { valor: "assinaturas",     label: "Assinaturas",     cor: "#06B6D4" },
  { valor: "vestuario",       label: "Vestuário",       cor: "#efe144" },
  { valor: "besteiras",       label: "Besteiras",       cor: "#EF4444" },
];

function getSubcategoria(valor: string | null | undefined) {
  return SUBCATEGORIAS.find((s) => s.valor === valor) ?? null;
}

function DotSubcategoria({ valor }: { valor: string | null | undefined }) {
  const sub = getSubcategoria(valor);
  if (!sub) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-muted/30">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sub.cor }} />
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
  const [cartaoNome, setCartaoNome] = useState<string>(""); // Novo estado para o input livre
  const [copiando, setCopiando] = useState(false);

  const abrirNovo = () => {
    setEditando(null);
    setCat("entrada");
    setSubcat("");
    setCartaoNome("");
    setOpen(true);
  };

  const abrirEdicao = (l: Lancamento) => {
    setEditando(l);
    setCat(l.categoria);
    setSubcat(l.subcategoria ?? "");
    setCartaoNome(l.cartao_nome ?? "");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const descricao = fd.get("descricao") as string;
    const valor = Number(fd.get("valor"));
    const subcategoria = cat === "cartao" && subcat ? subcat : null;
    const cartao_nome = cat === "cartao" && cartaoNome ? cartaoNome.trim() : null;

    if (editando) {
      await updateLancamento({ ...editando, descricao, valor, categoria: cat, subcategoria, cartao_nome });
    } else {
      await addLancamento({ descricao, valor, categoria: cat, mes: mesSelecionado, ano: anoSelecionado, subcategoria, cartao_nome });
    }
    setOpen(false);
    setEditando(null);
  };

  // Cálculo dos totais por cartão (Agrupamento Dinâmico)
  const totaisPorCartao = useMemo(() => {
    const comprasNoCartao = lancamentosMes.filter(l => l.categoria === "cartao");
    const mapa = new Map<string, number>();

    comprasNoCartao.forEach(l => {
      const nome = l.cartao_nome || "Sem Identificação";
      const totalAtual = mapa.get(nome) || 0;
      mapa.set(nome, totalAtual + l.valor);
    });

    return Array.from(mapa.entries()).map(([nome, total]) => ({ nome, total }));
  }, [lancamentosMes]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Cabeçalho igual ao anterior... */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Lançamentos Mensais</h2>
          <p className="text-muted-foreground text-sm">{MESES[mesSelecionado]} / {anoSelecionado}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={String(anoSelecionado)} onValueChange={(v) => setAnoSelecionado(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(mesSelecionado)} onValueChange={(v) => setMesSelecionado(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
          </Select>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditando(null); }}>
            <DialogTrigger asChild>
              <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editando ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><Label>Descrição</Label><Input name="descricao" defaultValue={editando?.descricao} required /></div>
                <div><Label>Valor (R$)</Label><Input name="valor" type="number" step="0.01" defaultValue={editando?.valor} required /></div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={cat} onValueChange={(v) => { setCat(v as Lancamento["categoria"]); setSubcat(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{catKeys.map((k) => <SelectItem key={k} value={k}>{CATEGORIAS[k]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {cat === "cartao" && (
                  <>
                    <div>
                      <Label>Tipo de Gasto</Label>
                      <Select value={subcat} onValueChange={setSubcat}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {SUBCATEGORIAS.map((s) => (
                            <SelectItem key={s.valor} value={s.valor}>
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
                                {s.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Nome do Cartão (Ex: Itau, Nubank)</Label>
                      <Input 
                        placeholder="Escreva o nome do cartão..." 
                        value={cartaoNome} 
                        onChange={(e) => setCartaoNome(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <Button type="submit" className="w-full">{editando ? "Salvar" : "Adicionar"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="entrada">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          {catKeys.map((k) => <TabsTrigger key={k} value={k} className="text-xs flex-1 min-w-[100px]">{CATEGORIAS[k]}</TabsTrigger>)}
        </TabsList>

        {catKeys.map((k) => {
          const items = lancamentosMes.filter((l) => l.categoria === k);
          const total = items.reduce((s, l) => s + l.valor, 0);

          return (
            <TabsContent key={k} value={k}>
              <div className="finance-card">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">{CATEGORIAS[k]}</h3>
                  <span className="text-lg font-bold">{formatCurrency(total)}</span>
                </div>

                {/* RESUMO DOS CARTÕES - Aparece apenas na aba de Cartão */}
                {k === "cartao" && totaisPorCartao.length > 0 && (
                  <div className="bg-muted/20 p-4 rounded-xl border border-dashed mb-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                      <CreditCard className="h-3 w-3" /> Gastos por Cartão
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {totaisPorCartao.map((c) => (
                        <div key={c.nome} className="bg-background px-3 py-2 rounded-lg border shadow-sm">
                          <p className="text-[10px] text-muted-foreground font-medium">{c.nome}</p>
                          <p className="text-sm font-bold text-primary">{formatCurrency(c.total)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {items.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">Nenhum lançamento registrado.</p>
                ) : (
                  <div className="divide-y">
                    {items.map((l) => (
                      <div key={l.id} className="flex items-center justify-between py-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{l.descricao}</span>
                            {k === "cartao" && l.cartao_nome && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold uppercase">
                                {l.cartao_nome}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {k === "cartao" && <DotSubcategoria valor={l.subcategoria} />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-sm mr-2">{formatCurrency(l.valor)}</span>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicao(l)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLancamento(l.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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