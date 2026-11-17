-- Perfis, etapa 2: o banco passa a obedecer às permissões do perfil.
-- Só ACRESCENTA regras "perfil_*" ao lado das do administrador (as do
-- administrador ficam como estão, e no Postgres as regras se somam com OU).
-- Chaves = as do modal de perfis (js/perfis.js), "tela.acao".
-- Leitura de colaboradores, EPIs, movimentações, depósitos e CIEPI já era
-- liberada para todo usuário autorizado e continua igual.

create or replace function epi_private.pode_algum(p_chaves text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select '*' = any(epi_private.permissoes()) or epi_private.permissoes() && p_chaves;
$$;
grant execute on function epi_private.pode_algum(text[]) to authenticated;

-- Cria (ou recria) uma regra de perfil numa tabela.
create or replace function pg_temp.regra(p_tab text, p_nome text, p_cmd text, p_chaves text[]) returns void
language plpgsql as $$
declare v text := format('((select epi_private.pode_algum(%L::text[])))', p_chaves);
begin
  execute format('drop policy if exists %I on public.%I', p_nome, p_tab);
  if p_cmd = 'INSERT' then
    execute format('create policy %I on public.%I for insert to authenticated with check %s', p_nome, p_tab, v);
  elsif p_cmd = 'SELECT' or p_cmd = 'DELETE' then
    execute format('create policy %I on public.%I for %s to authenticated using %s', p_nome, p_tab, p_cmd, v);
  else
    execute format('create policy %I on public.%I for %s to authenticated using %s with check %s', p_nome, p_tab, p_cmd, v, v);
  end if;
end $$;

-- Cadastros
select pg_temp.regra('colaboradores', 'perfil_insert', 'INSERT', '{colaboradores.cadastrar}');
select pg_temp.regra('colaboradores', 'perfil_update', 'UPDATE', '{colaboradores.editar,colaboradores.desativar}');
select pg_temp.regra('colaboradores', 'perfil_delete', 'DELETE', '{colaboradores.excluir}');
select pg_temp.regra('epis', 'perfil_insert', 'INSERT', '{epis.cadastrar}');
select pg_temp.regra('epis', 'perfil_update', 'UPDATE', '{epis.editar,epis.desativar}');
select pg_temp.regra('epis', 'perfil_delete', 'DELETE', '{epis.excluir}');
select pg_temp.regra('epi_variantes', 'perfil_insert', 'INSERT', '{epis.cadastrar,epis.editar}');
select pg_temp.regra('epi_variantes', 'perfil_update', 'UPDATE', '{epis.editar,epis.desativar}');
select pg_temp.regra('epi_variantes', 'perfil_delete', 'DELETE', '{epis.editar,epis.excluir}');
select pg_temp.regra('ciepi_registros', 'perfil_write', 'ALL', '{ciepi.cadastrar}');

-- Entregas
select pg_temp.regra('movimentacoes_epi', 'perfil_insert', 'INSERT', '{movimentacoes.lancar,entregar.entregar}');
select pg_temp.regra('movimentacoes_epi', 'perfil_update', 'UPDATE', '{movimentacoes.editar}');
select pg_temp.regra('movimentacoes_epi', 'perfil_delete', 'DELETE', '{movimentacoes.excluir}');
select pg_temp.regra(t, 'perfil_select', 'SELECT', '{programar.consultar,entregar.consultar,dashboard.consultar,pendencias.consultar}') from unnest(array['entregas_programadas','entregas_programadas_itens']) t;
select pg_temp.regra(t, 'perfil_insert', 'INSERT', '{programar.programar}') from unnest(array['entregas_programadas','entregas_programadas_itens']) t;
select pg_temp.regra(t, 'perfil_update', 'UPDATE', '{programar.programar,programar.cancelar,entregar.entregar}') from unnest(array['entregas_programadas','entregas_programadas_itens']) t;
select pg_temp.regra(t, 'perfil_delete', 'DELETE', '{programar.programar,programar.cancelar}') from unnest(array['entregas_programadas','entregas_programadas_itens']) t;
select pg_temp.regra('ordens_servico', 'perfil_select', 'SELECT', '{programar.consultar,entregar.consultar,movimentacoes.consultar}');
select pg_temp.regra('ordens_servico', 'perfil_insert', 'INSERT', '{programar.programar,entregar.entregar}');
select pg_temp.regra('ordens_servico', 'perfil_update', 'UPDATE', '{programar.programar,entregar.entregar}');
select pg_temp.regra('ordens_servico', 'perfil_delete', 'DELETE', '{programar.programar}');
select pg_temp.regra('termos_epi', 'perfil_select', 'SELECT', '{entregar.consultar,movimentacoes.consultar,colaboradores.consultar}');
select pg_temp.regra('termos_epi', 'perfil_insert', 'INSERT', '{entregar.entregar,movimentacoes.lancar}');
select pg_temp.regra('termos_epi', 'perfil_update', 'UPDATE', '{entregar.entregar,movimentacoes.lancar}');
select pg_temp.regra('termos_epi', 'perfil_delete', 'DELETE', '{movimentacoes.excluir}');

-- Estoque de EPI e notas (o saldo é lido por estoque, programar, entregar,
-- pendências e dashboard)
select pg_temp.regra('estoque_entradas_manuais', 'perfil_select', 'SELECT', '{estoque.consultar,programar.consultar,entregar.consultar,pendencias.consultar,dashboard.consultar}');
select pg_temp.regra('estoque_entradas_manuais', 'perfil_insert', 'INSERT', '{estoque.entrada,estoque.ajustar}');
select pg_temp.regra('estoque_entradas_manuais', 'perfil_update', 'UPDATE', '{estoque.ajustar}');
select pg_temp.regra('estoque_entradas_manuais', 'perfil_delete', 'DELETE', '{estoque.ajustar}');
select pg_temp.regra(t, 'perfil_select', 'SELECT', '{notas.consultar,estoque.consultar,programar.consultar,entregar.consultar,pendencias.consultar,dashboard.consultar}') from unnest(array['nfe_entradas','nfe_entrada_itens']) t;
select pg_temp.regra(t, 'perfil_write', 'ALL', '{notas.importar}') from unnest(array['nfe_entradas','nfe_entrada_itens']) t;

-- Uniformes (depósitos). A entrega e o estorno de uniforme mexem no saldo da
-- sala pelo gatilho, por isso entregar/lançar/excluir movimentação entram aqui.
select pg_temp.regra('depositos', 'perfil_write', 'ALL', '{uniformes.cadastrar}');
select pg_temp.regra('deposito_itens', 'perfil_insert', 'INSERT', '{uniformes.cadastrar,uniformes.editar}');
select pg_temp.regra('deposito_itens', 'perfil_update', 'UPDATE', '{uniformes.ajustar,uniformes.editar,entregar.entregar,movimentacoes.lancar,movimentacoes.excluir}');
select pg_temp.regra('deposito_itens', 'perfil_delete', 'DELETE', '{uniformes.editar}');
select pg_temp.regra('deposito_movimentos', 'perfil_insert', 'INSERT', '{uniformes.ajustar,uniformes.cadastrar,uniformes.editar,entregar.entregar,movimentacoes.lancar,movimentacoes.excluir}');

-- Funções que hoje exigem administrador passam a aceitar a permissão certa.
do $$
declare
  r record; v_def text; v_novo text;
  v_saldo text := 'array[''notas.consultar'',''estoque.consultar'',''programar.consultar'',''entregar.consultar'',''pendencias.consultar'',''dashboard.consultar'']';
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('epi_stock_summary','epi_stock_por_item','epi_stock_por_ca','epi_programar_entrega','epi_confirmar_entrega','epi_save_nfe')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_novo := replace(v_def, 'not public.epi_admin_is_admin()', 'not epi_private.pode_algum(' || case r.proname
      when 'epi_programar_entrega' then 'array[''programar.programar'']'
      when 'epi_confirmar_entrega' then 'array[''entregar.entregar'']'
      when 'epi_save_nfe' then 'array[''notas.importar'']'
      else v_saldo end || ')');
    if v_novo = v_def then raise exception 'Checagem de administrador não encontrada em %', r.proname; end if;
    execute v_novo;
  end loop;
end $$;

notify pgrst, 'reload schema';
