-- Diagnóstico com rollback: nenhuma conta, autorização ou dado de teste permanece.
begin;
do $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'email','qa-no-access@example.invalid','role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare denied boolean:=false;
begin
  if public.epi_admin_is_admin() or public.epi_user_is_authorized() then raise exception 'Conta externa autorizada.'; end if;
  begin
    insert into public.epis(nome) values('QA_FORBIDDEN');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Escrita sem autorização.'; end if;
  denied:=false;
  begin perform public.epi_admin_list_users(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Lista de usuários exposta.'; end if;
  denied:=false;
  begin perform public.epi_stock_summary(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Estoque exposto.'; end if;
end $$;
reset role;
do $$
begin
  perform set_config('request.jwt.claims',(select jsonb_build_object('sub',gen_random_uuid(),'email',u.email,'role','authenticated')::text
    from public.usuarios_autorizados u where u.admin and u.ativo limit 1),true);
end $$;
set local role authenticated;
do $$
declare v_id uuid; denied boolean:=false;
begin
  if not public.epi_admin_is_admin() then raise exception 'Administrador não reconhecido.'; end if;
  perform public.epi_admin_save_user('qa-reader@example.invalid','QA',true);
  insert into public.epis(nome) values('QA_ACCESS') returning id into v_id;
  if not exists(select 1 from public.epis where id=v_id) then raise exception 'Leitura administrativa falhou.'; end if;
  begin
    perform public.epi_admin_delete_user(lower(auth.jwt()->>'email'));
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'Administrador não protegido.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'email','qa-reader@example.invalid','role','authenticated')::text,true);
  if not public.epi_user_is_authorized() or public.epi_admin_is_admin() then raise exception 'Permissões do leitor inválidas.'; end if;
  if not exists(select 1 from public.epis where id=v_id) then raise exception 'Leitor sem acesso ao catálogo.'; end if;
  denied:=false;
  begin update public.epis set nome='QA_BAD' where id=v_id; exception when insufficient_privilege then denied:=true; end;
  if exists(select 1 from public.epis where nome='QA_BAD') then raise exception 'Leitor modificou catálogo.'; end if;
  denied:=false;
  begin perform public.epi_admin_save_user('qa-escalation@example.invalid','QA',true); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Leitor gerenciou usuários.'; end if;
end $$;
rollback;
select count(*) as synthetic_rows from public.epis where nome like 'QA_%';
