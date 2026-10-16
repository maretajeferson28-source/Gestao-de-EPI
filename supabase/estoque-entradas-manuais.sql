-- Entradas no estoque sem nota fiscal (saldo inicial, compra sem nota, devolução,
-- doação/transferência). Somam no saldo junto com as notas.
create table if not exists public.estoque_entradas_manuais (
  id uuid primary key default gen_random_uuid(),
  epi_id uuid not null references public.epis(id) on delete restrict,
  variante_id uuid references public.epi_variantes(id) on delete set null,
  ca text,
  quantidade numeric not null check(quantidade>0 and quantidade::text not in ('NaN','Infinity','-Infinity')),
  motivo text not null check(motivo in ('saldo_inicial','compra_sem_nota','devolucao','doacao_transferencia')),
  data date not null default current_date,
  observacao text,
  created_by uuid default auth.uid(),
  created_by_email text default (auth.jwt()->>'email'),
  created_at timestamptz not null default now()
);
create index if not exists estoque_entradas_manuais_epi_idx on public.estoque_entradas_manuais(epi_id);
create index if not exists estoque_entradas_manuais_created_idx on public.estoque_entradas_manuais(created_at desc);

alter table public.estoque_entradas_manuais enable row level security;
revoke all on public.estoque_entradas_manuais from public,anon,authenticated;
grant select,insert,delete on public.estoque_entradas_manuais to authenticated;
grant all on public.estoque_entradas_manuais to service_role;
drop policy if exists admin_access on public.estoque_entradas_manuais;
create policy admin_access on public.estoque_entradas_manuais for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));

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
    where coalesce(p_busca,'')='' or e.nome ilike '%'||p_busca||'%' group by epi_id
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
