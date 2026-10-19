-- Validação opcional da entrega: biometria facial e/ou assinatura do
-- colaborador no momento da entrega. As imagens ficam na pasta privada
-- termos-epi (entregas/<colaborador>/<movimentação>-...), só administrador.
alter table public.movimentacoes_epi
  add column if not exists validacao_selfie_path text,
  add column if not exists validacao_assinatura_path text;
notify pgrst,'reload schema';
