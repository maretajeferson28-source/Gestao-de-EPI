-- Uniformes nas entregas programadas: um item da programação pode ser um EPI
-- (epi_id, como sempre) ou uma peça de uma sala de uniforme (deposito_item_id:
-- peça + tamanho + sala). Ao programar, confere se a sala tem a quantidade;
-- na confirmação (Fila), grava a movimentação (sem mexer no estoque de EPI) e
-- tira as peças da sala, registrando a saída em deposito_movimentos.

-- Item da programação: EPI ou peça da sala (um dos dois).
alter table public.entregas_programadas_itens alter column epi_id drop not null;
alter table public.entregas_programadas_itens
  add column if not exists deposito_item_id uuid references public.deposito_itens(id) on delete restrict;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entregas_prog_itens_epi_ou_peca') then
    alter table public.entregas_programadas_itens add constraint entregas_prog_itens_epi_ou_peca
      check ((epi_id is not null) <> (deposito_item_id is not null));
  end if;
end $$;

-- Movimentação: guarda de qual peça da sala saiu (uniforme não tem epi_id).
alter table public.movimentacoes_epi
  add column if not exists deposito_item_id uuid references public.deposito_itens(id) on delete set null;

-- Registro da sala: saída por entrega, ligada à movimentação.
alter table public.deposito_movimentos drop constraint if exists deposito_movimentos_motivo_check;
alter table public.deposito_movimentos add constraint deposito_movimentos_motivo_check
  check (motivo in ('carga_inicial', 'entrada_inicial', 'ajuste', 'entrega'));
alter table public.deposito_movimentos
  add column if not exists movimentacao_id uuid references public.movimentacoes_epi(id) on delete set null;

-- Programar: p_itens aceita { "epi_id", "variante_id", "quantidade", "tamanho" }
-- (EPI) ou { "deposito_item_id", "quantidade" } (uniforme: tamanho e sala vêm da peça).
create or replace function public.epi_programar_entrega(p_colaborador uuid, p_data date, p_observacao text, p_itens jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_ordem int := 0; v_ca text; v_peca public.deposito_itens; v_qtd numeric;
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then
    raise exception 'Somente administradores podem programar entregas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um item.';
  end if;
  insert into public.entregas_programadas(colaborador_id, data_prevista, observacao)
    values (p_colaborador, coalesce(p_data, current_date), nullif(trim(coalesce(p_observacao, '')), ''))
    returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if nullif(v_item->>'deposito_item_id', '') is not null then
      select * into v_peca from public.deposito_itens where id = (v_item->>'deposito_item_id')::uuid;
      if v_peca.id is null then raise exception 'Peça de uniforme não encontrada.'; end if;
      if v_qtd > v_peca.quantidade then
        raise exception 'Só tem % de % (tam. %) nessa sala.', v_peca.quantidade, v_peca.peca, coalesce(nullif(v_peca.tamanho, ''), '—');
      end if;
      insert into public.entregas_programadas_itens(programacao_id, ordem, epi_id, deposito_item_id, ca, quantidade, tamanho)
        values (v_id, v_ordem, null, v_peca.id, v_peca.ca, v_qtd, nullif(v_peca.tamanho, ''));
    else
      v_ca := null;
      if nullif(v_item->>'variante_id', '') is not null then
        select v.ca into v_ca from public.epi_variantes v
         where v.id = (v_item->>'variante_id')::uuid and v.epi_id = (v_item->>'epi_id')::uuid;
        if v_ca is null then raise exception 'C.A. não pertence a esse EPI.'; end if;
      end if;
      insert into public.entregas_programadas_itens(programacao_id, ordem, epi_id, variante_id, ca, quantidade, tamanho)
        values (v_id, v_ordem, (v_item->>'epi_id')::uuid, nullif(v_item->>'variante_id', '')::uuid, v_ca,
                v_qtd, nullif(trim(coalesce(v_item->>'tamanho', '')), ''));
    end if;
    v_ordem := v_ordem + 1;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.epi_programar_entrega(uuid, date, text, jsonb) from public, anon;
grant execute on function public.epi_programar_entrega(uuid, date, text, jsonb) to authenticated;

-- Confirmar (Fila): EPI como sempre; uniforme grava a movimentação sem baixar
-- o estoque de EPI e tira as peças da sala (nunca abaixo de zero).
create or replace function public.epi_confirmar_entrega(p_programacao uuid, p_itens jsonb, p_responsavel text, p_validacao jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_prog public.entregas_programadas; v_colab public.colaboradores; v_item record; v_qtd numeric; v_n int := 0;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_mov uuid;
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
    select i.*, coalesce(e.nome, di.peca, 'Item') as epi_nome, di.quantidade as sala_qtd, di.deposito_id as sala_id, d.nome as sala_nome
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
        p_validacao->>'assinatura_path', true, nullif(p_validacao->>'semelhanca', '')::numeric, nullif(p_validacao->>'termo_id', '')::uuid)
      returning id into v_mov;
    if v_item.deposito_item_id is not null then
      update public.deposito_itens set quantidade = quantidade - v_qtd::integer, updated_at = now()
       where id = v_item.deposito_item_id and quantidade >= v_qtd;
      if not found then raise exception 'Não foi possível tirar % da sala.', v_item.epi_nome; end if;
      insert into public.deposito_movimentos(item_id, deposito_id, delta, motivo, movimentacao_id)
        values (v_item.deposito_item_id, v_item.sala_id, -(v_qtd::integer), 'entrega', v_mov);
    end if;
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
