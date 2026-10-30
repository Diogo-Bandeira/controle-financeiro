-- Recorrências em janela móvel de 6 meses: exceções (mês excluído só uma vez), unicidade por mês da data
-- e RPC transacional para editar a recorrência junto com os lançamentos futuros já gerados.
-- Convenção: mes é 0–11 (Janeiro = 0).

-- ─── recorrencias_excecoes ───────────────────────────────────────────────────
-- mes/ano = mês da data do lançamento (o mesmo que o gerador usa para checar existência).

CREATE TABLE IF NOT EXISTS public.recorrencias_excecoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  recorrencia_id UUID NOT NULL REFERENCES public.recorrencias(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (recorrencia_id, ano, mes)
);

ALTER TABLE public.recorrencias_excecoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view recorrencias_excecoes" ON public.recorrencias_excecoes;
CREATE POLICY "Members can view recorrencias_excecoes" ON public.recorrencias_excecoes FOR SELECT TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Members can insert recorrencias_excecoes" ON public.recorrencias_excecoes;
CREATE POLICY "Members can insert recorrencias_excecoes" ON public.recorrencias_excecoes FOR INSERT TO authenticated
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Members can update recorrencias_excecoes" ON public.recorrencias_excecoes;
CREATE POLICY "Members can update recorrencias_excecoes" ON public.recorrencias_excecoes FOR UPDATE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Members can delete recorrencias_excecoes" ON public.recorrencias_excecoes;
CREATE POLICY "Members can delete recorrencias_excecoes" ON public.recorrencias_excecoes FOR DELETE TO authenticated
  USING (household_id = public.get_user_household_id(auth.uid()));

-- ─── lancamentos: 1 por recorrência por mês da data ──────────────────────────
-- O índice anterior usava (ano, mes) = competência; no cartão ela pode coincidir entre meses de data vizinhos
-- (ex.: mudar o dia de 5 para 1 com fechamento no dia 3), bloqueando edições legítimas. O gerador e as exceções
-- já trabalham por mês da data; o índice passa a seguir a mesma regra.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.lancamentos
    WHERE recorrencia_id IS NOT NULL
    GROUP BY recorrencia_id, date_trunc('month', data::timestamp)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Há lançamentos duplicados da mesma recorrência no mesmo mês de data; resolva antes de aplicar esta migration';
  END IF;
END $$;

DROP INDEX IF EXISTS public.lancamentos_recorrencia_mes_key;
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_recorrencia_mes_data_key
  ON public.lancamentos (recorrencia_id, (date_trunc('month', data::timestamp))) WHERE recorrencia_id IS NOT NULL;

-- ─── RPC: salvar recorrência + atualizar/apagar futuros numa transação ───────
-- SECURITY INVOKER: RLS continua valendo. Só toca lançamentos da própria recorrência.

CREATE OR REPLACE FUNCTION public.atualizar_recorrencia_futuros(
  p_recorrencia JSONB,
  p_lancamentos JSONB DEFAULT '[]'::jsonb,
  p_apagar_ids UUID[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID := NULLIF(p_recorrencia->>'id', '')::UUID;
  v_rec public.recorrencias;
BEGIN
  UPDATE public.recorrencias SET
    descricao = p_recorrencia->>'descricao',
    valor = (p_recorrencia->>'valor')::NUMERIC,
    categoria = p_recorrencia->>'categoria',
    subcategoria = p_recorrencia->>'subcategoria',
    cartao_id = NULLIF(p_recorrencia->>'cartao_id', '')::UUID,
    dia = (p_recorrencia->>'dia')::INTEGER,
    inicio_ano = (p_recorrencia->>'inicio_ano')::INTEGER,
    inicio_mes = (p_recorrencia->>'inicio_mes')::INTEGER,
    fim_ano = (p_recorrencia->>'fim_ano')::INTEGER,
    fim_mes = (p_recorrencia->>'fim_mes')::INTEGER,
    reembolso = COALESCE((p_recorrencia->>'reembolso')::BOOLEAN, false),
    responsavel = p_recorrencia->>'responsavel',
    ativo = COALESCE((p_recorrencia->>'ativo')::BOOLEAN, true)
  WHERE id = v_id
  RETURNING * INTO v_rec;

  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'Recorrência não encontrada ou sem permissão';
  END IF;

  DELETE FROM public.lancamentos WHERE id = ANY(p_apagar_ids) AND recorrencia_id = v_rec.id;

  UPDATE public.lancamentos l SET
    descricao = x.descricao,
    valor = x.valor,
    categoria = x.categoria,
    mes = x.mes,
    ano = x.ano,
    data = x.data,
    subcategoria = x.subcategoria,
    cartao_id = x.cartao_id,
    status = x.status,
    reembolso = COALESCE(x.reembolso, false),
    responsavel = x.responsavel
  FROM jsonb_to_recordset(COALESCE(p_lancamentos, '[]'::jsonb)) AS x(
    id UUID, descricao TEXT, valor NUMERIC, categoria TEXT, mes INTEGER, ano INTEGER, data DATE,
    subcategoria TEXT, cartao_id UUID, status TEXT, reembolso BOOLEAN, responsavel TEXT
  )
  WHERE l.id = x.id AND l.recorrencia_id = v_rec.id;

  RETURN to_jsonb(v_rec);
END;
$$;

-- ─── Realtime ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'recorrencias_excecoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recorrencias_excecoes;
  END IF;
END $$;
