import { useFinanceData, formatCurrency, type Meta } from "@/lib/finance-store";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Target, Loader2 } from "lucide-react";
import { useState } from "react";

export default function Metas() {
  const { metas, addMeta, updateMeta, deleteMeta, loading } = useFinanceData();
  const [editMeta, setEditMeta] = useState<Meta | null>(null);
  const [open, setOpen] = useState(false);

  const saveMeta = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const meta = {
      nome: fd.get("nome") as string,
      valorMeta: Number(fd.get("valorMeta")),
      valorAtual: Number(fd.get("valorAtual")),
      rendimento: Number(fd.get("rendimento")),
    };
    if (editMeta) {
      await updateMeta({ ...meta, id: editMeta.id });
    } else {
      await addMeta(meta);
    }
    setOpen(false);
    setEditMeta(null);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Gestão de Metas</h2>
          <p className="text-muted-foreground text-sm">Acompanhe suas metas financeiras</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditMeta(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova Meta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editMeta ? "Editar Meta" : "Nova Meta"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveMeta} className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" name="nome" defaultValue={editMeta?.nome} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="valorMeta">Valor da Meta (R$)</Label>
                  <Input id="valorMeta" name="valorMeta" type="number" step="0.01" defaultValue={editMeta?.valorMeta} required />
                </div>
                <div>
                  <Label htmlFor="valorAtual">Valor Atual (R$)</Label>
                  <Input id="valorAtual" name="valorAtual" type="number" step="0.01" defaultValue={editMeta?.valorAtual || 0} required />
                </div>
              </div>
              <div>
                <Label htmlFor="rendimento">Rendimento Mensal (R$)</Label>
                <Input id="rendimento" name="rendimento" type="number" step="0.01" defaultValue={editMeta?.rendimento || 0} required />
              </div>
              <Button type="submit" className="w-full">Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metas.map((meta) => {
          const pct = meta.valorMeta > 0 ? Math.min((meta.valorAtual / meta.valorMeta) * 100, 100) : 0;
          const falta = Math.max(meta.valorMeta - meta.valorAtual, 0);
          return (
            <div key={meta.id} className="finance-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold">{meta.nome}</h3>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { setEditMeta(meta); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteMeta(meta.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <Progress value={pct} className="h-3 mb-3" />

              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Meta</span>
                  <p className="font-semibold">{formatCurrency(meta.valorMeta)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Atual</span>
                  <p className="font-semibold text-primary">{formatCurrency(meta.valorAtual)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Falta</span>
                  <p className="font-semibold text-destructive">{formatCurrency(falta)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Rendimento</span>
                  <p className="font-semibold text-success">+{formatCurrency(meta.rendimento)}/mês</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-right font-medium">{pct.toFixed(1)}% concluído</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
