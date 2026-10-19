-- Permite editar uma entrada sem nota (a regra de acesso continua só admin).
grant update on public.estoque_entradas_manuais to authenticated;
alter table public.estoque_entradas_manuais add column if not exists updated_at timestamptz;
notify pgrst,'reload schema';
