# Reconstrução do Supabase — 15/10/2026

Projeto novo: `jrzviiaywfjaawwkwgze`, São Paulo. A reconstrução é de estrutura,
não restauração dos registros do projeto excluído. Não foram importadas planilhas,
notas, imagens ou bases CAEPI. Administrador confirmado: `maretajeferson28@gmail.com`.
Essa autorização não cria uma conta Auth nem define senha.

## Ordem dos scripts SQL

Em um projeto vazio, executar uma única vez:

1. `supabase/rebuild-app.sql`
2. `supabase/nfe-stock.sql`
3. `supabase/stock-notes-start.sql`
4. `supabase/caepi-versioned-cache.sql`
5. `supabase/caepi-read-policy.sql`
6. `supabase/rebuild-hardening.sql`

As migrações foram aplicadas remotamente e registradas no histórico do Supabase.
Os arquivos acima são snapshots SQL auditáveis. Não executar o bootstrap sobre
um banco já preenchido. Para recriar futuramente, validar primeiro em projeto vazio.

Tabelas do app protegidas por RLS: colaboradores, epis, epi_variantes,
movimentacoes_epi, usuarios_autorizados, nfe_entradas, nfe_entrada_itens.
CAEPI: caepi_datasets e caepi_records, leitura pública somente do dataset ativo.
Helpers privilegiados ficam em `epi_private`, fora do schema da Data API.
Usuários comuns ativos leem o catálogo/movimentações; somente admin grava.
NF-e e estoque são administrativos. Lista de autorizações não tem acesso direto.
Buckets: `epi-imagens` privado; `profile-avatars` público, com escrita somente
na pasta do próprio usuário. Nenhuma chave secreta é usada pelo frontend.

## Login Google — configuração manual necessária

1. Google Cloud: no cliente OAuth já usado, adicionar o URI de redirecionamento
   `https://jrzviiaywfjaawwkwgze.supabase.co/auth/v1/callback`.
2. Supabase > Authentication > Sign In / Providers > Google: ativar o provedor
   e preencher Client ID e Client Secret diretamente no painel. Não versionar
   nem compartilhar o segredo no chat.
3. Authentication > URL Configuration:
   - Site URL: `https://gestao-de-epi-tau.vercel.app`
   - Redirect URLs: `https://gestao-de-epi-tau.vercel.app/`
4. Entrar com a conta administrativa e verificar acesso.

O deploy apenas aponta o frontend e a consulta CAEPI para o novo projeto.
Ele não configura o provedor Google ou seus segredos.

## CAEPI desligado até validação de tamanho

Não há agendamento diário. O workflow exige a variável de repositório
`CAEPI_SYNC_ENABLED=true` para executar, mesmo manualmente, e o secret
`SUPABASE_DB_URL` deve conter a conexão do **banco novo**. O secret antigo de
senha isolada não é mais usado. Não habilitar sem uma carga supervisionada.

Há serialização das execuções, limite de 20 minutos e teste de conexão antes
do download. O navegador é usado diretamente no workflow para evitar as tentativas
curl recusadas. O fallback curl/browser continua disponível para execução local.
Hash igual não importa novamente. Hash diferente troca o dataset em transação e
remove os datasets arquivados, conservando todas as linhas oficiais do ativo.
A troca ainda necessita espaço transitório para a base antiga e nova, índices e
WAL; medir antes de habilitar periodicidade. Não atribuir a queda antiga a essa
retenção sem métricas do banco antigo.

## Importação de dados antigos

Usar as planilhas originais do proprietário. Movimentações históricas anteriores
ao início de estoque por NF-e devem ser importadas com `contabiliza_estoque=false`.
Novas saídas têm `true` por padrão. Não recriar saldos ou registros fictícios.
Os formulários técnicos antigos usam alguns IDs fixos: conferir os vínculos após
reimportar o catálogo, sobretudo cone, calço e filtro VO/GA.

## Testes

- `node --test scripts/test-supabase-rebuild.mjs scripts/test-nfe-stock.mjs scripts/test-mobile-pwa.mjs`
- `supabase/test-rebuild-access.sql`: admin, leitor e conta não autorizada.
- `supabase/test-nfe-stock.sql`: salvar/regravar NF-e, rollback, saídas e agregado.

Os testes SQL sempre terminam com ROLLBACK, sem registros persistentes de teste.
