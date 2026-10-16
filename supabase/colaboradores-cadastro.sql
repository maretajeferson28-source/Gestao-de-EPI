-- Cadastro de funcionário (16/10/2026): campos do cadastro padrão e do
-- simplificado. Só acrescenta colunas opcionais; os 83 registros atuais
-- continuam válidos. CPF é guardado só com os 11 dígitos.
alter table public.colaboradores
  add column if not exists cpf text,
  add column if not exists matricula text,
  add column if not exists data_admissao date,
  add column if not exists funcao text,
  add column if not exists cadastro_simplificado boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'colaboradores_cpf_formato') then
    alter table public.colaboradores
      add constraint colaboradores_cpf_formato check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;
end $$;

create unique index if not exists colaboradores_cpf_unico
  on public.colaboradores (cpf) where cpf is not null;

-- O PostgREST passa a enxergar as colunas novas sem reiniciar.
notify pgrst, 'reload schema';
