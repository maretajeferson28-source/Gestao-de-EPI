-- Dados dos e-mails automáticos (estoque baixo, C.A. vencendo e resumo da
-- semana), lidos pelo servidor do app (infra/railway/app/avisos.mjs) com a
-- chave de serviço. Só leitura; ninguém logado no app chama esta função.
create or replace function public.epi_relatorio_avisos(p_hoje date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_estoque jsonb; v_cas jsonb; v_resumo jsonb;
  v_ini date := p_hoje - 7; v_fim date := p_hoje - 1;
begin
  -- Estoque: zerados e no mínimo ou abaixo (mesma conta do epi_stock_por_item).
  with ent as (
    select x.epi_id, sum(x.qtd) qtd from (
      select i.epi_id, i.quantidade_estoque qtd from public.nfe_entrada_itens i
        join public.nfe_entradas n on n.id = i.nfe_entrada_id
       where n.status = 'entrada' and i.quantidade_estoque is not null and i.epi_id is not null
      union all
      select m.epi_id, m.quantidade from public.estoque_entradas_manuais m
    ) x group by x.epi_id
  ), sai as (
    select m.epi_id, sum(m.quantidade) qtd from public.movimentacoes_epi m
     where m.contabiliza_estoque and m.epi_id is not null group by m.epi_id
  ), itens as (
    select e.nome, coalesce(ent.qtd, 0) - coalesce(sai.qtd, 0) saldo, e.estoque_minimo minimo
      from public.epis e left join ent on ent.epi_id = e.id left join sai on sai.epi_id = e.id
     where e.ativo and (ent.qtd is not null or sai.qtd is not null or e.estoque_minimo is not null)
  )
  select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'saldo', saldo, 'minimo', minimo,
           'situacao', case when saldo <= 0 then 'critico' else 'baixo' end)
         order by (saldo <= 0) desc, nome), '[]'::jsonb)
    into v_estoque
    from itens where saldo <= 0 or (minimo is not null and saldo <= minimo);

  -- C.A. ativos de EPIs ativos vencidos ou vencendo em até 30 dias.
  select coalesce(jsonb_agg(jsonb_build_object('epi', e.nome, 'ca', v.ca,
           'fornecedor', coalesce(nullif(trim(v.fornecedor), ''), v.fabricante),
           'validade', v.data_validade, 'dias', v.data_validade - p_hoje)
         order by v.data_validade, e.nome), '[]'::jsonb)
    into v_cas
    from public.epi_variantes v join public.epis e on e.id = v.epi_id
   where v.ativo and e.ativo and v.data_validade is not null and v.data_validade <= p_hoje + 30;

  -- Resumo dos últimos 7 dias (segunda a domingo quando roda na segunda).
  select jsonb_build_object(
    'inicio', v_ini, 'fim', v_fim,
    'entregas', (select count(*) from public.movimentacoes_epi where data between v_ini and v_fim),
    'itens_entregues', (select coalesce(sum(quantidade), 0) from public.movimentacoes_epi where data between v_ini and v_fim),
    'colaboradores_atendidos', (select count(distinct coalesce(colaborador_id::text, colaborador_nome_informado))
                                  from public.movimentacoes_epi where data between v_ini and v_fim),
    'mais_entregues', (select coalesce(jsonb_agg(t order by t.qtd desc, t.nome), '[]'::jsonb) from (
        select coalesce(e.nome, m.epi_nome_original, 'EPI') nome, sum(m.quantidade) qtd
          from public.movimentacoes_epi m left join public.epis e on e.id = m.epi_id
         where m.data between v_ini and v_fim
         group by 1 order by 2 desc, 1 limit 5) t),
    'entradas_manuais', (select coalesce(sum(quantidade), 0) from public.estoque_entradas_manuais where data between v_ini and v_fim),
    'entradas_notas', (select coalesce(sum(i.quantidade_estoque), 0) from public.nfe_entrada_itens i
                         join public.nfe_entradas n on n.id = i.nfe_entrada_id
                        where n.status = 'entrada' and n.created_at::date between v_ini and v_fim),
    'sem_termo', (select coalesce(jsonb_agg(c.nome order by c.nome), '[]'::jsonb) from public.colaboradores c
                   where c.ativo and not exists (select 1 from public.termos_epi t
                                                  where t.colaborador_id = c.id and t.assinatura_path is not null))
  ) into v_resumo;

  return jsonb_build_object('hoje', p_hoje, 'estoque', v_estoque, 'cas', v_cas, 'resumo', v_resumo);
end;
$$;
revoke all on function public.epi_relatorio_avisos(date) from public, anon, authenticated;
grant execute on function public.epi_relatorio_avisos(date) to service_role;
notify pgrst, 'reload schema';
