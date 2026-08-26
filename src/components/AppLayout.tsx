import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Target,
  Receipt,
  CreditCard,
  ShoppingBag,
  Menu,
  X,
  Church,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Visão Geral", icon: LayoutDashboard },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { to: "/parcelamentos", label: "Parcelamentos", icon: CreditCard },
  { to: "/prioridades", label: "Prioridades", icon: ShoppingBag },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between bg-sidebar px-4 py-3">
        <div className="flex items-center gap-2">
          <Church className="h-6 w-6 text-sidebar-primary" />
          <span className="font-display text-lg text-sidebar-foreground font-bold">Finanças Pessoais</span>
        </div>
        <button onClick={() => setOpen(!open)} className="text-sidebar-foreground p-1">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Mobile nav overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 top-14 z-50 bg-sidebar animate-slide-in">
          <nav className="flex flex-col p-4 gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                  location.pathname === item.to
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors mt-4"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </button>
          </nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-sidebar min-h-screen p-5 shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="h-10 w-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Church className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-lg text-sidebar-foreground font-bold leading-tight">Finanças</h1>
            <span className="text-xs text-sidebar-foreground/60 font-medium">Pessoais • {displayName}</span>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                location.pathname === item.to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-sidebar-border space-y-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
          <p className="text-xs text-sidebar-foreground/40 text-center">
            Diogo Bandeira © {new Date().getFullYear()}
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
