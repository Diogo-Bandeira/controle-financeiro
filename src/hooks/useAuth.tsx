import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  householdId: string | null;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthContext>({
  user: null,
  session: null,
  loading: true,
  householdId: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  // Usuário cujo perfil já foi carregado: evita refetch quando só o token é renovado.
  const perfilDeRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function getProfile(userId: string) {
      if (perfilDeRef.current === userId) return;
      perfilDeRef.current = userId;
      const { data: profile } = await supabase
        .from("profiles")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!mounted) return;
      setHouseholdId(profile?.household_id ?? null);
      setLoading(false);
    }

    function aplicarSessao(s: Session | null) {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Fora do callback do onAuthStateChange: chamadas ao supabase dentro dele podem travar.
        const userId = s.user.id;
        setTimeout(() => getProfile(userId), 0);
        return;
      }
      perfilDeRef.current = null;
      setHouseholdId(null);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => aplicarSessao(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => aplicarSessao(s));

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthCtx.Provider value={{ user, session, loading, householdId, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
