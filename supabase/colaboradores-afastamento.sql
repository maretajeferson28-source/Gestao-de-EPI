-- Afastamento do funcionário (licença médica etc.): continua ativo e com o
-- histórico, só fica marcado como afastado a partir de uma data.
alter table public.colaboradores
  add column if not exists afastado boolean not null default false,
  add column if not exists afastado_desde date;
notify pgrst,'reload schema';
