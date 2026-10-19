-- Busca do estoque sem diferenciar acentos nem maiúsculas ("oculos" acha "Óculos").
create or replace function public.epi_sem_acento(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(translate(coalesce(t,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;
revoke all on function public.epi_sem_acento(text) from public,anon;
grant execute on function public.epi_sem_acento(text) to authenticated;

create or replace function public.epi_stock_summary(p_busca text default '')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then raise exception 'Somente administradores podem consultar estoque.' using errcode = '42501'; end if;
  with entradas as (
    select epi_id,sum(qtd) as qtd from (
      select i.epi_id,i.quantidade_estoque as qtd from public.nfe_entrada_itens i
      join public.nfe_entradas n on n.id=i.nfe_entrada_id
      where n.status='entrada' and i.quantidade_estoque is not null
      union all
      select m.epi_id,m.quantidade from public.estoque_entradas_manuais m
    ) x join public.epis e on e.id=x.epi_id
    where coalesce(p_busca,'')='' or public.epi_sem_acento(e.nome) like '%'||public.epi_sem_acento(p_busca)||'%' group by epi_id
  ), saidas as (
    select m.epi_id,sum(m.quantidade) as qtd from public.movimentacoes_epi m left join public.epis e on e.id=m.epi_id
    where m.contabiliza_estoque and (coalesce(p_busca,'')='' or public.epi_sem_acento(coalesce(e.nome,m.epi_nome_original,'')) like '%'||public.epi_sem_acento(p_busca)||'%') group by m.epi_id
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
