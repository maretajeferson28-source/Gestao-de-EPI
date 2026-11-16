-- Peças guardadas em cada depósito (uniformes e calçados), contagem simples:
-- peça + tamanho + quantidade, ajustada na tela "Depósitos" com − e +.
-- Não entra no estoque de EPI (entradas, notas e entregas seguem como estão).
-- Ler: qualquer usuário autorizado. Gravar: só administrador.
create table if not exists public.deposito_itens (
  id uuid primary key default gen_random_uuid(),
  deposito_id uuid not null references public.depositos(id) on delete cascade,
  peca text not null check (length(trim(peca)) > 0),
  tamanho text not null default '',
  quantidade integer not null default 0 check (quantidade >= 0),
  ca text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists deposito_itens_unico
  on public.deposito_itens (deposito_id, lower(trim(peca)), lower(trim(tamanho)));
create index if not exists deposito_itens_deposito_idx on public.deposito_itens (deposito_id);

alter table public.deposito_itens enable row level security;
revoke all on public.deposito_itens from public, anon, authenticated;
grant select, insert, update, delete on public.deposito_itens to authenticated;
grant all on public.deposito_itens to service_role;
drop policy if exists authorized_read on public.deposito_itens;
create policy authorized_read on public.deposito_itens for select to authenticated
  using ((select epi_private.is_authorized()));
drop policy if exists admin_write on public.deposito_itens;
create policy admin_write on public.deposito_itens for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));

-- − e + sem corrida entre dois cliques: soma no banco e nunca passa abaixo de zero.
create or replace function public.deposito_item_somar(p_id uuid, p_delta integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
  update public.deposito_itens
     set quantidade = greatest(0, quantidade + p_delta), updated_at = now()
   where id = p_id
  returning quantidade into v;
  if v is null then raise exception 'Peça não encontrada ou sem permissão.' using errcode = '42501'; end if;
  return v;
end;
$$;
revoke all on function public.deposito_item_somar(uuid, integer) from public, anon;
grant execute on function public.deposito_item_somar(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
