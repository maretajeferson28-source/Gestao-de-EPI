# Gestão de EPI no Railway

Projeto Railway **Gestão de EPI**, ambiente `production`. A pilha é a do
Supabase self-hosted, um serviço por peça. Só `gateway` e `app` têm endereço
público; o resto fica na rede privada (`<serviço>.railway.internal`).

| Serviço  | Origem                                  | Porta | Publica quando muda          |
|----------|-----------------------------------------|-------|------------------------------|
| db       | `infra/railway/db` (supabase/postgres)  | 5432  | `infra/railway/db/**`        |
| rest     | imagem `postgrest/postgrest`            | 3000  | —                            |
| auth     | imagem `supabase/gotrue`                | 9999  | —                            |
| storage  | imagem `supabase/storage-api`           | 5000  | —                            |
| gateway  | `infra/railway/gateway` (Caddy)         | 8080  | `infra/railway/gateway/**`   |
| app      | raiz do repo + `infra/railway/app`      | 8080  | o site (fora de infra/db, infra/gateway, infra/backup, supabase, scripts, docs) |
| backup   | `infra/railway/backup` (cron 06:00 UTC) | —     | `infra/railway/backup/**`    |
| caepi-sync | `infra/railway/caepi` (roda 1x por deploy) | — | `infra/railway/caepi/**`, script e SQL da CAEPI |

`db`, `gateway`, `app` e `backup` publicam sozinhos a cada push no `main`.
Os serviços por imagem mudam só pela versão da imagem no painel.

Os arquivos do storage ficam no bucket R2 `gestao-epi-arquivos`
(`STORAGE_BACKEND=s3`, chaves em `stub/<bucket>/<nome>/<versão>`), com uma chave
de acesso que só enxerga esse bucket.

Não há serviço `realtime` (removido para economizar memória): o app usa
`REALTIME: false` em `js/config.js` e recarrega os dados após cada gravação.
Mudanças feitas em outro aparelho aparecem ao clicar em Atualizar.

## Backups

- Volume do banco no Railway (`db-volume`): diário (6 dias) e semanal (27 dias).
- Fora do Railway: o cron `backup` envia todo dia o banco (`pg_dump -Fc`) e os
  arquivos do storage para o bucket R2 `gestao-epi-backups`, criptografados com
  `openssl enc -aes-256-cbc -pbkdf2 -iter 200000` e guardados por 90 dias.
  Para abrir: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in <arquivo> -out <saída>`
  com a senha `BACKUP_PASSPHRASE`, que fica fora do repositório.

## Segredos

Nenhum segredo fica neste repositório. Senhas do banco, `JWT_SECRET`,
`ANON_KEY`, `SERVICE_ROLE_KEY` e a chave do Google ficam nas variáveis do
Railway (as três do JWT como variáveis compartilhadas do projeto) e numa cópia
local fora do git. Os serviços referenciam `${{db.POSTGRES_PASSWORD}}` em vez
de repetir a senha.

## Cuidados que já custaram tempo

- O Railway injeta `PORT`: cada serviço tem a porta fixada nas variáveis.
- O banco guarda os dados em `pgdata/` dentro do volume; a raiz tem `lost+found`.
- Conexões de fora do Railway só por TCP Proxy temporário, com `sslmode=require`,
  e o proxy é removido ao terminar.
- Não reaplicar `supabase/*.sql` num banco que já tem a estrutura: restaurar
  só em banco vazio e rodar `supabase/test-rebuild-access.sql` depois.
- Os logs do `db` na inicialização podem mostrar senhas: não colar em chats.
- O CORS é respondido pelo gateway; o auth e o storage não tratam o preflight.
