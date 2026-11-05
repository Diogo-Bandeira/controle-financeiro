-- Bot do Telegram: vínculo de chats a households, códigos de vínculo, log mínimo de mensagens (desfazer e
-- deduplicar), pendências de perguntas, uso diário da IA e RPCs com household explícito para a Edge Function
-- (service role). Convenção: mes é 0–11 (Janeiro = 0).

-- ─── lancamentos.origem: 'telegram' ──────────────────────────────────────────

ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_origem_check;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_origem_check
  CHECK (origem IN ('manual', 'parcela', 'recorrente', 'importado', 'telegram'));

-- ─── telegram_vinculos ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_vinculos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL UNIQUE,
  telegram_user_id BIGINT,
  telegram_username TEXT,
  nome_exibicao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_vinculos_household_idx ON public.telegram_vinculos (household_id);

-- ─── telegram_codigos (6 caracteres sem 0/O/1/I, válidos por 10 minutos) ─────

CREATE TABLE IF NOT EXISTS public.telegram_codigos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL UNIQUE CHECK (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  expira_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + interval '10 minutes',
  usado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ─── telegram_mensagens (sem o texto da mensagem) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  update_id BIGINT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('texto', 'audio', 'foto', 'comando', 'callback')),
  usou_ia BOOLEAN NOT NULL DEFAULT false,
  lancamento_ids UUID[] NOT NULL DEFAULT '{}',
  parcelamento_id UUID REFERENCES public.parcelamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_mensagens_chat_created_idx ON public.telegram_mensagens (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS telegram_mensagens_created_idx ON public.telegram_mensagens (created_at);

-- ─── telegram_pendencias (lançamento incompleto aguardando resposta nos botões) ──

CREATE TABLE IF NOT EXISTS public.telegram_pendencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  expira_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + interval '30 minutes',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_pendencias_chat_idx ON public.telegram_pendencias (chat_id);

-- ─── ia_uso_diario (dia no fuso de São Paulo) ────────────────────────────────
-- limite_diario_atingido: 429 de cota diária. 429 de cota por minuto só conta em erros_429.

CREATE TABLE IF NOT EXISTS public.ia_uso_diario (
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  dia DATE NOT NULL,
  chamadas INTEGER NOT NULL DEFAULT 0,
  erros_429 INTEGER NOT NULL DEFAULT 0,
  limite_diario_atingido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, dia)
);

DROP TRIGGER IF EXISTS update_ia_uso_diario_updated_at ON public.ia_uso_diario;
CREATE TRIGGER update_ia_uso_diario_updated_at BEFORE UPDATE ON public.ia_uso_diario
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- codigos e pendencias: sem policies (só RPC SECURITY DEFINER e service role).
-- mensagens e uso da IA: leitura pelos membros. Escrita só pela Edge Function (service role).

ALTER TABLE public.telegram_vinculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_uso_diario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view telegram_vinculos" ON public.telegram_vinculos;
CREATE POLICY "Members can view telegram_vinculos" ON public.telegram_vinculos FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Desativar o próprio vínculo: só a coluna ativo é atualizável e só para false.
DROP POLICY IF EXISTS "Users can deactivate own telegram_vinculos" ON public.telegram_vinculos;
CREATE POLICY "Users can deactivate own telegram_vinculos" ON public.telegram_vinculos FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND household_id = public.get_user_household_id(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND ativo = false);

REVOKE INSERT, UPDATE, DELETE ON public.telegram_vinculos FROM anon, authenticated;
GRANT UPDATE (ativo) ON public.telegram_vinculos TO authenticated;
REVOKE ALL ON public.telegram_codigos, public.telegram_pendencias FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.telegram_mensagens, public.ia_uso_diario FROM anon, authenticated;

DROP POLICY IF EXISTS "Members can view telegram_mensagens" ON public.telegram_mensagens;
CREATE POLICY "Members can view telegram_mensagens" ON public.telegram_mensagens FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Members can view ia_uso_diario" ON public.ia_uso_diario;
CREATE POLICY "Members can view ia_uso_diario" ON public.ia_uso_diario FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

