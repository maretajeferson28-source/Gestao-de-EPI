-- Uniforme na entrega avulsa (e na Fila): a baixa da sala passa a ser feita
-- por gatilho na própria movimentação. Toda movimentação gravada com
-- deposito_item_id tira a quantidade da sala (nunca abaixo de zero: se não
-- tiver, a gravação inteira é recusada) e registra a saída; se a movimentação
-- for apagada, as peças voltam para a sala ("estorno").
alter table public.deposito_movimentos drop constraint if exists deposito_movimentos_motivo_check;
alter table public.deposito_movimentos add constraint deposito_movimentos_motivo_check
  check (motivo in ('carga_inicial', 'entrada_inicial', 'ajuste', 'entrega', 'estorno'));

create or replace function public.deposito_baixa_entrega()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_peca public.deposito_itens; v_q integer;
begin
  if tg_op = 'INSERT' then
    v_q := ceil(new.quantidade)::integer;
    select * into v_peca from public.deposito_itens where id = new.deposito_item_id for update;
    if v_peca.id is null then raise exception 'Peça de uniforme não encontrada.'; end if;
    if v_peca.quantidade < v_q then
      raise exception 'Só tem % de % (tam. %) nessa sala.', v_peca.quantidade, v_peca.peca, coalesce(nullif(v_peca.tamanho, ''), '—');
    end if;
    update public.deposito_itens set quantidade = quantidade - v_q, updated_at = now() where id = v_peca.id;
    insert into public.deposito_movimentos(item_id, deposito_id, delta, motivo, movimentacao_id)
      values (v_peca.id, v_peca.deposito_id, -v_q, 'entrega', new.id);
    return new;
  else
    v_q := ceil(old.quantidade)::integer;
    select * into v_peca from public.deposito_itens where id = old.deposito_item_id for update;
    if v_peca.id is not null and v_q > 0 then
      update public.deposito_itens set quantidade = quantidade + v_q, updated_at = now() where id = v_peca.id;
      insert into public.deposito_movimentos(item_id, deposito_id, delta, motivo)
        values (v_peca.id, v_peca.deposito_id, v_q, 'estorno');
    end if;
    return old;
  end if;
end;
$$;
drop trigger if exists movimentacoes_epi_baixa_sala on public.movimentacoes_epi;
create trigger movimentacoes_epi_baixa_sala after insert on public.movimentacoes_epi
  for each row when (new.deposito_item_id is not null) execute function public.deposito_baixa_entrega();
drop trigger if exists movimentacoes_epi_estorno_sala on public.movimentacoes_epi;
create trigger movimentacoes_epi_estorno_sala after delete on public.movimentacoes_epi
  for each row when (old.deposito_item_id is not null) execute function public.deposito_baixa_entrega();

-- Fila: a baixa agora é do gatilho; a função só confere e grava a movimentação.
create or replace function public.epi_confirmar_entrega(p_programacao uuid, p_itens jsonb, p_responsavel text, p_validacao jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_prog public.entregas_programadas; v_colab public.colaboradores; v_item record; v_qtd numeric; v_n int := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then
    raise exception 'Somente administradores podem confirmar entregas.' using errcode = '42501';
  end if;
  select * into v_prog from public.entregas_programadas where id = p_programacao for update;
  if v_prog.id is null then raise exception 'Programação não encontrada.'; end if;
  if v_prog.status <> 'programada' then raise exception 'Esta entrega já está %.', v_prog.status; end if;
  select * into v_colab from public.colaboradores where id = v_prog.colaborador_id;
  if not exists (select 1 from public.termos_epi t where t.colaborador_id = v_prog.colaborador_id and t.assinatura_path is not null) then
    raise exception '% ainda não assinou o termo de autorização.', v_colab.nome;
  end if;
  if coalesce(p_validacao->>'assinatura_path', '') = '' then raise exception 'Falta a assinatura do colaborador.'; end if;
  if coalesce((p_validacao->>'facial_ok')::boolean, false) is not true then raise exception 'Falta a validação facial.'; end if;

  for v_item in
    select i.*, coalesce(e.nome, di.peca, 'Item') as epi_nome, di.quantidade as sala_qtd, d.nome as sala_nome
      from public.entregas_programadas_itens i
      left join public.epis e on e.id = i.epi_id
      left join public.deposito_itens di on di.id = i.deposito_item_id
      left join public.depositos d on d.id = di.deposito_id
     where i.programacao_id = p_programacao order by i.ordem
  loop
    select (x->>'quantidade')::numeric into v_qtd from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
     where (x->>'id')::uuid = v_item.id;
    v_qtd := coalesce(v_qtd, v_item.quantidade);
    if v_qtd < 0 or v_qtd::text in ('NaN', 'Infinity') then raise exception 'Quantidade inválida em %.', v_item.epi_nome; end if;
    update public.entregas_programadas_itens set quantidade_entregue = v_qtd where id = v_item.id;
    if v_qtd = 0 then continue; end if;
    if v_item.deposito_item_id is not null then
      if v_item.sala_qtd is null then raise exception 'A peça % não existe mais na sala.', v_item.epi_nome; end if;
      if v_qtd > v_item.sala_qtd then
        raise exception 'Só tem % de % (tam. %) na %.', v_item.sala_qtd, v_item.epi_nome, coalesce(v_item.tamanho, '—'), v_item.sala_nome;
      end if;
    end if;
    insert into public.movimentacoes_epi(data, colaborador_id, colaborador_nome_informado, epi_id, epi_nome_original,
        quantidade, ca, tamanho, responsavel, observacao, origem, programacao_id, contabiliza_estoque, deposito_item_id,
        validacao_assinatura_path, validacao_facial_ok, validacao_facial_semelhanca, validacao_termo_id)
      values (v_hoje, v_prog.colaborador_id, v_colab.nome, v_item.epi_id, v_item.epi_nome,
        v_qtd, coalesce(v_item.ca, 'N/A'), coalesce(v_item.tamanho, 'N/A'), coalesce(nullif(trim(p_responsavel), ''), 'Fila de entregas'),
        v_prog.observacao, 'Fila de entregas', p_programacao, v_item.deposito_item_id is null, v_item.deposito_item_id,
        p_validacao->>'assinatura_path', true, nullif(p_validacao->>'semelhanca', '')::numeric, nullif(p_validacao->>'termo_id', '')::uuid);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhum item com quantidade para entregar.'; end if;

  update public.entregas_programadas
     set status = 'entregue', entregue_em = now(), entregue_por_email = auth.jwt()->>'email', updated_at = now()
   where id = p_programacao;
  return v_n;
end;
$$;
revoke all on function public.epi_confirmar_entrega(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.epi_confirmar_entrega(uuid, jsonb, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
