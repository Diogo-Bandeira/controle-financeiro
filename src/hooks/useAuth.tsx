import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    let mounted = true;

    async function getProfile(userId: string) {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("household_id")
          .eq("user_id", userId)
          .single();
          
        if (mounted) {
          setHouseholdId(profile?.household_id ?? null);
          setLoading(false);
        }
      } catch (error) {
        if (mounted) setLoading(false);
      }
    }

    // Busca a sessão inicial manualmente para evitar depender apenas do listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
           getProfile(session.user.id);
        } else {
           setLoading(false);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Evita refetch desnecessário se o usuário for o mesmo
        if (session?.user && session.user.id !== user?.id) {
          getProfile(session.user.id);
        } else if (!session?.user) {
          setHouseholdId(null);
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [user?.id]); // Adiciona o user.id para controle

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