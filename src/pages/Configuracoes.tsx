import { useState } from "react";
import { useTheme } from "next-themes";
import { useFinanceData } from "@/lib/finance-store";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PaginaCarregando } from "@/components/EstadoVazio";
import { iniciais } from "@/lib/texto";
import { Copy, Eye, Laptop, Moon, Sun, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

export default function Configuracoes() {
  const { household, membros, entrarHousehold, ocultarValores, setOcultarValores, loading } = useFinanceData();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [codigo, setCodigo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [entrando, setEntrando] = useState(false);

  const copiarCodigo = async () => {
    if (!household?.codigoConvite) return;
    try {
      await navigator.clipboard.writeText(household.codigoConvite);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar o código");
    }
  };

  const entrar = async () => {
    setEntrando(true);
    const ok = await entrarHousehold(codigo.trim());
    setEntrando(false);
    setConfirmar(false);
    if (!ok) return;
    toast.success("Você entrou no novo household");
    window.location.reload();
  };

  if (loading) return <PaginaCarregando cards={2} />;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-display font-bold">Configurações</h2>
        <p className="text-muted-foreground text-sm">Household, membros e preferências</p>
      </div>

      <section className="finance-card space-y-3">
        <h3 className="section-title text-lg flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Convidar para o household</h3>
        <p className="text-sm text-muted-foreground">Compartilhe este código com quem vai dividir as finanças com você.</p>
        <div className="flex gap-2">
          <Input readOnly value={household?.codigoConvite ?? "—"} className="font-mono tracking-widest text-center max-w-[200px]" />
          <Button variant="outline" onClick={copiarCodigo} disabled={!household?.codigoConvite}>
            <Copy className="h-4 w-4 mr-1" /> Copiar
          </Button>
        </div>
      </section>

      <section className="finance-card space-y-3">
        <h3 className="section-title text-lg">Entrar em outro household</h3>
        <p className="text-sm text-muted-foreground">
          Ao entrar, os dados do household atual deixam de aparecer para você (continuam salvos para os outros membros).
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (codigo.trim().length < 4) { toast.error("Informe o código de convite"); return; }
            setConfirmar(true);
          }}
        >
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código de 8 caracteres"
            maxLength={16}
            className="font-mono tracking-widest max-w-[220px]"
          />
          <Button type="submit" disabled={entrando}>Entrar</Button>
        </form>
      </section>

      <section className="finance-card space-y-3">
        <h3 className="section-title text-lg flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Membros</h3>
        {membros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum membro encontrado.</p>
        ) : (
          <ul className="space-y-2">
            {membros.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 text-sm">
                <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {iniciais(m.nome)}
                </span>
                <span className="font-medium">{m.nome}</span>
                {m.userId === user?.id && <span className="text-xs text-muted-foreground">(você)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="finance-card space-y-4">
        <h3 className="section-title text-lg">Preferências</h3>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Label>Tema</Label>
          <ToggleGroup type="single" value={theme ?? "system"} onValueChange={(v) => v && setTheme(v)}>
            <ToggleGroupItem value="light" size="sm" aria-label="Claro"><Sun className="h-4 w-4 mr-1" /> Claro</ToggleGroupItem>
            <ToggleGroupItem value="dark" size="sm" aria-label="Escuro"><Moon className="h-4 w-4 mr-1" /> Escuro</ToggleGroupItem>
            <ToggleGroupItem value="system" size="sm" aria-label="Sistema"><Laptop className="h-4 w-4 mr-1" /> Sistema</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="ocultar" className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" /> Ocultar valores
          </Label>
          <Switch id="ocultar" checked={ocultarValores} onCheckedChange={setOcultarValores} />
        </div>
      </section>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entrar no household {codigo.trim()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados do seu household atual deixam de aparecer para você. Para voltar, será preciso o código de convite dele
              ({household?.codigoConvite ?? "anote antes"}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); entrar(); }} disabled={entrando}>Entrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
