import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/MoneyInput";
import { useFinanceData, type Cartao } from "@/lib/finance-store";
import { PALETA_CORES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CartaoFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cartao?: Cartao | null;
  onSalvo?: (c: Cartao) => void;
}

const vazio: Omit<Cartao, "id"> = {
  nome: "", banco: null, cor: PALETA_CORES[0], diaFechamento: null, diaVencimento: null, limite: null, titular: null, ativo: true,
};

export function CartaoFormDialog({ open, onOpenChange, cartao, onSalvo }: CartaoFormDialogProps) {
  const { addCartao, updateCartao } = useFinanceData();
  const [form, setForm] = useState<Omit<Cartao, "id">>(vazio);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) setForm(cartao ? { ...cartao } : vazio);
  }, [open, cartao]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dia = (s: string) => (s === "" ? null : Math.min(31, Math.max(1, Number(s))));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Informe o nome do cartão"); return; }
    if (form.diaFechamento == null || form.diaVencimento == null) {
      toast.error("Informe o dia de fechamento e o dia de vencimento");
      return;
    }
    setSalvando(true);
    const dados = { ...form, nome: form.nome.trim() };
    const salvo = cartao ? ((await updateCartao({ ...dados, id: cartao.id })) ? { ...dados, id: cartao.id } : null) : await addCartao(dados);
    setSalvando(false);
    if (!salvo) return;
    toast.success(cartao ? "Cartão atualizado" : "Cartão cadastrado");
    onSalvo?.(salvo);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cartao ? "Editar cartão" : "Novo cartão"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Bradesco Visa" required />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Banco</Label>
              <Input value={form.banco ?? ""} onChange={(e) => set("banco", e.target.value || null)} />
            </div>
            <div>
              <Label>Dia de fechamento</Label>
              <Input type="number" inputMode="numeric" min={1} max={31} value={form.diaFechamento ?? ""} onChange={(e) => set("diaFechamento", dia(e.target.value))} required />
            </div>
            <div>
              <Label>Dia de vencimento</Label>
              <Input type="number" inputMode="numeric" min={1} max={31} value={form.diaVencimento ?? ""} onChange={(e) => set("diaVencimento", dia(e.target.value))} required />
            </div>
            <div>
              <Label>Limite</Label>
              <MoneyInput value={form.limite} onChange={(v) => set("limite", v || null)} />
            </div>
            <div>
              <Label>Titular</Label>
              <Input value={form.titular ?? ""} onChange={(e) => set("titular", e.target.value || null)} />
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
                  onClick={() => set("cor", c)}
                  className={cn("h-7 w-7 rounded-full border-2 transition-transform", form.cor === c ? "border-foreground scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="cartao-ativo">Ativo</Label>
            <Switch id="cartao-ativo" checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
          </div>

          <Button type="submit" className="w-full" disabled={salvando}>
            {cartao ? "Salvar alterações" : "Cadastrar cartão"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
