-- Cartões com fechamento/vencimento, parcelas geradas como lançamentos, orçamento editável,
-- recorrências, faturas pagas, aportes em metas, convite de household e RPCs transacionais.
-- Convenção: mes é 0–11 (Janeiro = 0) em todas as tabelas.

-- ─── Households: código de convite ───────────────────────────────────────────

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS codigo_convite TEXT
  DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

UPDATE public.households
  SET codigo_convite = upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 8))
  WHERE codigo_convite IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS households_codigo_convite_key ON public.households (codigo_convite);

-- ─── cartoes ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cartoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  banco TEXT,
  cor TEXT,
  dia_fechamento INTEGER CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
  limite NUMERIC(12,2),
  titular TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cartoes_household_nome_key ON public.cartoes (household_id, lower(nome));

-- ─── subcategorias ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subcategorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  cor TEXT NOT NULL,
  limite_padrao NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo TEXT CHECK (tipo IN ('necessidade', 'desejo', 'poupanca', 'terceiros', 'doacao')),
  conta_no_orcamento BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (household_id, slug)
);

-- ─── orcamentos (override de limite por mês) ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  subcategoria_slug TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
  limite NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (household_id, subcategoria_slug, ano, mes)
);

-- ─── recorrencias ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recorrencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL CHECK (categoria IN ('entrada', 'conta_fixa', 'cartao', 'variavel')),
  subcategoria TEXT,
  cartao_id UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  dia INTEGER NOT NULL DEFAULT 1 CHECK (dia BETWEEN 1 AND 31),
  inicio_ano INTEGER NOT NULL,
  inicio_mes INTEGER NOT NULL CHECK (inicio_mes BETWEEN 0 AND 11),
  fim_ano INTEGER,
  fim_mes INTEGER CHECK (fim_mes BETWEEN 0 AND 11),
  reembolso BOOLEAN NOT NULL DEFAULT false,
  responsavel TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ─── parcelamentos: vínculo com cartão e datas ───────────────────────────────
-- parcelas_pagas, nos vinculados, = parcelas anteriores que não viraram lançamento
-- (compra antiga ou legado vinculado); as demais têm status derivado da fatura.

ALTER TABLE public.parcelamentos
  ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategoria TEXT,
  ADD COLUMN IF NOT EXISTS data_compra DATE,
  ADD COLUMN IF NOT EXISTS primeira_fatura_mes INTEGER CHECK (primeira_fatura_mes BETWEEN 0 AND 11),
  ADD COLUMN IF NOT EXISTS primeira_fatura_ano INTEGER,
  ADD COLUMN IF NOT EXISTS quitado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid();

-- ─── lancamentos: novas colunas ──────────────────────────────────────────────
-- mes/ano: entradas, contas fixas e variáveis = mês da data; cartão = mês da fatura (vencimento).

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS data DATE,
  ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parcelamento_id UUID REFERENCES public.parcelamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parcela_num INTEGER,
  ADD COLUMN IF NOT EXISTS recorrencia_id UUID REFERENCES public.recorrencias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS reembolso BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsavel TEXT,
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid();

ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_status_check;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_status_check CHECK (status IN ('pago', 'pendente'));
ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_origem_check;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_origem_check
  CHECK (origem IN ('manual', 'parcela', 'recorrente', 'importado'));

UPDATE public.lancamentos SET data = make_date(ano, mes + 1, 1) WHERE data IS NULL;
ALTER TABLE public.lancamentos ALTER COLUMN data SET DEFAULT current_date;
ALTER TABLE public.lancamentos ALTER COLUMN data SET NOT NULL;

CREATE INDEX IF NOT EXISTS lancamentos_household_ano_mes_idx ON public.lancamentos (household_id, ano, mes);
CREATE INDEX IF NOT EXISTS lancamentos_parcelamento_idx ON public.lancamentos (parcelamento_id);
CREATE INDEX IF NOT EXISTS lancamentos_cartao_ano_mes_idx ON public.lancamentos (cartao_id, ano, mes);
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_recorrencia_mes_key
  ON public.lancamentos (recorrencia_id, ano, mes) WHERE recorrencia_id IS NOT NULL;

