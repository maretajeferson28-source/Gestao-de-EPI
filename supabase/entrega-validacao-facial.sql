-- Validação facial da entrega sem guardar foto: o rosto da hora é comparado
-- com a foto do termo no próprio aparelho e só o resultado fica registrado.
alter table public.movimentacoes_epi
  add column if not exists validacao_facial_ok boolean,
  add column if not exists validacao_facial_semelhanca numeric check (validacao_facial_semelhanca between 0 and 1),
  add column if not exists validacao_termo_id uuid references public.termos_epi(id) on delete set null;
notify pgrst,'reload schema';
