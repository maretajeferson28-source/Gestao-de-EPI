-- Perfis de acesso: cada perfil tem uma lista de permissões (chaves como
-- 'entregas.programar', 'estoque.ver') e cada usuário autorizado pode ser
-- ligado a um perfil. Administrador continua com tudo ('*').
-- Etapa 1: só cadastro e vínculo. As regras do app e do banco ainda não
-- consultam o perfil (isso vem na etapa 2), então nada muda para ninguém.
create table if not exists public.perfis (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  permissoes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists perfis_nome_unico on public.perfis (lower(trim(nome)));

alter table public.perfis enable row level security;
revoke all on public.perfis from public, anon, authenticated;
grant select, insert, update, delete on public.perfis to authenticated;
grant all on public.perfis to service_role;
drop policy if exists authorized_read on public.perfis;
create policy authorized_read on public.perfis for select to authenticated
  using ((select epi_private.is_authorized()));
drop policy if exists admin_write on public.perfis;
create policy admin_write on public.perfis for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));

alter table public.usuarios_autorizados
  add column if not exists perfil_id uuid references public.perfis(id) on delete set null;

-- Permissões de quem está logado: '*' para administrador; as do perfil para os outros.
create or replace function epi_private.permissoes() returns text[]
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '{}'::text[] else coalesce((
    select case when u.admin then array['*'] else coalesce(p.permissoes, '{}'::text[]) end
      from public.usuarios_autorizados u
      left join public.perfis p on p.id = u.perfil_id
     where u.email = lower(auth.jwt()->>'email') and u.ativo
  ), '{}'::text[]) end;
$$;
create or replace function epi_private.pode(p_chave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select '*' = any(epi_private.permissoes()) or p_chave = any(epi_private.permissoes());
$$;
create or replace function public.epi_minhas_permissoes() returns text[]
language sql stable security invoker set search_path = '' as $$ select epi_private.permissoes(); $$;
revoke all on function public.epi_minhas_permissoes() from public, anon;
grant execute on function public.epi_minhas_permissoes() to authenticated;

-- Liga (ou tira) o perfil de um usuário. Conta de administrador fica protegida.
create or replace function epi_private.admin_set_user_perfil(p_email text, p_perfil uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not epi_private.is_admin() then raise exception 'Somente administradores.' using errcode = '42501'; end if;
  if exists (select 1 from public.usuarios_autorizados where email = lower(trim(p_email)) and admin) then
    raise exception 'Administrador protegido: ele já tem acesso a tudo.';
  end if;
  update public.usuarios_autorizados set perfil_id = p_perfil, updated_at = now() where email = lower(trim(p_email));
end;
$$;
create or replace function public.epi_admin_set_user_perfil(p_email text, p_perfil uuid) returns void
language sql security invoker set search_path = '' as $$ select epi_private.admin_set_user_perfil(p_email, p_perfil); $$;
revoke all on function public.epi_admin_set_user_perfil(text, uuid) from public, anon;
grant execute on function public.epi_admin_set_user_perfil(text, uuid) to authenticated;

notify pgrst, 'reload schema';
