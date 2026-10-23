-- Avisos por e-mail do acesso (enviados pelo servidor do app, infra/railway/app):
--   aviso_pedido_em   -> quando o administrador foi avisado do pedido (uma vez por pessoa)
--   aviso_liberado_em -> quando a pessoa foi avisada da liberação; vale de novo se
--                        o acesso for liberado outra vez (updated_at mais novo).
alter table public.usuarios_autorizados
  add column if not exists aviso_pedido_em timestamptz,
  add column if not exists aviso_liberado_em timestamptz;

-- Quem já estava na lista não gera aviso agora.
update public.usuarios_autorizados
   set aviso_pedido_em = coalesce(aviso_pedido_em, now()),
       aviso_liberado_em = case when ativo then coalesce(aviso_liberado_em, now()) else aviso_liberado_em end;

-- O servidor do app lê e marca os avisos com a chave de serviço.
grant select, update on public.usuarios_autorizados to service_role;
notify pgrst, 'reload schema';
