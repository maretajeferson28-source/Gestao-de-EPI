-- Entrada nas salas de uniforme (Abrir peça → Entrada): quantidade de uma vez,
-- com a data e uma observação (ex.: "NF 1234"). Grava no registro da sala
-- como motivo 'entrada'. Quem pode: o mesmo do − e + (uniformes.ajustar),
-- pelas políticas que já existem em deposito_itens e deposito_movimentos.

alter table public.deposito_movimentos add column if not exists data date;
alter table public.deposito_movimentos add column if not exists observacao text;

alter table public.deposito_movimentos drop constraint if exists deposito_movimentos_motivo_check;
alter table public.deposito_movimentos add constraint deposito_movimentos_motivo_check
  check (motivo in ('carga_inicial', 'entrada_inicial', 'ajuste', 'entrega', 'estorno', 'entrada'));

create or replace function public.deposito_item_entrada(p_id uuid, p_qtd integer, p_data date, p_obs text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_antes integer; v_dep uuid;
begin
  if p_qtd is null or p_qtd < 1 then raise exception 'A quantidade tem de ser 1 ou mais.'; end if;
  if p_data is null then raise exception 'Informe a data.'; end if;
  select quantidade, deposito_id into v_antes, v_dep from public.deposito_itens where id = p_id for update;
  if v_antes is null then raise exception 'Peça não encontrada ou sem permissão.' using errcode = '42501'; end if;
  update public.deposito_itens set quantidade = v_antes + p_qtd, updated_at = now() where id = p_id;
  if not found then raise exception 'Sem permissão para alterar.' using errcode = '42501'; end if;
  insert into public.deposito_movimentos (item_id, deposito_id, delta, motivo, data, observacao)
    values (p_id, v_dep, p_qtd, 'entrada', p_data, nullif(btrim(coalesce(p_obs, '')), ''));
  return v_antes + p_qtd;
end;
$$;
revoke all on function public.deposito_item_entrada(uuid, integer, date, text) from public, anon;
grant execute on function public.deposito_item_entrada(uuid, integer, date, text) to authenticated;

notify pgrst, 'reload schema';
