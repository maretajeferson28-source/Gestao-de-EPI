-- Lista de usuários da Administração com data de cadastro e último acesso
-- (último login no GoTrue). Só administrador. A função antiga
-- (epi_admin_list_users) continua existindo, sem mudança.
create or replace function epi_private.admin_list_usuarios()
returns table(email text, nome text, ativo boolean, admin boolean, perfil_id uuid, telefone text,
              cadastro timestamptz, ultimo_acesso timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not epi_private.is_admin() then raise exception 'Somente administradores.' using errcode = '42501'; end if;
  return query
    select u.email, u.nome, u.ativo, u.admin, u.perfil_id, u.telefone, u.created_at,
           (select max(a.last_sign_in_at) from auth.users a where lower(a.email) = u.email)
      from public.usuarios_autorizados u
     order by u.nome nulls last, u.email;
end;
$$;
create or replace function public.epi_admin_list_usuarios()
returns table(email text, nome text, ativo boolean, admin boolean, perfil_id uuid, telefone text,
              cadastro timestamptz, ultimo_acesso timestamptz)
language sql security invoker set search_path = '' as $$ select * from epi_private.admin_list_usuarios(); $$;
revoke all on function public.epi_admin_list_usuarios() from public, anon;
grant execute on function public.epi_admin_list_usuarios() to authenticated;
notify pgrst, 'reload schema';