-- Backfill de cartões a partir de cartao_nome. Agrupa variações de caixa/acento ("Itau"/"Itaú")
-- e prefere a grafia acentuada; empate → a mais usada.
CREATE OR REPLACE FUNCTION public.normalizar_nome_cartao(_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(translate(trim(_nome),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
$$;

INSERT INTO public.cartoes (household_id, nome)
SELECT DISTINCT ON (household_id, chave) household_id, nome
FROM (
  SELECT household_id, trim(cartao_nome) AS nome, public.normalizar_nome_cartao(cartao_nome) AS chave, count(*) AS usos
  FROM public.lancamentos
  WHERE cartao_nome IS NOT NULL AND trim(cartao_nome) <> ''
  GROUP BY household_id, trim(cartao_nome), public.normalizar_nome_cartao(cartao_nome)
) variantes
WHERE NOT EXISTS (
  SELECT 1 FROM public.cartoes c
  WHERE c.household_id = variantes.household_id AND public.normalizar_nome_cartao(c.nome) = variantes.chave
)
ORDER BY household_id, chave, (lower(nome) <> public.normalizar_nome_cartao(nome)) DESC, usos DESC, nome;

UPDATE public.lancamentos l
SET cartao_id = c.id
FROM public.cartoes c
WHERE l.cartao_id IS NULL
  AND l.cartao_nome IS NOT NULL
  AND c.household_id = l.household_id
  AND public.normalizar_nome_cartao(c.nome) = public.normalizar_nome_cartao(l.cartao_nome);

-- ─── faturas_pagas ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.faturas_pagas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  cartao_id UUID NOT NULL REFERENCES public.cartoes(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
  pago_em DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (cartao_id, ano, mes)
);

-- ─── prioridades: planejamento ───────────────────────────────────────────────

ALTER TABLE public.prioridades
  ADD COLUMN IF NOT EXISTS subcategoria TEXT,
  ADD COLUMN IF NOT EXISTS mes_planejado INTEGER CHECK (mes_planejado BETWEEN 0 AND 11),
  ADD COLUMN IF NOT EXISTS ano_planejado INTEGER,
  ADD COLUMN IF NOT EXISTS parcelas_previstas INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cartao_id UUID REFERENCES public.cartoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link TEXT,
  ADD COLUMN IF NOT EXISTS observacao TEXT,
  ADD COLUMN IF NOT EXISTS ordem INTEGER,
  ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS lancamento_id UUID REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parcelamento_id UUID REFERENCES public.parcelamentos(id) ON DELETE SET NULL;

-- ─── metas + aportes ─────────────────────────────────────────────────────────
-- metas.valor_atual passa a significar "saldo inicial"; atual exibido = valor_atual + soma(aportes).

ALTER TABLE public.metas
  ADD COLUMN IF NOT EXISTS prazo DATE,
  ADD COLUMN IF NOT EXISTS taxa_rendimento_mensal NUMERIC(6,4);

CREATE TABLE IF NOT EXISTS public.aportes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  meta_id UUID NOT NULL REFERENCES public.metas(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT current_date,
  valor NUMERIC(12,2) NOT NULL,
  lancamento_id UUID REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aportes_meta_idx ON public.aportes (meta_id);

-- ─── RLS + policies + triggers das tabelas novas ─────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cartoes', 'subcategorias', 'orcamentos', 'recorrencias', 'faturas_pagas', 'aportes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "Members can view %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Members can view %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (household_id = public.get_user_household_id(auth.uid()))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Members can insert %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Members can insert %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (household_id = public.get_user_household_id(auth.uid()))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Members can update %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Members can update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (household_id = public.get_user_household_id(auth.uid()))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Members can delete %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Members can delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (household_id = public.get_user_household_id(auth.uid()))', t);

    EXECUTE format('DROP TRIGGER IF EXISTS update_%1$s_updated_at ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER update_%1$s_updated_at BEFORE UPDATE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- profiles: a policy "Users can view profiles in their household" (migration inicial) já permite
-- ver os perfis do mesmo household; recriada aqui para garantir o estado esperado.
DROP POLICY IF EXISTS "Users can view profiles in their household" ON public.profiles;
CREATE POLICY "Users can view profiles in their household"
  ON public.profiles FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());

-- ─── Seed de subcategorias ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_subcategorias(_household_id UUID)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.subcategorias (household_id, slug, label, cor, limite_padrao, tipo, conta_no_orcamento, ordem)
  VALUES
    (_household_id, 'alimentacao',       'Alimentação',                   '#10B981', 1880, 'necessidade', true,  1),
    (_household_id, 'reserva',           'Reserva / Investimentos',       '#84CC16', 1500, 'poupanca',    true,  2),
    (_household_id, 'gastos_extras',     'Gastos Extras / Parcelamentos', '#EF4444',  850, 'desejo',      true,  3),
    (_household_id, 'manutencao',        'Manutenção',                    '#F97316',  800, 'necessidade', true,  4),
    (_household_id, 'transporte',        'Transporte',                    '#F59E0B',  750, 'necessidade', true,  5),
    (_household_id, 'dizimo',            'Dízimos',                       '#A16207',  730, 'doacao',      true,  6),
    (_household_id, 'gastos_pessoais',   'Gastos Pessoais',               '#EC4899',  700, 'desejo',      true,  7),
    (_household_id, 'saude',             'Saúde',                         '#3B82F6',  700, 'necessidade', true,  8),
    (_household_id, 'lazer',             'Lazer',                         '#8B5CF6',  600, 'desejo',      true,  9),
    (_household_id, 'assinaturas',       'Assinaturas',                   '#06B6D4',  500, 'desejo',      true, 10),
    (_household_id, 'moradia',           'Moradia & Contas Fixas',        '#64748B',  490, 'necessidade', true, 11),
    (_household_id, 'compras_terceiros', 'Compras de Terceiros',          '#14B8A6',    0, 'terceiros',   false, 12)
  ON CONFLICT (household_id, slug) DO NOTHING;
$$;

SELECT public.seed_subcategorias(id) FROM public.households;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_household_id UUID;
BEGIN
  INSERT INTO public.households (nome) VALUES ('Família') RETURNING id INTO new_household_id;
  INSERT INTO public.profiles (user_id, household_id, display_name)
  VALUES (NEW.id, new_household_id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  PERFORM public.seed_subcategorias(new_household_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Entrar em outro household pelo código de convite ────────────────────────

CREATE OR REPLACE FUNCTION public.entrar_household(_codigo TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT id INTO v_household FROM public.households WHERE codigo_convite = upper(trim(_codigo));
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'Código de convite não encontrado' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET household_id = v_household WHERE user_id = auth.uid();
  RETURN v_household;
END;
$$;

REVOKE ALL ON FUNCTION public.entrar_household(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrar_household(TEXT) TO authenticated;

-- ─── RPCs transacionais (SECURITY INVOKER: RLS continua valendo) ─────────────

CREATE OR REPLACE FUNCTION public.inserir_lancamentos(p_lancamentos JSONB)
RETURNS SETOF public.lancamentos
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO public.lancamentos (
    id, household_id, descricao, valor, categoria, mes, ano, data, subcategoria, cartao_id,
    parcelamento_id, parcela_num, recorrencia_id, status, reembolso, responsavel, observacao, origem
  )
  SELECT
    COALESCE(x.id, gen_random_uuid()), public.get_user_household_id(auth.uid()), x.descricao, x.valor,
    x.categoria, x.mes, x.ano, COALESCE(x.data, make_date(x.ano, x.mes + 1, 1)), x.subcategoria, x.cartao_id,
    x.parcelamento_id, x.parcela_num, x.recorrencia_id, COALESCE(x.status, 'pago'), COALESCE(x.reembolso, false),
    x.responsavel, x.observacao, COALESCE(x.origem, 'manual')
  FROM jsonb_to_recordset(p_lancamentos) AS x(
    id UUID, descricao TEXT, valor NUMERIC, categoria TEXT, mes INTEGER, ano INTEGER, data DATE,
    subcategoria TEXT, cartao_id UUID, parcelamento_id UUID, parcela_num INTEGER, recorrencia_id UUID,
    status TEXT, reembolso BOOLEAN, responsavel TEXT, observacao TEXT, origem TEXT
  )
  ON CONFLICT DO NOTHING
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.salvar_parcelamento(
  p_parcelamento JSONB,
  p_lancamentos JSONB DEFAULT '[]'::jsonb,
  p_apagar_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_household UUID := public.get_user_household_id(auth.uid());
  v_id UUID := NULLIF(p_parcelamento->>'id', '')::UUID;
  v_parc public.parcelamentos;
  v_lancs JSONB;
BEGIN
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'Usuário sem household';
  END IF;

  IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.parcelamentos WHERE id = v_id) THEN
    UPDATE public.parcelamentos SET
      descricao = p_parcelamento->>'descricao',
      valor_total = (p_parcelamento->>'valor_total')::NUMERIC,
      parcelas = (p_parcelamento->>'parcelas')::INTEGER,
      parcelas_pagas = COALESCE((p_parcelamento->>'parcelas_pagas')::INTEGER, 0),
      valor_parcela = (p_parcelamento->>'valor_parcela')::NUMERIC,
      cartao_id = NULLIF(p_parcelamento->>'cartao_id', '')::UUID,
      subcategoria = p_parcelamento->>'subcategoria',
      data_compra = NULLIF(p_parcelamento->>'data_compra', '')::DATE,
      primeira_fatura_mes = (p_parcelamento->>'primeira_fatura_mes')::INTEGER,
      primeira_fatura_ano = (p_parcelamento->>'primeira_fatura_ano')::INTEGER,
      quitado = COALESCE((p_parcelamento->>'quitado')::BOOLEAN, false),
      observacao = p_parcelamento->>'observacao'
    WHERE id = v_id
    RETURNING * INTO v_parc;
  ELSE
    INSERT INTO public.parcelamentos (
      id, household_id, descricao, valor_total, parcelas, parcelas_pagas, valor_parcela, cartao_id,
      subcategoria, data_compra, primeira_fatura_mes, primeira_fatura_ano, quitado, observacao
    ) VALUES (
      COALESCE(v_id, gen_random_uuid()), v_household, p_parcelamento->>'descricao',
      (p_parcelamento->>'valor_total')::NUMERIC, (p_parcelamento->>'parcelas')::INTEGER,
      COALESCE((p_parcelamento->>'parcelas_pagas')::INTEGER, 0), (p_parcelamento->>'valor_parcela')::NUMERIC,
      NULLIF(p_parcelamento->>'cartao_id', '')::UUID, p_parcelamento->>'subcategoria',
      NULLIF(p_parcelamento->>'data_compra', '')::DATE, (p_parcelamento->>'primeira_fatura_mes')::INTEGER,
      (p_parcelamento->>'primeira_fatura_ano')::INTEGER, COALESCE((p_parcelamento->>'quitado')::BOOLEAN, false),
      p_parcelamento->>'observacao'
    )
    RETURNING * INTO v_parc;
  END IF;

  IF v_parc.id IS NULL THEN
    RAISE EXCEPTION 'Parcelamento não encontrado ou sem permissão';
  END IF;

  DELETE FROM public.lancamentos WHERE id = ANY(p_apagar_ids);

  WITH ins AS (
    INSERT INTO public.lancamentos (
      household_id, descricao, valor, categoria, mes, ano, data, subcategoria, cartao_id,
      parcelamento_id, parcela_num, status, responsavel, observacao, origem
    )
    SELECT
      v_household, x.descricao, x.valor, 'cartao', x.mes, x.ano, x.data, x.subcategoria, x.cartao_id,
      v_parc.id, x.parcela_num, COALESCE(x.status, 'pago'), x.responsavel, x.observacao, 'parcela'
    FROM jsonb_to_recordset(COALESCE(p_lancamentos, '[]'::jsonb)) AS x(
      descricao TEXT, valor NUMERIC, mes INTEGER, ano INTEGER, data DATE, subcategoria TEXT,
      cartao_id UUID, parcela_num INTEGER, status TEXT, responsavel TEXT, observacao TEXT
    )
    RETURNING *
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) INTO v_lancs FROM ins;

  RETURN jsonb_build_object('parcelamento', to_jsonb(v_parc), 'lancamentos', v_lancs);
END;
$$;

-- Exclui o parcelamento. Lançamentos em p_manter_ids (parcelas já pagas) são desvinculados
-- e preservados; os demais caem pelo ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.excluir_parcelamento(p_id UUID, p_manter_ids UUID[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lancamentos SET parcelamento_id = NULL
    WHERE parcelamento_id = p_id AND id = ANY(p_manter_ids);
  DELETE FROM public.parcelamentos WHERE id = p_id;
END;
$$;

-- ─── Realtime ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'lancamentos', 'parcelamentos', 'prioridades', 'metas', 'cartoes', 'subcategorias',
    'orcamentos', 'recorrencias', 'faturas_pagas', 'aportes'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
