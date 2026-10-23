-- Apelido de cada C.A. (como o pessoal chama: "Calça", "Jaqueta"...). Aparece
-- em destaque no cartão do C.A. no Estoque; vazio = mostra o fornecedor.
alter table public.epi_variantes add column if not exists apelido text
  check (apelido is null or length(trim(apelido)) between 1 and 40);
notify pgrst, 'reload schema';
