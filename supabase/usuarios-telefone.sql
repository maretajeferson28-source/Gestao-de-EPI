-- Telefone do usuário (Administração → Criar usuário). Só informativo.
alter table public.usuarios_autorizados add column if not exists telefone text;
notify pgrst, 'reload schema';
