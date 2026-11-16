-- Depósitos (unidades) da empresa. Por enquanto só o cadastro: a tela
-- "Depósitos" do Dashboard (botão "Por Unidade") lista e adiciona.
-- Ler: qualquer usuário autorizado. Gravar: só administrador.
create table if not exists public.depositos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  cidade text,
  endereco text,
  responsavel text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists depositos_nome_unico on public.depositos (lower(trim(nome)));

alter table public.depositos enable row level security;
revoke all on public.depositos from public, anon, authenticated;
grant select, insert, update on public.depositos to authenticated;
grant all on public.depositos to service_role;
drop policy if exists authorized_read on public.depositos;
create policy authorized_read on public.depositos for select to authenticated
  using ((select epi_private.is_authorized()));
drop policy if exists admin_write on public.depositos;
create policy admin_write on public.depositos for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));
