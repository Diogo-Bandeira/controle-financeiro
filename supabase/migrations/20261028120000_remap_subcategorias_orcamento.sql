-- Remapeia subcategorias antigas (só cartão) para o novo conjunto de 10 categorias de orçamento.
-- alimentacao, lazer, saude, assinaturas, gastos_pessoais mantêm a mesma chave.
UPDATE public.lancamentos SET subcategoria = 'transporte'      WHERE subcategoria = 'gasolina';
UPDATE public.lancamentos SET subcategoria = 'gastos_pessoais' WHERE subcategoria = 'vestuario';
UPDATE public.lancamentos SET subcategoria = 'gastos_extras'   WHERE subcategoria = 'besteiras';
