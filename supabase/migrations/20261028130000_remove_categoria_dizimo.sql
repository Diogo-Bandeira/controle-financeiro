-- Remove a categoria 'dizimo': lançamentos existentes viram 'conta_fixa'.
UPDATE public.lancamentos SET categoria = 'conta_fixa' WHERE categoria = 'dizimo';

ALTER TABLE public.lancamentos DROP CONSTRAINT IF EXISTS lancamentos_categoria_check;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_categoria_check
  CHECK (categoria IN ('entrada', 'conta_fixa', 'cartao', 'variavel'));
