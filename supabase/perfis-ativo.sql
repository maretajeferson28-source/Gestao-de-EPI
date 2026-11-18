-- Perfil ativo / desativado (⋯ → Desativar perfil). Perfil desativado não
-- vale: quem está ligado a ele fica como quem não tem perfil.
alter table public.perfis add column if not exists ativo boolean not null default true;
alter table public.perfis add column if not exists desativado_em timestamptz;

create or replace function epi_private.permissoes() returns text[]
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '{}'::text[] else coalesce((
    select case when u.admin then array['*']
                when p.ativo then coalesce(p.permissoes, '{}'::text[])
                else '{}'::text[] end
      from public.usuarios_autorizados u
      left join public.perfis p on p.id = u.perfil_id
     where u.email = lower(auth.jwt()->>'email') and u.ativo
  ), '{}'::text[]) end;
$$;

notify pgrst, 'reload schema';
