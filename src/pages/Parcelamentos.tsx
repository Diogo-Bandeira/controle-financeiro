import { useFinanceData, formatCurrency, type Parcelamento } from "@/lib/finance-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";

export default function Parcelamentos() {
  const { parcelamentos, addParcelamento, updateParcelamento, deleteParcelamento, loading } = useFinanceData();
  const [open, setOpen] = useState(false);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parcelas = Number(fd.get("parcelas"));
    const valorTotal = Number(fd.get("valorTotal"));
    await addParcelamento({
      descricao: fd.get("descricao") as string,
      valorTotal,
      parcelas,
      parcelasPagas: Number(fd.get("parcelasPagas")),
      valorParcela: valorTotal / parcelas,
    });
    setOpen(false);
  };

  const pagarParcela = (p: Parcelamento) => {
    if (p.parcelasPagas < p.parcelas) {
      updateParcelamento({ ...p, parcelasPagas: p.parcelasPagas + 1 });
    }
  };

  const totalMensal = parcelamentos.reduce((s, p) => s + (p.parcelasPagas < p.parcelas ? p.valorParcela : 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Parcelamentos</h2>
          <p className="text-muted-foreground text-sm">Comprometimento mensal: {formatCurrency(totalMensal)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Novo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Parcelamento</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div><Label>Descrição</Label><Input name="descricao" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor Total (R$)</Label><Input name="valorTotal" type="number" step="0.01" required /></div>
                <div><Label>Nº Parcelas</Label><Input name="parcelas" type="number" min="1" required /></div>
              </div>
              <div><Label>Parcelas já pagas</Label><Input name="parcelasPagas" type="number" min="0" defaultValue="0" required /></div>
              <Button type="submit" className="w-full">Adicionar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {parcelamentos.map((p) => {
          const pct = (p.parcelasPagas / p.parcelas) * 100;
          const restantes = p.parcelas - p.parcelasPagas;
          return (
            <div key={p.id} className="finance-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-accent/20 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{p.descricao}</h3>
                    <p className="text-xs text-muted-foreground">{p.parcelasPagas}/{p.parcelas} parcelas</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteParcelamento(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <Progress value={pct} className="h-2.5 mb-3" />

              <div className="grid grid-cols-3 gap-2 text-sm text-center">
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-semibold">{formatCurrency(p.valorTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Parcela</p>
                  <p className="font-semibold">{formatCurrency(p.valorParcela)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Restam</p>
                  <p className="font-semibold">{restantes}</p>
                </div>
              </div>

              {restantes > 0 && (
                <Button variant="outline" className="w-full mt-3" size="sm" onClick={() => pagarParcela(p)}>
                  Registrar Pagamento
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
