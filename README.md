# Gestão de EPI

Sistema web de gestão de EPI conectado ao Supabase. Produção atual:
https://gestao-de-epi-tau.vercel.app/

## Estrutura
- `index.html`
- `css/style.css`
- `js/config.js`
- `js/app.js`
- `_headers`

## Backend
Supabase: projeto `Gestão de EPI`, ref `jrzviiaywfjaawwkwgze`.
Reconstrução, permissões, login e testes: [guia do banco](docs/rebuild-supabase.md).

O frontend usa somente a chave publishable do Supabase. Segredos e chaves service role não devem ser versionados.

## Deploy
O repositório está conectado à Vercel para deploy automático.
O adaptador Netlify também é mantido no código.

O CAEPI permanece sem agendamento e bloqueado por opt-in até validar a primeira
carga e o consumo no banco novo. Não reativar usando segredos do projeto excluído.

Versão inicial importada: V4.4 — tabela de movimentações com colunas estáveis e coluna de ação fixa.
