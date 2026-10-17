-- A Base CIEPI guarda os mesmos campos que o CAEPI devolve para um C.A.
-- (o prontuário continua com a estrutura de sempre). A tabela estava vazia.
do $$
begin
  if exists (select 1 from public.ciepi_registros) then
    raise exception 'ciepi_registros não está vazia; revisar antes de trocar as colunas.';
  end if;
end $$;
alter table public.ciepi_registros
  drop column if exists peso,
  drop column if exists material,
  drop column if exists vida_util,
  drop column if exists dimensoes,
  drop column if exists utilizacao,
  add column if not exists cnpj text,
  add column if not exists marca text,
  add column if not exists situacao text;
notify pgrst,'reload schema';
