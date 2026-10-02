-- Marco inicial: primeira nota cadastrada; histórico anterior não dá baixa.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='movimentacoes_epi' and column_name='contabiliza_estoque') then
    alter table public.movimentacoes_epi add column contabiliza_estoque boolean not null default true;
    update public.movimentacoes_epi set contabiliza_estoque=false
      where created_at < coalesce((select min(created_at) from public.nfe_entradas),now());
  end if;
end $$;
comment on column public.movimentacoes_epi.contabiliza_estoque is 'False para histórico anterior ao estoque por NF-e; novas saídas dão baixa.';

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
    where m.contabiliza_estoque and (coalesce(p_busca,'')='' or coalesce(e.nome,m.epi_nome_original,'') ilike '%'||p_busca||'%') group by m.epi_id
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
