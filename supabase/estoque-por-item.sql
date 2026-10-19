-- Saldo de cada EPI (entradas das notas + entradas manuais − saídas que
-- contam para o estoque), com o mesmo filtro da busca do Estoque.
-- Só aparecem itens com alguma entrada ou saída contabilizada.
create or replace function public.epi_stock_por_item(p_busca text default '')
returns table(epi_id uuid, nome text, entradas numeric, saidas numeric, saldo numeric)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then
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
  select e.id, e.nome, coalesce(ent.qtd, 0), coalesce(sai.qtd, 0), coalesce(ent.qtd, 0) - coalesce(sai.qtd, 0)
  from public.epis e
  left join ent on ent.epi_id = e.id
  left join sai on sai.epi_id = e.id
  where (ent.qtd is not null or sai.qtd is not null)
    and (coalesce(p_busca, '') = '' or public.epi_sem_acento(e.nome) like '%' || public.epi_sem_acento(p_busca) || '%')
  order by (coalesce(ent.qtd, 0) - coalesce(sai.qtd, 0)) <= 0 desc, e.nome;
end;
$$;
revoke all on function public.epi_stock_por_item(text) from public, anon;
grant execute on function public.epi_stock_por_item(text) to authenticated;
notify pgrst, 'reload schema';
