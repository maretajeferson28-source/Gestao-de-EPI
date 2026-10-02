-- Verificação transacional: todos os registros sintéticos são desfeitos.
begin;
do $$ begin
  perform set_config('request.jwt.claims',(select jsonb_build_object('sub',a.id,'email',a.email,'role','authenticated')::text
    from auth.users a join public.usuarios_autorizados u on lower(u.email)=lower(a.email)
    where u.admin and u.ativo limit 1),true);
end $$;
set local role authenticated;
do $$
declare
  e uuid;
  n text;
  entry uuid;
  movement uuid;
  historical uuid;
  baseline numeric;
  result jsonb;
  payload jsonb;
  lines jsonb;
  failed boolean := false;
  key text := repeat('9',44);
begin
  select id,nome into e,n from public.epis order by id limit 1;
  if e is null then raise exception 'Catálogo vazio para teste.'; end if;
  baseline := (public.epi_stock_summary()->>'saldo')::numeric;
  insert into public.movimentacoes_epi(data,epi_id,epi_nome_original,quantidade,responsavel,origem,contabiliza_estoque)
    values(current_date-30,e,n,99,'QA_ROLLBACK','QA_ROLLBACK',false) returning id into historical;
  update public.movimentacoes_epi set quantidade=100 where id=historical;
  if (public.epi_stock_summary()->>'saldo')::numeric <> baseline then raise exception 'Histórico afetou o saldo.'; end if;
  payload := jsonb_build_object('chave_acesso',key,'numero','QA_ROLLBACK','serie','1','valor_total',100,'arquivo_nome','qa.xml',
    'xml_original','<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe'||key||'"><det nItem="1"><prod><qCom>10</qCom></prod></det></infNFe></NFe>');
  lines := jsonb_build_array(jsonb_build_object('indice',1,'descricao','QA','quantidade',10,'quantidade_estoque',10,'epi_id',e,'ca_detectado','39707'));
  result := public.epi_save_nfe(payload,lines);
  entry := (result->>'id')::uuid;
  if (public.epi_stock_summary()->>'saldo')::numeric <> baseline+10 then raise exception 'Falha na entrada.'; end if;
  result := public.epi_save_nfe(payload,lines);
  if (result->>'id')::uuid <> entry or (select count(*) from public.nfe_entrada_itens where nfe_entrada_id=entry)<>1 then raise exception 'Duplicação.'; end if;
  begin
    perform public.epi_save_nfe(payload,jsonb_set(lines,'{0,epi_id}','"00000000-0000-0000-0000-000000000000"'::jsonb));
  exception when foreign_key_violation then failed:=true;
  end;
  if not failed or (select sum(quantidade_estoque) from public.nfe_entrada_itens where nfe_entrada_id=entry)<>10 then raise exception 'Falha no rollback atômico.'; end if;
  insert into public.movimentacoes_epi(data,epi_id,epi_nome_original,quantidade,responsavel,origem)
    values(current_date-30,e,n,3,'QA_ROLLBACK','QA_ROLLBACK') returning id into movement;
  if (public.epi_stock_summary()->>'saldo')::numeric<>baseline+7 then raise exception 'Falha na baixa.'; end if;
  update public.movimentacoes_epi set quantidade=5 where id=movement;
  if (public.epi_stock_summary()->>'saldo')::numeric<>baseline+5 then raise exception 'Falha na edição da baixa.'; end if;
  delete from public.movimentacoes_epi where id=movement;
  if (public.epi_stock_summary()->>'saldo')::numeric<>baseline+10 then raise exception 'Falha na devolução da exclusão.'; end if;
  -- Mais de 1.000 linhas: o agregado no banco não sofre limite da Data API.
  insert into public.nfe_entrada_itens(nfe_entrada_id,indice,quantidade,quantidade_estoque,epi_id)
    select entry,s,1,1,e from generate_series(2,1101) s;
  if (public.epi_stock_summary()->>'saldo')::numeric<>baseline+1110 then raise exception 'Agregado incompleto.'; end if;
end $$;
rollback;
select count(*) as notas_sinteticas_restantes from public.nfe_entradas where numero='QA_ROLLBACK';
