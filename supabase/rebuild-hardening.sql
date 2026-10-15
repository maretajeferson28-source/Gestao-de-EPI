-- A função criada pela opção automática de RLS é um event trigger,
-- não uma RPC para usuários do app.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
  end if;
end $$;
create policy deny_direct_authorizations on public.usuarios_autorizados
  for all to anon,authenticated using(false) with check(false);
do $$
declare t text;
begin
  foreach t in array array['colaboradores','epis','epi_variantes','movimentacoes_epi'] loop
    execute format('drop policy admin_write on public.%I',t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select epi_private.is_admin()))',t);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()))',t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select epi_private.is_admin()))',t);
  end loop;
end $$;
notify pgrst,'reload schema';
