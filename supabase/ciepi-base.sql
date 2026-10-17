-- Base CIEPI: cadastro interno (código CI-0001…) para itens sem C.A., montado a
-- partir do boletim técnico. O prontuário busca aqui como busca no CAEPI.
create sequence if not exists public.ciepi_ci_seq;

create table if not exists public.ciepi_registros (
  id uuid primary key default gen_random_uuid(),
  ci text not null unique default ('CI-' || lpad(nextval('public.ciepi_ci_seq')::text, 4, '0')),
  nome text not null check(length(trim(nome))>0),
  fabricante text,
  peso text,
  material text,
  referencia text,
  data_validade date,
  vida_util text,
  norma text,
  descricao text,
  dimensoes text,
  utilizacao text,
  boletim_path text,
  boletim_nome text,
  ativo boolean not null default true,
  created_by_email text default (auth.jwt()->>'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence public.ciepi_ci_seq owned by public.ciepi_registros.ci;

alter table public.ciepi_registros enable row level security;
revoke all on public.ciepi_registros from public,anon,authenticated;
grant select,insert,update,delete on public.ciepi_registros to authenticated;
grant usage on sequence public.ciepi_ci_seq to authenticated;
grant all on public.ciepi_registros to service_role;
drop policy if exists authorized_read on public.ciepi_registros;
drop policy if exists admin_write on public.ciepi_registros;
create policy authorized_read on public.ciepi_registros for select to authenticated
  using ((select epi_private.is_authorized()));
create policy admin_write on public.ciepi_registros for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));

-- Boletins técnicos em PDF, privados (lidos por link assinado).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('ciepi-boletins','ciepi-boletins',false,10485760,array['application/pdf'])
  on conflict(id) do nothing;
drop policy if exists ciepi_boletins_read on storage.objects;
drop policy if exists ciepi_boletins_admin on storage.objects;
create policy ciepi_boletins_read on storage.objects for select to authenticated
  using(bucket_id='ciepi-boletins' and (select epi_private.is_authorized()));
create policy ciepi_boletins_admin on storage.objects for all to authenticated
  using(bucket_id='ciepi-boletins' and (select epi_private.is_admin()))
  with check(bucket_id='ciepi-boletins' and (select epi_private.is_admin()));

notify pgrst,'reload schema';
