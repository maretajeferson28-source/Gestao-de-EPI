-- Data em que o funcionário foi desativado (editável no cadastro, como a do afastamento).
alter table public.colaboradores add column if not exists desativado_desde date;
notify pgrst,'reload schema';
