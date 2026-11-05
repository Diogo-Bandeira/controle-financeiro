import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { formatDataBR } from "@/lib/format";
import { toISODate } from "@/lib/fatura";
import { ExternalLink, Loader2, Send, Unlink } from "lucide-react";
import { toast } from "sonner";

type Vinculo = Database["public"]["Tables"]["telegram_vinculos"]["Row"];

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

const formatarRestante = (segundos: number) => `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

/** Seção "Telegram" de Configurações: gera o código de vínculo e lista/desconecta os chats do household. */
export function TelegramConexao() {
  const { user, householdId } = useAuth();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [codigo, setCodigo] = useState<{ codigo: string; expiraEm: number } | null>(null);
  const [restante, setRestante] = useState(0);
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("telegram_vinculos").select("*").eq("ativo", true).order("created_at");
    if (error) { toast.error("Erro ao carregar os chats do Telegram"); return; }
    setVinculos(data);
  }, []);

  useEffect(() => {
    if (!householdId) return;
    carregar();
    const canal = supabase
      .channel(`telegram-${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_vinculos" }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [householdId, carregar]);

  // Contagem regressiva do código; some quando expira.
  useEffect(() => {
    if (!codigo) return;
    const atualizar = () => {
      const s = Math.max(0, Math.round((codigo.expiraEm - Date.now()) / 1000));
      setRestante(s);
      if (s === 0) setCodigo(null);
    };
    atualizar();
    const id = setInterval(atualizar, 1000);
    return () => clearInterval(id);
  }, [codigo]);

  // O bot criou o vínculo com o código mostrado: esconde o código.
  useEffect(() => {
    if (!codigo) return;
    const novo = vinculos.find((v) => v.user_id === user?.id && new Date(v.created_at).getTime() > codigo.expiraEm - 10 * 60 * 1000);
    if (!novo) return;
    setCodigo(null);
    toast.success("Telegram conectado");
  }, [vinculos, codigo, user?.id]);

  const gerar = async () => {
    setGerando(true);
    const { data, error } = await supabase.rpc("gerar_codigo_telegram");
    setGerando(false);
    const [novo] = data ?? [];
    if (error || !novo) { toast.error("Erro ao gerar o código"); return; }
    setCodigo({ codigo: novo.codigo, expiraEm: new Date(novo.expira_em).getTime() });
  };

  const desconectar = async (id: string) => {
    const { error } = await supabase.from("telegram_vinculos").update({ ativo: false }).eq("id", id);
    if (error) { toast.error("Erro ao desconectar"); return; }
    toast.success("Chat desconectado");
    carregar();
  };

  const link = codigo && BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=${codigo.codigo}` : null;

  return (
    <section className="finance-card space-y-3">
      <h3 className="section-title text-lg flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> Telegram</h3>
      <p className="text-sm text-muted-foreground">
        Lance gastos e entradas mandando texto, áudio ou foto de comprovante para o bot, e pergunte coisas como “quanto gastei em lazer?”.
      </p>

      {codigo ? (
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-2xl tracking-[0.3em] font-semibold">{codigo.codigo}</span>
            <span className="text-xs text-muted-foreground">expira em {formatarRestante(restante)}</span>
          </div>
          <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-0.5">
            {link ? (
              <li>
                Abra{" "}
                <a href={link} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                  {link.replace("https://", "")} <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ) : (
              <li>Abra o bot no Telegram</li>
            )}
            <li>Toque em <b>Iniciar</b> (ou mande <code>/vincular {codigo.codigo}</code>)</li>
          </ol>
        </div>
      ) : (
        <Button onClick={gerar} disabled={gerando}>
          {gerando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Conectar Telegram
        </Button>
      )}

      {vinculos.length > 0 && (
        <ul className="space-y-2">
          {vinculos.map((v) => (
            <li key={v.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0">
                <span className="font-medium">{v.nome_exibicao ?? "Sem nome"}</span>
                {v.telegram_username && <span className="text-muted-foreground"> @{v.telegram_username}</span>}
                <span className="block text-xs text-muted-foreground">desde {formatDataBR(toISODate(new Date(v.created_at)))}</span>
              </span>
              {v.user_id === user?.id && (
                <Button variant="outline" size="sm" onClick={() => desconectar(v.id)}>
                  <Unlink className="h-4 w-4 mr-1" /> Desconectar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">As mensagens enviadas ao bot são interpretadas pelo Gemini (Google).</p>
    </section>
  );
}
