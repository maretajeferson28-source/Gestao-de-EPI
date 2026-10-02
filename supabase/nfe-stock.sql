-- Salva XML e itens juntos; o saldo vem das notas e das saídas existentes.
alter table public.nfe_entrada_itens add column if not exists quantidade_estoque numeric;
create index if not exists nfe_entrada_itens_epi_stock_idx on public.nfe_entrada_itens(epi_id);

create or replace function public.epi_save_nfe(p_nota jsonb, p_itens jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_xml xml;
  v_key text := p_nota->>'chave_acesso';
  v_item jsonb;
  v_qtd numeric;
  v_stock numeric;
  v_index integer;
  v_count integer;
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then
    raise exception 'Somente administradores podem salvar notas.' using errcode = '42501';
  end if;
  if v_key is null or v_key !~ '^[0-9]{44}$' then raise exception 'Chave da NF-e inválida.'; end if;
  if coalesce(p_nota->>'xml_original','') = '' then raise exception 'XML original obrigatório.'; end if;
  v_xml := xmlparse(document (p_nota->>'xml_original'));
  if coalesce((xpath('string(//*[local-name()="infNFe"]/@Id)',v_xml))[1]::text,'') <> 'NFe' || v_key then
    raise exception 'A chave não corresponde ao XML.';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Nota sem itens.'; end if;
  v_count := ((xpath('count(//*[local-name()="infNFe"]/*[local-name()="det"])',v_xml))[1]::text)::integer;
  if v_count <> jsonb_array_length(p_itens) then raise exception 'Itens não correspondem ao XML.'; end if;
  if (select count(distinct (x->>'indice')::integer) from jsonb_array_elements(p_itens) x) <> v_count then raise exception 'Índices de itens duplicados.'; end if;
  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_index := (v_item->>'indice')::integer;
    v_qtd := (v_item->>'quantidade')::numeric;
    v_stock := nullif(v_item->>'quantidade_estoque','')::numeric;
    if v_index is null or v_index < 1 or v_index > v_count or v_qtd is null or v_qtd <= 0 or v_qtd::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantidade ou índice inválido.'; end if;
    if v_qtd <> ((xpath(format('string((//*[local-name()="infNFe"]/*[local-name()="det"])[%s]/*[local-name()="prod"]/*[local-name()="qCom"])',v_index),v_xml))[1]::text)::numeric then
      raise exception 'Quantidade do item % diverge do XML.',v_index;
    end if;
    if v_stock is not null and (v_stock <= 0 or v_stock::text in ('NaN','Infinity','-Infinity')) then raise exception 'Quantidade de estoque inválida.'; end if;
    if nullif(v_item->>'epi_id','') is null and v_stock is not null then raise exception 'Vincule o EPI antes de contabilizar estoque.'; end if;
  end loop;
  insert into public.nfe_entradas(chave_acesso,numero,serie,emitente_nome,emitente_documento,data_emissao,valor_total,arquivo_nome,xml_original,status,dados,updated_at)
  values(v_key,p_nota->>'numero',p_nota->>'serie',p_nota->>'emitente_nome',p_nota->>'emitente_documento',nullif(p_nota->>'data_emissao','')::timestamptz,
    (p_nota->>'valor_total')::numeric,p_nota->>'arquivo_nome',p_nota->>'xml_original','entrada',coalesce(p_nota->'dados','{}'::jsonb),now())
  on conflict(chave_acesso) do update set numero=excluded.numero,serie=excluded.serie,emitente_nome=excluded.emitente_nome,
    emitente_documento=excluded.emitente_documento,data_emissao=excluded.data_emissao,valor_total=excluded.valor_total,
    arquivo_nome=excluded.arquivo_nome,xml_original=excluded.xml_original,status='entrada',dados=excluded.dados,updated_at=now()
  returning id into v_id;
  -- A chave única serializa reenvios. Qualquer erro desfaz também o delete.
  delete from public.nfe_entrada_itens where nfe_entrada_id=v_id;
  insert into public.nfe_entrada_itens(nfe_entrada_id,indice,codigo_produto,descricao,ncm,cfop,unidade,quantidade,quantidade_estoque,valor_unitario,valor_total,ca_detectado,epi_id,match_score,dados)
  select v_id,(x->>'indice')::integer,x->>'codigo_produto',x->>'descricao',x->>'ncm',x->>'cfop',x->>'unidade',
    (x->>'quantidade')::numeric,nullif(x->>'quantidade_estoque','')::numeric,coalesce((x->>'valor_unitario')::numeric,0),coalesce((x->>'valor_total')::numeric,0),
    nullif(x->>'ca_detectado',''),nullif(x->>'epi_id','')::uuid,(x->>'match_score')::numeric,coalesce(x->'dados','{}'::jsonb)
  from jsonb_array_elements(p_itens) x;
  return jsonb_build_object('id',v_id,'itens',v_count,'quantidade_estoque',
    (select coalesce(sum(quantidade_estoque),0) from public.nfe_entrada_itens where nfe_entrada_id=v_id),
    'pendentes',(select count(*) from public.nfe_entrada_itens where nfe_entrada_id=v_id and (epi_id is null or quantidade_estoque is null)));
end;
$$;
revoke all on function public.epi_save_nfe(jsonb,jsonb) from public,anon;
grant execute on function public.epi_save_nfe(jsonb,jsonb) to authenticated;

create or replace function public.epi_stock_summary(p_busca text default '')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then raise exception 'Somente administradores podem consultar estoque.' using errcode = '42501'; end if;
  with entradas as (
    select i.epi_id,sum(i.quantidade_estoque) as qtd from public.nfe_entrada_itens i
    join public.nfe_entradas n on n.id=i.nfe_entrada_id join public.epis e on e.id=i.epi_id
    where n.status='entrada' and i.quantidade_estoque is not null and (coalesce(p_busca,'')='' or e.nome ilike '%'||p_busca||'%') group by i.epi_id
  ), saidas as (
    select m.epi_id,sum(m.quantidade) as qtd from public.movimentacoes_epi m left join public.epis e on e.id=m.epi_id
    where coalesce(p_busca,'')='' or coalesce(e.nome,m.epi_nome_original,'') ilike '%'||p_busca||'%' group by m.epi_id
  ), saldos as (
    select coalesce(a.epi_id,b.epi_id) as epi_id,coalesce(a.qtd,0)-coalesce(b.qtd,0) as saldo from entradas a full join saidas b on b.epi_id=a.epi_id
  ) select jsonb_build_object('entradas',(select coalesce(sum(qtd),0) from entradas),'saidas',(select coalesce(sum(qtd),0) from saidas),
    'saldo',(select coalesce(sum(saldo),0) from saldos),'criticos',(select count(*) from saldos where saldo<=0),
    'pendentes',(select count(*) from public.nfe_entrada_itens i join public.nfe_entradas n on n.id=i.nfe_entrada_id where n.status='entrada' and (i.epi_id is null or i.quantidade_estoque is null)),
    'notas',(select count(*) from public.nfe_entradas where status='entrada')) into v_result;
  return v_result;
end;
$$;
revoke all on function public.epi_stock_summary(text) from public,anon;
grant execute on function public.epi_stock_summary(text) to authenticated;
notify pgrst,'reload schema';
