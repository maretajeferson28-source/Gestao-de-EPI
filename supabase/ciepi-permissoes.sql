-- Base CIEPI no perfil: Cadastrar, Editar e Excluir separados (antes era
-- uma regra só, "cadastrar", que também deixava apagar). As regras do
-- administrador não mudam. Inclui o PDF do boletim (bucket ciepi-boletins).
drop policy if exists perfil_write on public.ciepi_registros;
drop policy if exists perfil_insert on public.ciepi_registros;
drop policy if exists perfil_update on public.ciepi_registros;
drop policy if exists perfil_delete on public.ciepi_registros;
-- Quem cadastra também grava o boletim logo depois (update do mesmo registro).
create policy perfil_insert on public.ciepi_registros for insert to authenticated
  with check ((select epi_private.pode_algum('{ciepi.cadastrar}'::text[])));
create policy perfil_update on public.ciepi_registros for update to authenticated
  using ((select epi_private.pode_algum('{ciepi.cadastrar,ciepi.editar}'::text[])))
  with check ((select epi_private.pode_algum('{ciepi.cadastrar,ciepi.editar}'::text[])));
create policy perfil_delete on public.ciepi_registros for delete to authenticated
  using ((select epi_private.pode_algum('{ciepi.excluir}'::text[])));

drop policy if exists ciepi_boletins_perfil_insert on storage.objects;
drop policy if exists ciepi_boletins_perfil_delete on storage.objects;
create policy ciepi_boletins_perfil_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ciepi-boletins' and (select epi_private.pode_algum('{ciepi.cadastrar,ciepi.editar}'::text[])));
-- Apagar o PDF: ao trocar o boletim (editar) ou ao excluir o C.I.
create policy ciepi_boletins_perfil_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ciepi-boletins' and (select epi_private.pode_algum('{ciepi.editar,ciepi.excluir}'::text[])));

notify pgrst, 'reload schema';
