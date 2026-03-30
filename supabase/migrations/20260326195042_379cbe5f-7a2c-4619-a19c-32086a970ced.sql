
-- Create households table for shared data between couple
CREATE TABLE public.households (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT 'Família',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create function to check household membership
CREATE OR REPLACE FUNCTION public.get_user_household_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.profiles WHERE user_id = _user_id
$$;

-- Households policies
CREATE POLICY "Members can view their household"
  ON public.households FOR SELECT
  USING (id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Members can update their household"
  ON public.households FOR UPDATE
  USING (id = public.get_user_household_id(auth.uid()));

-- Profiles policies
CREATE POLICY "Users can view profiles in their household"
  ON public.profiles FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create metas table
CREATE TABLE public.metas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  valor_meta NUMERIC NOT NULL DEFAULT 0,
  valor_atual NUMERIC NOT NULL DEFAULT 0,
  rendimento NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view metas" ON public.metas FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can insert metas" ON public.metas FOR INSERT TO authenticated
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can update metas" ON public.metas FOR UPDATE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can delete metas" ON public.metas FOR DELETE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Create lancamentos table
-- CORRIGIDO: adicionado campo "ano" para evitar mistura de dados entre anos diferentes
CREATE TABLE public.lancamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL CHECK (categoria IN ('entrada', 'dizimo', 'conta_fixa', 'cartao', 'variavel')),
  mes INTEGER NOT NULL CHECK (mes >= 0 AND mes <= 11),
  ano INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view lancamentos" ON public.lancamentos FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can insert lancamentos" ON public.lancamentos FOR INSERT TO authenticated
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can update lancamentos" ON public.lancamentos FOR UPDATE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can delete lancamentos" ON public.lancamentos FOR DELETE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Create parcelamentos table
CREATE TABLE public.parcelamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  parcelas INTEGER NOT NULL DEFAULT 1,
  parcelas_pagas INTEGER NOT NULL DEFAULT 0,
  valor_parcela NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.parcelamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view parcelamentos" ON public.parcelamentos FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can insert parcelamentos" ON public.parcelamentos FOR INSERT TO authenticated
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can update parcelamentos" ON public.parcelamentos FOR UPDATE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can delete parcelamentos" ON public.parcelamentos FOR DELETE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Create prioridades table
CREATE TABLE public.prioridades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  prioridade TEXT NOT NULL CHECK (prioridade IN ('alta', 'media', 'baixa')),
  concluida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.prioridades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view prioridades" ON public.prioridades FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can insert prioridades" ON public.prioridades FOR INSERT TO authenticated
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can update prioridades" ON public.prioridades FOR UPDATE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Members can delete prioridades" ON public.prioridades FOR DELETE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_metas_updated_at BEFORE UPDATE ON public.metas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lancamentos_updated_at BEFORE UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_parcelamentos_updated_at BEFORE UPDATE ON public.parcelamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_prioridades_updated_at BEFORE UPDATE ON public.prioridades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile and household on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_household_id UUID;
BEGIN
  INSERT INTO public.households (nome) VALUES ('Família') RETURNING id INTO new_household_id;
  INSERT INTO public.profiles (user_id, household_id, display_name)
  VALUES (NEW.id, new_household_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