-- ─── Código de vínculo (usuário autenticado) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.gerar_codigo_telegram()
RETURNS TABLE (codigo TEXT, expira_em TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_alfabeto CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_household UUID := public.get_user_household_id(auth.uid());
  v_bytes BYTEA;
  v_codigo TEXT;
BEGIN
  IF auth.uid() IS NULL OR v_household IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  DELETE FROM public.telegram_codigos c WHERE c.user_id = auth.uid() AND c.usado_em IS NULL;

  LOOP
    -- gen_random_uuid() (v4) usa gerador criptográfico; 32 símbolos → 5 bits por caractere.
    v_bytes := uuid_send(gen_random_uuid());
    SELECT string_agg(substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1), '' ORDER BY i)
      INTO v_codigo FROM generate_series(0, 5) AS i;
    BEGIN
      INSERT INTO public.telegram_codigos (household_id, user_id, codigo)
        VALUES (v_household, auth.uid(), v_codigo);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- colisão: tenta outro
    END;
  END LOOP;

  RETURN QUERY SELECT c.codigo, c.expira_em FROM public.telegram_codigos c WHERE c.codigo = v_codigo;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_codigo_telegram() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_codigo_telegram() TO authenticated;

-- ─── Núcleo das RPCs de escrita com household explícito ──────────────────────
-- SECURITY INVOKER: chamadas pelo app (via inserir_lancamentos/salvar_parcelamento) continuam sob RLS;
-- chamadas pelas variantes bot_* (SECURITY DEFINER) rodam como o dono e dependem do filtro por household.

CREATE OR REPLACE FUNCTION public.inserir_lancamentos_no_household(p_household UUID, p_lancamentos JSONB)
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
    COALESCE(x.id, gen_random_uuid()), p_household, x.descricao, x.valor,
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

CREATE OR REPLACE FUNCTION public.inserir_lancamentos(p_lancamentos JSONB)
RETURNS SETOF public.lancamentos
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.inserir_lancamentos_no_household(public.get_user_household_id(auth.uid()), p_lancamentos);
$$;

