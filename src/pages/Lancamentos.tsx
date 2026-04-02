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
  const [copiando, setCopiando] = useState(false);

  // Abre o modal para NOVO lançamento
  const abrirNovo = () => {
    setEditando(null);
    setCat("entrada");
    setOpen(true);
  };

  // Abre o modal para EDITAR um lançamento existente
  const abrirEdicao = (l: Lancamento) => {
    setEditando(l);
    setCat(l.categoria);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const descricao = fd.get("descricao") as string;
    const valor = Number(fd.get("valor"));

    if (editando) {
      // Modo edição: atualiza o lançamento existente
      await updateLancamento({ ...editando, descricao, valor, categoria: cat });
    } else {
      // Modo criação: adiciona novo lançamento
      await addLancamento({ descricao, valor, categoria: cat, mes: mesSelecionado, ano: anoSelecionado });
    }
    setOpen(false);
    setEditando(null);
  };

  // Copia UM lançamento para o próximo mês (ou próximo ano se for dezembro)
  const copiarParaProximoMes = async (l: Lancamento) => {
    const proximoMes = l.mes === 11 ? 0 : l.mes + 1;
    const proximoAno = l.mes === 11 ? l.ano + 1 : l.ano;
    await addLancamento({
      descricao: l.descricao,
      valor: l.valor,
      categoria: l.categoria,
      mes: proximoMes,
      ano: proximoAno,
    });
    toast.success(`Copiado para ${MESES[proximoMes]}/${proximoAno}`);
  };

  // Copia TODOS os lançamentos do mês anterior para o mês atual selecionado
  const copiarDoMesAnterior = async () => {
    const mesAnterior = mesSelecionado === 0 ? 11 : mesSelecionado - 1;
    const anoAnterior = mesSelecionado === 0 ? anoSelecionado - 1 : anoSelecionado;

    const lancamentosMesAnterior = lancamentos.filter(
      (l) => l.mes === mesAnterior && l.ano === anoAnterior
    );

    if (lancamentosMesAnterior.length === 0) {
      toast.error(`Nenhum lançamento em ${MESES[mesAnterior]}/${anoAnterior}`);
      return;
    }

    setCopiando(true);
    let copiados = 0;
    for (const l of lancamentosMesAnterior) {
      await addLancamento({
        descricao: l.descricao,
        valor: l.valor,
        categoria: l.categoria,
        mes: mesSelecionado,
        ano: anoSelecionado,
      });
      copiados++;
    }
    setCopiando(false);
    toast.success(`${copiados} lançamento(s) copiado(s) de ${MESES[mesAnterior]}!`);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">Lançamentos Mensais</h2>
          <p className="text-muted-foreground text-sm">{MESES[mesSelecionado]} / {anoSelecionado}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Seletor de Ano */}
          <Select value={String(anoSelecionado)} onValueChange={(v) => setAnoSelecionado(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Seletor de Mês */}
          <Select value={String(mesSelecionado)} onValueChange={(v) => setMesSelecionado(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Botão: copiar tudo do mês anterior */}
          <Button variant="outline" onClick={copiarDoMesAnterior} disabled={copiando}>
            {copiando
              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
              : <CopyPlus className="h-4 w-4 mr-1" />}
            Copiar mês anterior
          </Button>

          {/* Botão: novo lançamento */}
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
                  <Select value={cat} onValueChange={(v) => setCat(v as Lancamento["categoria"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {catKeys.map((k) => <SelectItem key={k} value={k}>{CATEGORIAS[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
          return (
            <TabsContent key={k} value={k}>
              <div className="finance-card">
                <div className="flex justify-between mb-3">
                  <h3 className="font-semibold">{CATEGORIAS[k]}</h3>
                  <span className="font-bold">{formatCurrency(total)}</span>
                </div>
                {items.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum lançamento nesta categoria.</p>
                ) : (
                  <div className="divide-y">
                    {items.map((l) => (
                      <div key={l.id} className="flex items-center justify-between py-2.5 gap-2">
                        <span className="text-sm flex-1 truncate">{l.descricao}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-medium text-sm">{formatCurrency(l.valor)}</span>

                          {/* Botão editar */}
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => abrirEdicao(l)}
                            title="Editar lançamento"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>

                          {/* Botão copiar para próximo mês */}
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => copiarParaProximoMes(l)}
                            title="Copiar para o próximo mês"
                          >
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>

                          {/* Botão deletar */}
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => deleteLancamento(l.id)}
                            title="Excluir lançamento"
                          >
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