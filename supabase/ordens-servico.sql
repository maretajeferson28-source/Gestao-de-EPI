-- Ordens de Serviço (O.S.) por função. Cada OS traz a descrição da função, os
-- agentes de risco, os EPIs de uso obrigatório e as recomendações. Cada
-- colaborador aponta para a OS da função dele (colaboradores.os_id).
-- epis: [{ "descricao": "como está escrito na OS", "epi_id": uuid|null }]
--   epi_id liga o item ao EPI cadastrado no app (null = EPI ainda não cadastrado).
-- agentes: [{ "grupo": "Físico", "itens": ["Ruído", ...] }]
create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  funcao text not null unique,
  setor text,
  data_os date,
  revisao text,
  descricao text,
  agentes jsonb not null default '[]'::jsonb,
  epis jsonb not null default '[]'::jsonb,
  recomendacoes jsonb not null default '[]'::jsonb,
  procedimentos text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.colaboradores add column if not exists os_id uuid references public.ordens_servico(id) on delete set null;
create index if not exists colaboradores_os_idx on public.colaboradores(os_id);

alter table public.ordens_servico enable row level security;
revoke all on public.ordens_servico from public, anon, authenticated;
grant select, insert, update on public.ordens_servico to authenticated;
grant all on public.ordens_servico to service_role;
drop policy if exists admin_access on public.ordens_servico;
create policy admin_access on public.ordens_servico for all to authenticated
  using ((select epi_private.is_admin())) with check ((select epi_private.is_admin()));
