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
| realtime | imagem `supabase/realtime`              | 4000  | —                            |
| gateway  | `infra/railway/gateway` (Caddy)         | 8080  | `infra/railway/gateway/**`   |
| app      | raiz do repo + `infra/railway/app`      | 8080  | o site (fora de infra/db, infra/gateway, supabase, scripts, docs) |

`db`, `gateway` e `app` publicam sozinhos a cada push no branch ligado no
Railway. Os serviços por imagem mudam só pela versão da imagem no painel.

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
