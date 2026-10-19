-- Saldo de um EPI separado por C.A./C.I. (notas pelo ca_detectado, entradas
-- manuais e saídas pelo campo ca). C.A. vazio vira null ("Sem C.A.").
create or replace function public.epi_ca_norm(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p is null or btrim(p) = '' then null
    when upper(btrim(p)) like 'CI-%' then upper(btrim(p))
    else nullif(regexp_replace(p, '\D', '', 'g'), '')
  end;
$$;

create or replace function public.epi_stock_por_ca(p_epi uuid)
returns table(ca text, entradas numeric, saidas numeric, saldo numeric)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then
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
$$;
revoke all on function public.epi_stock_por_ca(uuid) from public, anon;
grant execute on function public.epi_stock_por_ca(uuid) to authenticated;
notify pgrst, 'reload schema';
