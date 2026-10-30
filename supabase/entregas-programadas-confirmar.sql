-- Confirma, no celular, uma entrega da fila: grava uma movimentação por item
-- (com a validação facial e a assinatura) e marca a programação como entregue.
-- Tudo de uma vez: se algo falhar, nada é gravado.
-- p_itens: [{ "id": uuid do item, "quantidade": n }]  (0 = não entregou esse item)
-- p_validacao: { "assinatura_path": text, "facial_ok": bool, "semelhanca": n, "termo_id": uuid }
alter table public.entregas_programadas_itens add column if not exists quantidade_entregue numeric;
alter table public.movimentacoes_epi add column if not exists programacao_id uuid references public.entregas_programadas(id) on delete set null;

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
    select i.*, e.nome as epi_nome from public.entregas_programadas_itens i
      join public.epis e on e.id = i.epi_id
     where i.programacao_id = p_programacao order by i.ordem
  loop
    select (x->>'quantidade')::numeric into v_qtd from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
     where (x->>'id')::uuid = v_item.id;
    v_qtd := coalesce(v_qtd, v_item.quantidade);
    if v_qtd < 0 or v_qtd::text in ('NaN', 'Infinity') then raise exception 'Quantidade inválida em %.', v_item.epi_nome; end if;
    update public.entregas_programadas_itens set quantidade_entregue = v_qtd where id = v_item.id;
    if v_qtd = 0 then continue; end if;
    insert into public.movimentacoes_epi(data, colaborador_id, colaborador_nome_informado, epi_id, epi_nome_original,
        quantidade, ca, tamanho, responsavel, observacao, origem, programacao_id,
        validacao_assinatura_path, validacao_facial_ok, validacao_facial_semelhanca, validacao_termo_id)
      values (v_hoje, v_prog.colaborador_id, v_colab.nome, v_item.epi_id, v_item.epi_nome,
        v_qtd, coalesce(v_item.ca, 'N/A'), coalesce(v_item.tamanho, 'N/A'), coalesce(nullif(trim(p_responsavel), ''), 'Fila de entregas'),
        v_prog.observacao, 'Fila de entregas', p_programacao,
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
grant update on public.entregas_programadas_itens to authenticated;
notify pgrst, 'reload schema';
