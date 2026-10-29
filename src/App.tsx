import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { FinanceProvider } from "@/lib/finance-store";
import AppLayout from "@/components/AppLayout";
import { PaginaCarregando } from "@/components/EstadoVazio";
import Dashboard from "@/pages/Dashboard";
import Metas from "@/pages/Metas";
import Lancamentos from "@/pages/Lancamentos";
import Cartoes from "@/pages/Cartoes";
import Parcelamentos from "@/pages/Parcelamentos";
import Orcamento from "@/pages/Orcamento";
import Prioridades from "@/pages/Prioridades";
import Configuracoes from "@/pages/Configuracoes";
import Auth from "@/pages/Auth";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function TelaCarregando() {
  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <PaginaCarregando />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <TelaCarregando />;
  if (!user) return <Navigate to="/auth" replace />;

  // FinanceProvider envolve as rotas protegidas: estado compartilhado entre as páginas
  return <FinanceProvider>{children}</FinanceProvider>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return <TelaCarregando />;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="cf:tema">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/controle-financeiro">
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/lancamentos" element={<Lancamentos />} />
                        <Route path="/cartoes" element={<Cartoes />} />
                        <Route path="/parcelamentos" element={<Parcelamentos />} />
                        <Route path="/orcamento" element={<Orcamento />} />
                        <Route path="/prioridades" element={<Prioridades />} />
                        <Route path="/metas" element={<Metas />} />
                        <Route path="/configuracoes" element={<Configuracoes />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
