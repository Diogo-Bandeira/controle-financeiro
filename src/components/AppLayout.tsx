import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, Target, Receipt, CreditCard, Wallet, PieChart, ShoppingBag, Church, LogOut, Settings, MessageSquare,
  Eye, EyeOff, Moon, Sun, Plus, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useFinanceData } from "@/lib/finance-store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatFinanceiro } from "./ChatFinanceiro";
import { SeletorMes } from "./SeletorMes";
import { AlertasPopover } from "./AlertasPopover";
import { LancamentoForm } from "./LancamentoForm";

const navItems = [
  { to: "/", label: "Visão Geral", icon: LayoutDashboard },
  { to: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { to: "/cartoes", label: "Cartões", icon: Wallet },
  { to: "/parcelamentos", label: "Parcelamentos", icon: CreditCard },
  { to: "/orcamento", label: "Orçamento", icon: PieChart },
  { to: "/prioridades", label: "Prioridades", icon: ShoppingBag },
  { to: "/metas", label: "Metas", icon: Target },
];

// Barra inferior (mobile): 4 atalhos + "Mais" com o restante.
const navInferior = navItems.filter((i) => ["/", "/lancamentos", "/cartoes", "/orcamento"].includes(i.to));
const navMais = [...navItems.filter((i) => !navInferior.includes(i)), { to: "/configuracoes", label: "Configurações", icon: Settings }];

const linkClasse = (ativo: boolean) =>
  cn(
    "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
    ativo ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
  );

function AcoesTopo() {
  const { ocultarValores, setOcultarValores } = useFinanceData();
  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme === "dark";
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => setOcultarValores(!ocultarValores)}
        aria-label={ocultarValores ? "Mostrar valores" : "Ocultar valores"}
        title={ocultarValores ? "Mostrar valores" : "Ocultar valores"}
      >
        {ocultarValores ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => setTheme(escuro ? "light" : "dark")}
        aria-label={escuro ? "Tema claro" : "Tema escuro"}
        title={escuro ? "Tema claro" : "Tema escuro"}
      >
        {escuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <AlertasPopover />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [maisAberto, setMaisAberto] = useState(false);
  const [novoLancamento, setNovoLancamento] = useState(false);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";
  const ativo = (to: string) => location.pathname === to;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar (md+) */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 bg-sidebar min-h-screen p-5 shrink-0 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Church className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-lg text-sidebar-foreground font-bold leading-tight">Finanças</h1>
            <span className="text-xs text-sidebar-foreground/60 font-medium truncate block">Pessoais • {displayName}</span>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={linkClasse(ativo(item.to))}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-sidebar-border space-y-1">
          <Link to="/configuracoes" className={linkClasse(ativo("/configuracoes"))}>
            <Settings className="h-4 w-4" />
            Configurações
          </Link>
          <button onClick={signOut} className={cn(linkClasse(false), "w-full")}>
            <LogOut className="h-4 w-4" />
            Sair
          </button>
          <p className="text-xs text-sidebar-foreground/40 text-center pt-2">
            Diogo Bandeira © {new Date().getFullYear()}
          </p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topo: seletor de mês global + ações */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 px-2 md:px-8 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Church className="md:hidden h-5 w-5 text-primary shrink-0 ml-2" />
              <SeletorMes />
            </div>
            <AcoesTopo />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8">
          <div className="max-w-6xl mx-auto animate-fade-in">{children}</div>
        </main>
      </div>

      {/* Lançamento rápido (mobile) */}
      <Button
        className="md:hidden fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-xl"
        size="icon"
        onClick={() => setNovoLancamento(true)}
        aria-label="Novo lançamento"
      >
        <Plus className="h-6 w-6" />
      </Button>
      <LancamentoForm open={novoLancamento} onOpenChange={setNovoLancamento} />

      {/* Chat: acima do "+" no mobile, canto inferior no desktop */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="secondary"
            className="fixed z-40 bottom-[9.5rem] right-5 h-11 w-11 md:bottom-6 md:right-6 md:h-14 md:w-14 rounded-full shadow-xl border"
            size="icon"
            aria-label="Consultor Financeiro IA"
          >
            <MessageSquare className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col border-l">
          <SheetHeader className="p-4 border-b bg-card">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Consultor Financeiro IA
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <ChatFinanceiro />
          </div>
        </SheetContent>
      </Sheet>

      {/* Barra de navegação inferior (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {navInferior.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
                ativo(item.to) ? "text-sidebar-primary" : "text-sidebar-foreground/70",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate max-w-full px-1">{item.label}</span>
            </Link>
          ))}
          <Sheet open={maisAberto} onOpenChange={setMaisAberto}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
                  navMais.some((i) => ativo(i.to)) ? "text-sidebar-primary" : "text-sidebar-foreground/70",
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                Mais
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-sidebar border-sidebar-border">
              <SheetHeader>
                <SheetTitle className="text-sidebar-foreground text-left">{displayName}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 mt-4">
                {navMais.map((item) => (
                  <Link key={item.to} to={item.to} onClick={() => setMaisAberto(false)} className={linkClasse(ativo(item.to))}>
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                ))}
                <button onClick={signOut} className={cn(linkClasse(false), "w-full")}>
                  <LogOut className="h-5 w-5" />
                  Sair
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}
