-- Sincroniza com o banco real objetos criados fora das migrations (via dashboard).
-- Já aplicado no remoto (marcado via `supabase migration repair`); roda só em bancos novos/locais.

-- Colunas extras de lancamentos
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS subcategoria TEXT;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS cartao_nome TEXT;

-- Conversas do chat financeiro
CREATE TABLE IF NOT EXISTS public.conversas_chat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL DEFAULT 'Nova Conversa',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.conversas_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem gerenciar conversas do seu household" ON public.conversas_chat
  USING (household_id = public.get_user_household_id(auth.uid()))
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

-- Mensagens do chat financeiro
CREATE TABLE IF NOT EXISTS public.mensagens_chat (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id UUID NOT NULL REFERENCES public.conversas_chat(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.mensagens_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem gerenciar mensagens das conversas do seu househ" ON public.mensagens_chat
  USING (conversa_id IN (SELECT id FROM public.conversas_chat WHERE household_id = public.get_user_household_id(auth.uid())))
  WITH CHECK (conversa_id IN (SELECT id FROM public.conversas_chat WHERE household_id = public.get_user_household_id(auth.uid())));
