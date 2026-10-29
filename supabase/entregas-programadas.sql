-- Entregas programadas: o PC programa (colaborador + EPIs com C.A., quantidade
-- e tamanho) e a programação vai para a fila do celular, onde a entrega é
-- confirmada com facial e assinatura. O estoque só baixa na confirmação.
create table if not exists public.entregas_programadas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  data_prevista date not null default current_date,
  observacao text,
  status text not null default 'programada' check (status in ('programada', 'entregue', 'cancelada')),
  created_by uuid default auth.uid(),
  created_by_email text default (auth.jwt()->>'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  entregue_em timestamptz,
  entregue_por_email text,
  cancelada_em timestamptz
);
create index if not exists entregas_programadas_fila_idx on public.entregas_programadas(status, data_prevista);

create table if not exists public.entregas_programadas_itens (
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references public.entregas_programadas(id) on delete cascade,
  ordem integer not null default 0,
  epi_id uuid not null references public.epis(id) on delete restrict,
  variante_id uuid references public.epi_variantes(id) on delete set null,
  ca text,
  quantidade numeric not null check (quantidade > 0 and quantidade::text not in ('NaN', 'Infinity', '-Infinity')),
  tamanho text
);
create index if not exists entregas_programadas_itens_prog_idx on public.entregas_programadas_itens(programacao_id);

alter table public.entregas_programadas enable row level security;
alter table public.entregas_programadas_itens enable row level security;
revoke all on public.entregas_programadas, public.entregas_programadas_itens from public, anon, authenticated;
grant select, update on public.entregas_programadas to authenticated;
grant select on public.entregas_programadas_itens to authenticated;
grant all on public.entregas_programadas, public.entregas_programadas_itens to service_role;
drop policy if exists admin_access on public.entregas_programadas;
create policy admin_access on public.entregas_programadas for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));
drop policy if exists admin_access on public.entregas_programadas_itens;
create policy admin_access on public.entregas_programadas_itens for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));

-- Cria a programação com todos os itens de uma vez (ou nada).
-- p_itens: [{ "epi_id": uuid, "variante_id": uuid|null, "quantidade": n, "tamanho": text|null }]
create or replace function public.epi_programar_entrega(p_colaborador uuid, p_data date, p_observacao text, p_itens jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_ordem int := 0; v_ca text;
begin
  if auth.uid() is null or not public.epi_admin_is_admin() then
    raise exception 'Somente administradores podem programar entregas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um EPI.';
  end if;
  insert into public.entregas_programadas(colaborador_id, data_prevista, observacao)
    values (p_colaborador, coalesce(p_data, current_date), nullif(trim(coalesce(p_observacao, '')), ''))
    returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ca := null;
    if nullif(v_item->>'variante_id', '') is not null then
      select v.ca into v_ca from public.epi_variantes v
       where v.id = (v_item->>'variante_id')::uuid and v.epi_id = (v_item->>'epi_id')::uuid;
      if v_ca is null then raise exception 'C.A. não pertence a esse EPI.'; end if;
    end if;
    insert into public.entregas_programadas_itens(programacao_id, ordem, epi_id, variante_id, ca, quantidade, tamanho)
      values (v_id, v_ordem, (v_item->>'epi_id')::uuid, nullif(v_item->>'variante_id', '')::uuid, v_ca,
              (v_item->>'quantidade')::numeric, nullif(trim(coalesce(v_item->>'tamanho', '')), ''));
    v_ordem := v_ordem + 1;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.epi_programar_entrega(uuid, date, text, jsonb) from public, anon;
grant execute on function public.epi_programar_entrega(uuid, date, text, jsonb) to authenticated;
-- A função insere com os privilégios de quem chama: o admin precisa de insert.
grant insert on public.entregas_programadas, public.entregas_programadas_itens to authenticated;
notify pgrst, 'reload schema';