CREATE OR REPLACE FUNCTION public.salvar_parcelamento_no_household(
  p_household UUID,
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
  v_id UUID := NULLIF(p_parcelamento->>'id', '')::UUID;
  v_parc public.parcelamentos;
  v_lancs JSONB;
BEGIN
  IF p_household IS NULL THEN
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
    WHERE id = v_id AND household_id = p_household
    RETURNING * INTO v_parc;
  ELSE
    INSERT INTO public.parcelamentos (
      id, household_id, descricao, valor_total, parcelas, parcelas_pagas, valor_parcela, cartao_id,
      subcategoria, data_compra, primeira_fatura_mes, primeira_fatura_ano, quitado, observacao
    ) VALUES (
      COALESCE(v_id, gen_random_uuid()), p_household, p_parcelamento->>'descricao',
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

  DELETE FROM public.lancamentos WHERE id = ANY(p_apagar_ids) AND household_id = p_household;

  WITH ins AS (
    INSERT INTO public.lancamentos (
      household_id, descricao, valor, categoria, mes, ano, data, subcategoria, cartao_id,
      parcelamento_id, parcela_num, status, responsavel, observacao, origem
    )
    SELECT
      p_household, x.descricao, x.valor, 'cartao', x.mes, x.ano, x.data, x.subcategoria, x.cartao_id,
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

CREATE OR REPLACE FUNCTION public.salvar_parcelamento(
  p_parcelamento JSONB,
  p_lancamentos JSONB DEFAULT '[]'::jsonb,
  p_apagar_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.salvar_parcelamento_no_household(
    public.get_user_household_id(auth.uid()), p_parcelamento, p_lancamentos, p_apagar_ids
  );
$$;

REVOKE ALL ON FUNCTION public.inserir_lancamentos_no_household(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.salvar_parcelamento_no_household(UUID, JSONB, JSONB, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inserir_lancamentos_no_household(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_parcelamento_no_household(UUID, JSONB, JSONB, UUID[]) TO authenticated, service_role;

-- ─── RPCs do bot (só service_role) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bot_inserir_lancamentos(p_household_id UUID, p_lancamentos JSONB)
RETURNS SETOF public.lancamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'household obrigatório';
  END IF;
  RETURN QUERY SELECT * FROM public.inserir_lancamentos_no_household(p_household_id, p_lancamentos);
END;
$$;

CREATE OR REPLACE FUNCTION public.bot_salvar_parcelamento(
  p_household_id UUID,
  p_parcelamento JSONB,
  p_lancamentos JSONB DEFAULT '[]'::jsonb,
  p_apagar_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.salvar_parcelamento_no_household(p_household_id, p_parcelamento, p_lancamentos, p_apagar_ids);
$$;

-- Desfazer: apaga exatamente os lançamentos criados pela mensagem e os parcelamentos deles (p_parcelamento_id
-- e os referenciados pelas parcelas em p_ids), tudo filtrado pelo household. Devolve quantos lançamentos saíram.
CREATE OR REPLACE FUNCTION public.bot_excluir_lancamentos(
  p_household_id UUID,
  p_ids UUID[] DEFAULT '{}',
  p_parcelamento_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM public.lancamentos WHERE household_id = p_household_id AND id = ANY(p_ids);

  DELETE FROM public.parcelamentos p
  WHERE p.household_id = p_household_id
    AND (p.id = p_parcelamento_id OR p.id IN (
      SELECT l.parcelamento_id FROM public.lancamentos l
      WHERE l.household_id = p_household_id AND l.id = ANY(p_ids) AND l.parcelamento_id IS NOT NULL
    ));
  DELETE FROM public.lancamentos WHERE household_id = p_household_id AND id = ANY(p_ids);
  RETURN v_total;
END;
$$;

-- Vincula o chat pelo código: valida (existe, não expirou, não usado), cria/reativa o vínculo e marca o código.
CREATE OR REPLACE FUNCTION public.bot_vincular_telegram(
  p_codigo TEXT,
  p_chat_id BIGINT,
  p_telegram_user_id BIGINT,
  p_telegram_username TEXT,
  p_nome_telegram TEXT
)
RETURNS public.telegram_vinculos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo public.telegram_codigos;
  v_nome TEXT;
  v_vinculo public.telegram_vinculos;
BEGIN
  SELECT * INTO v_codigo FROM public.telegram_codigos
    WHERE codigo = upper(trim(p_codigo)) AND usado_em IS NULL AND expira_em > now()
    FOR UPDATE;
  IF v_codigo.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), p_nome_telegram) INTO v_nome
    FROM public.profiles WHERE user_id = v_codigo.user_id;

  INSERT INTO public.telegram_vinculos (household_id, user_id, chat_id, telegram_user_id, telegram_username, nome_exibicao, ativo)
  VALUES (v_codigo.household_id, v_codigo.user_id, p_chat_id, p_telegram_user_id, p_telegram_username, COALESCE(v_nome, p_nome_telegram), true)
  ON CONFLICT (chat_id) DO UPDATE SET
    household_id = EXCLUDED.household_id,
    user_id = EXCLUDED.user_id,
    telegram_user_id = EXCLUDED.telegram_user_id,
    telegram_username = EXCLUDED.telegram_username,
    nome_exibicao = EXCLUDED.nome_exibicao,
    ativo = true,
    created_at = now()
  RETURNING * INTO v_vinculo;

  UPDATE public.telegram_codigos SET usado_em = now() WHERE id = v_codigo.id;
  RETURN v_vinculo;
END;
$$;

-- Soma o uso da IA no dia (fuso de São Paulo).
CREATE OR REPLACE FUNCTION public.bot_registrar_uso_ia(
  p_household_id UUID,
  p_chamadas INTEGER DEFAULT 0,
  p_erros_429 INTEGER DEFAULT 0,
  p_limite_diario BOOLEAN DEFAULT false
)
RETURNS public.ia_uso_diario
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ia_uso_diario AS u (household_id, dia, chamadas, erros_429, limite_diario_atingido)
  VALUES (p_household_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date, p_chamadas, p_erros_429, p_limite_diario)
  ON CONFLICT (household_id, dia) DO UPDATE SET
    chamadas = u.chamadas + EXCLUDED.chamadas,
    erros_429 = u.erros_429 + EXCLUDED.erros_429,
    limite_diario_atingido = u.limite_diario_atingido OR EXCLUDED.limite_diario_atingido
  RETURNING *;
$$;

-- Limpeza oportunista: mensagens > 30 dias, pendências expiradas, códigos vencidos há mais de 1 dia.
CREATE OR REPLACE FUNCTION public.bot_limpar_antigos()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.telegram_mensagens WHERE created_at < now() - interval '30 days';
  DELETE FROM public.telegram_pendencias WHERE expira_em < now();
  DELETE FROM public.telegram_codigos WHERE expira_em < now() - interval '1 day';
$$;

DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.bot_inserir_lancamentos(UUID, JSONB)',
    'public.bot_salvar_parcelamento(UUID, JSONB, JSONB, UUID[])',
    'public.bot_excluir_lancamentos(UUID, UUID[], UUID)',
    'public.bot_vincular_telegram(TEXT, BIGINT, BIGINT, TEXT, TEXT)',
    'public.bot_registrar_uso_ia(UUID, INTEGER, INTEGER, BOOLEAN)',
    'public.bot_limpar_antigos()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ─── Realtime: Configurações acompanha o vínculo criado pelo bot ─────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'telegram_vinculos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_vinculos;
  END IF;
END $$;
