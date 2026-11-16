-- Entradas e saídas das peças dos depósitos (uniformes e calçados), para as
-- colunas Entrou / Saiu do Estoque. Cada − e + grava uma linha; peça ou
-- tamanho novo grava a quantidade inicial como entrada. As peças que já
-- existiam entram com o saldo atual como "carga inicial".
create table if not exists public.deposito_movimentos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.deposito_itens(id) on delete cascade,
  deposito_id uuid not null references public.depositos(id) on delete cascade,
  delta integer not null check (delta <> 0),
  motivo text not null default 'ajuste' check (motivo in ('carga_inicial', 'entrada_inicial', 'ajuste')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_email text default (auth.jwt()->>'email')
);
create index if not exists deposito_movimentos_item_idx on public.deposito_movimentos (item_id);
create index if not exists deposito_movimentos_deposito_idx on public.deposito_movimentos (deposito_id);

alter table public.deposito_movimentos enable row level security;
revoke all on public.deposito_movimentos from public, anon, authenticated;
grant select, insert on public.deposito_movimentos to authenticated;
grant all on public.deposito_movimentos to service_role;
drop policy if exists authorized_read on public.deposito_movimentos;
create policy authorized_read on public.deposito_movimentos for select to authenticated
  using ((select epi_private.is_authorized()));
drop policy if exists admin_write on public.deposito_movimentos;
create policy admin_write on public.deposito_movimentos for insert to authenticated
  with check ((select epi_private.is_admin()));

-- Peça ou tamanho novo: a quantidade inicial conta como entrada.
create or replace function public.deposito_itens_entrada_inicial()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.quantidade > 0 then
    insert into public.deposito_movimentos (item_id, deposito_id, delta, motivo)
    values (new.id, new.deposito_id, new.quantidade, 'entrada_inicial');
  end if;
  return new;
end;
$$;
drop trigger if exists deposito_itens_entrada_inicial on public.deposito_itens;
create trigger deposito_itens_entrada_inicial after insert on public.deposito_itens
  for each row execute function public.deposito_itens_entrada_inicial();

-- − e +: soma no banco (nunca abaixo de zero) e grava o que de fato mudou.
create or replace function public.deposito_item_somar(p_id uuid, p_delta integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_antes integer; v_depois integer; v_dep uuid;
begin
  select quantidade, deposito_id into v_antes, v_dep from public.deposito_itens where id = p_id for update;
  if v_antes is null then raise exception 'Peça não encontrada ou sem permissão.' using errcode = '42501'; end if;
  v_depois := greatest(0, v_antes + p_delta);
  if v_depois <> v_antes then
    update public.deposito_itens set quantidade = v_depois, updated_at = now() where id = p_id;
    if not found then raise exception 'Sem permissão para alterar.' using errcode = '42501'; end if;
    insert into public.deposito_movimentos (item_id, deposito_id, delta, motivo) values (p_id, v_dep, v_depois - v_antes, 'ajuste');
  end if;
  return v_depois;
end;
$$;
revoke all on function public.deposito_item_somar(uuid, integer) from public, anon;
grant execute on function public.deposito_item_somar(uuid, integer) to authenticated;

-- Peças que já existiam: o saldo de hoje entra como carga inicial (uma vez só).
insert into public.deposito_movimentos (item_id, deposito_id, delta, motivo, created_at, created_by, created_by_email)
select i.id, i.deposito_id, i.quantidade, 'carga_inicial', i.created_at, null, null
  from public.deposito_itens i
 where i.quantidade > 0
   and not exists (select 1 from public.deposito_movimentos m where m.item_id = i.id);

notify pgrst, 'reload schema';
