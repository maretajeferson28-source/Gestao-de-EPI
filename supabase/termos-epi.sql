-- Termo de responsabilidade do EPI assinado no celular: guarda o texto como foi
-- aceito, a foto do rosto (biometria facial) e a assinatura desenhada.
-- Biometria é dado sensível (LGPD): só administrador lê e grava.
create table if not exists public.termos_epi (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  texto text not null,
  selfie_path text,
  assinatura_path text,
  assinado_em timestamptz not null default now(),
  dispositivo text,
  created_by_email text default (auth.jwt()->>'email'),
  created_at timestamptz not null default now()
);
create index if not exists termos_epi_colaborador_idx on public.termos_epi(colaborador_id, assinado_em desc);

alter table public.termos_epi enable row level security;
revoke all on public.termos_epi from public,anon,authenticated;
grant select,insert,update,delete on public.termos_epi to authenticated;
grant all on public.termos_epi to service_role;
drop policy if exists admin_access on public.termos_epi;
create policy admin_access on public.termos_epi for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('termos-epi','termos-epi',false,5242880,array['image/jpeg','image/png','image/webp'])
  on conflict(id) do nothing;
drop policy if exists termos_epi_admin on storage.objects;
create policy termos_epi_admin on storage.objects for all to authenticated
  using(bucket_id='termos-epi' and (select epi_private.is_admin()))
  with check(bucket_id='termos-epi' and (select epi_private.is_admin()));

notify pgrst,'reload schema';
