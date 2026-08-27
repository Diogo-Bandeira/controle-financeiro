import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFinanceData } from "@/lib/finance-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Bot, User, Plus, MessageSquare, History, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "user" | "model";
  content: string;
};

type Conversa = {
  id: string;
  titulo: string;
  created_at: string;
};

export function ChatFinanceiro() {
  const { entradas, totalSaidas, saldo, metas, parcelamentos, prioridades } = useFinanceData();
  
  const [conversas, setConversas] = ConversaState();
  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<"chat" | "historico">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Buscar lista de conversas ao montar
  useEffect(() => {
    carregarConversas();
  }, []);

  // Buscar mensagens quando trocar de conversa ativa
  useEffect(() => {
    if (conversaAtiva) {
      carregarMensagens(conversaAtiva);
    } else {
      setMessages([
        { role: "model", content: "Olá! Sou seu consultor financeiro. Como posso te ajudar com seu planejamento ou simular um novo gasto hoje?" }
      ]);
    }
  }, [conversaAtiva]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const carregarConversas = async () => {
    try {
      const { data, error } = await supabase
        .from('conversas_chat')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConversas(data || []);
    } catch (err) {
      console.error("Erro ao carregar histórico de conversas:", err);
    }
  };

  const carregarMensagens = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('mensagens_chat')
        .select('role, content')
        .eq('conversa_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data && data.length > 0) {
        setMessages(data as Message[]);
      }
    } catch (err) {
      console.error("Erro ao carregar mensagens:", err);
    }
  };

  const criarNovaConversa = () => {
    setConversaAtiva(null);
    setMessages([
      { role: "model", content: "Olá! Sou seu consultor financeiro. Como posso te ajudar com seu planejamento ou simular um novo gasto hoje?" }
    ]);
    setView("chat");
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let currentConversationId = conversaAtiva;

    try {
      // Se for a primeira mensagem de uma nova conversa, cria o registro no banco
      if (!currentConversationId) {
        // Pega o household_id do usuário logado através da tabela de metas ou outra existente, ou cria direto
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

        // Descobre o household_id associado ao usuário
        const { data: profileData } = await supabase
          .from('metas') // ou qualquer tabela que tenha household_id para pegar o ID rapidamente
          .select('household_id')
          .limit(1)
          .single();

        const householdId = profileData?.household_id;
        if (!householdId) throw new Error("Household não encontrado.");

        const tituloGerado = userMsg.content.slice(0, 30) + "...";
        const { data: novaConv, error: errConv } = await supabase
          .from('conversas_chat')
          .insert([{ household_id: householdId, titulo: tituloGerado }])
          .select()
          .single();

        if (errConv) throw errConv;
        currentConversationId = novaConv.id;
        setConversaAtiva(currentConversationId);
        carregarConversas();
      }

      // Salva a mensagem do usuário no banco
      await supabase.from('mensagens_chat').insert([
        { conversa_id: currentConversationId, role: 'user', content: userMsg.content }
      ]);

      // Monta o contexto para a Edge Function
      const contextoFinanceiro = {
        entradas,
        totalSaidas,
        saldo,
        metas: metas.map(m => ({ nome: m.nome, atual: m.valorAtual, alvo: m.valorMeta })),
        parcelamentos: parcelamentos.map(p => ({ desc: p.descricao, valor_mensal: p.valorParcela, total: p.valorTotal })),
        prioridades: prioridades.map(p => ({ desc: p.descricao, nivel: p.prioridade, valor: p.valor }))
      };

      const { data, error } = await supabase.functions.invoke('chat-financeiro', {
        body: { 
          messages: newMessages,
          contextoFinanceiro 
        }
      });

      if (error) throw error;

      if (data && data.reply) {
        const aiReply: Message = { role: "model", content: data.reply };
        setMessages(prev => [...prev, aiReply]);

        // Salva a resposta da IA no banco
        await supabase.from('mensagens_chat').insert([
          { conversa_id: currentConversationId, role: 'model', content: data.reply }
        ]);
      } else {
        throw new Error("Resposta inválida da IA");
      }

    } catch (error) {
      console.error(error);
      toast.error("Erro ao processar a mensagem. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Cabeçalho Interno do Chat */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          {view === "historico" ? (
            <Button variant="ghost" size="sm" onClick={() => setView("chat")} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          ) : (
            <span className="text-xs font-medium text-muted-foreground truncate max-w-[200px]">
              {conversaAtiva ? "Conversa Salva" : "Nova Conversa"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Histórico de Conversas" onClick={() => setView(view === "historico" ? "chat" : "historico")}>
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Nova Conversa" onClick={criarNovaConversa}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Conteúdo Dinâmico: Chat ou Lista de Histórico */}
      {view === "historico" ? (
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Conversas Anteriores</h3>
            {conversas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conversa salva ainda.</p>
            ) : (
              conversas.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setConversaAtiva(c.id);
                    setView("chat");
                  }}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 flex items-center justify-between",
                    conversaAtiva === c.id && "bg-muted border-primary"
                  )}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{c.titulo}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        <>
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex w-fit max-w-[85%] flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground border"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1 opacity-70">
                    {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    <span className="text-xs font-medium">{msg.role === "user" ? "Você" : "Consultor"}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words leading-relaxed prose prose-sm dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="bg-muted border w-max max-w-[85%] rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Analisando contexto...</span>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 bg-card border-t">
            <form onSubmit={sendMessage} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite sua dúvida ou simulação..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={!input.trim() || isLoading} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function ConversaState(): [Conversa[], React.Dispatch<React.SetStateAction<Conversa[]>>] {
  return useState<Conversa[]>([]);
}