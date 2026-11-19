-- Volta atrás da bota "na sala" (calcado-na-sala.sql e deposito-entrada.sql, 18/11):
-- o Calçado de Segurança volta a ser EPI comum, com estoque pelas notas e
-- entradas manuais, e entrega pelo modo EPI. As salas de uniforme voltam a ter
-- só o − e + por tamanho. Nenhum número é alterado.

create or replace function public.epi_stock_summary(p_busca text default ''::text)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not epi_private.pode_algum(array['notas.consultar','estoque.consultar','programar.consultar','entregar.consultar','pendencias.consultar','dashboard.consultar']) then raise exception 'Somente administradores podem consultar estoque.' using errcode = '42501'; end if;
  with entradas as (
    select epi_id,sum(qtd) as qtd from (
      select i.epi_id,i.quantidade_estoque as qtd from public.nfe_entrada_itens i
      join public.nfe_entradas n on n.id=i.nfe_entrada_id
      where n.status='entrada' and i.quantidade_estoque is not null
      union all
      select m.epi_id,m.quantidade from public.estoque_entradas_manuais m
    ) x join public.epis e on e.id=x.epi_id

    where (coalesce(p_busca,'')='' or public.epi_sem_acento(e.nome) like '%'||public.epi_sem_acento(p_busca)||'%') group by epi_id
  ), saidas as (
    select m.epi_id,sum(m.quantidade) as qtd from public.movimentacoes_epi m left join public.epis e on e.id=m.epi_id
    where m.contabiliza_estoque
      and (coalesce(p_busca,'')='' or public.epi_sem_acento(coalesce(e.nome,m.epi_nome_original,'')) like '%'||public.epi_sem_acento(p_busca)||'%') group by m.epi_id
  ), saldos as (
    select coalesce(a.epi_id,b.epi_id) as epi_id,coalesce(a.qtd,0)-coalesce(b.qtd,0) as saldo from entradas a full join saidas b on b.epi_id=a.epi_id
  ) select jsonb_build_object('entradas',(select coalesce(sum(qtd),0) from entradas),'saidas',(select coalesce(sum(qtd),0) from saidas),
    'saldo',(select coalesce(sum(saldo),0) from saldos),'criticos',(select count(*) from saldos where saldo<=0),
    'pendentes',(select count(*) from public.nfe_entrada_itens i join public.nfe_entradas n on n.id=i.nfe_entrada_id where n.status='entrada' and (i.epi_id is null or i.quantidade_estoque is null)),
    'notas',(select count(*) from public.nfe_entradas where status='entrada')) into v_result;
  return v_result;
end;
$function$;

create or replace function public.epi_stock_por_item(p_busca text default ''::text)
 returns table(epi_id uuid, nome text, entradas numeric, saidas numeric, saldo numeric, minimo numeric)
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
  if auth.uid() is null or not epi_private.pode_algum(array['notas.consultar','estoque.consultar','programar.consultar','entregar.consultar','pendencias.consultar','dashboard.consultar']) then
    raise exception 'Somente administradores podem consultar estoque.' using errcode = '42501';
  end if;
  return query
  with ent as (
    select x.epi_id, sum(x.qtd) as qtd from (
      select i.epi_id, i.quantidade_estoque as qtd from public.nfe_entrada_itens i
      join public.nfe_entradas n on n.id = i.nfe_entrada_id
      where n.status = 'entrada' and i.quantidade_estoque is not null and i.epi_id is not null
      union all
      select m.epi_id, m.quantidade from public.estoque_entradas_manuais m
    ) x group by x.epi_id
  ), sai as (
    select m.epi_id, sum(m.quantidade) as qtd from public.movimentacoes_epi m
    where m.contabiliza_estoque and m.epi_id is not null group by m.epi_id
  )
  select e.id, e.nome, coalesce(ent.qtd, 0), coalesce(sai.qtd, 0), coalesce(ent.qtd, 0) - coalesce(sai.qtd, 0), e.estoque_minimo
  from public.epis e
  left join ent on ent.epi_id = e.id
  left join sai on sai.epi_id = e.id

  where (ent.qtd is not null or sai.qtd is not null or e.estoque_minimo is not null)
    and (coalesce(p_busca, '') = '' or public.epi_sem_acento(e.nome) like '%' || public.epi_sem_acento(p_busca) || '%')
  order by
    case when coalesce(ent.qtd, 0) - coalesce(sai.qtd, 0) <= 0 then 0
         when e.estoque_minimo is not null and coalesce(ent.qtd, 0) - coalesce(sai.qtd, 0) <= e.estoque_minimo then 1
         else 2 end,
    e.nome;
end;
$function$;

create or replace function public.epi_stock_por_ca(p_epi uuid)
 returns table(ca text, entradas numeric, saidas numeric, saldo numeric)
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
  if auth.uid() is null or not epi_private.pode_algum(array['notas.consultar','estoque.consultar','programar.consultar','entregar.consultar','pendencias.consultar','dashboard.consultar']) then
    raise exception 'Somente administradores podem consultar estoque.' using errcode = '42501';
  end if;
  return query
  with mov as (
    select public.epi_ca_norm(i.ca_detectado) as ca, i.quantidade_estoque as ent, 0::numeric as sai
    from public.nfe_entrada_itens i
    join public.nfe_entradas n on n.id = i.nfe_entrada_id
    where n.status = 'entrada' and i.quantidade_estoque is not null and i.epi_id = p_epi
    union all
    select public.epi_ca_norm(m.ca), m.quantidade, 0 from public.estoque_entradas_manuais m where m.epi_id = p_epi
    union all
    select public.epi_ca_norm(m.ca), 0, m.quantidade from public.movimentacoes_epi m
    where m.contabiliza_estoque and m.epi_id = p_epi
  )
  select mov.ca, sum(mov.ent), sum(mov.sai), sum(mov.ent) - sum(mov.sai)
  from mov group by mov.ca
  order by mov.ca nulls last;
end;
$function$;

alter table public.epis drop column if exists estoque_na_sala;

drop function if exists public.deposito_item_entrada(uuid, integer, date, text);
alter table public.deposito_movimentos drop constraint if exists deposito_movimentos_motivo_check;
alter table public.deposito_movimentos add constraint deposito_movimentos_motivo_check
  check (motivo in ('carga_inicial', 'entrada_inicial', 'ajuste', 'entrega', 'estorno'));
alter table public.deposito_movimentos drop column if exists data;
alter table public.deposito_movimentos drop column if exists observacao;

notify pgrst, 'reload schema';
