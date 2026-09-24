GESTÃO DE EPI — V4.3 (NETLIFY)

Este pacote é um site estático conectado ao projeto Gestao-EPI no Supabase.
Não precisa de GitHub, Vercel nem servidor local.

PUBLICAÇÃO:
1. Acesse https://app.netlify.com/drop
2. Arraste esta pasta inteira (gestao_epi_web_v4_3_netlify) para a área de upload.
3. O Netlify fornecerá uma URL terminando em .netlify.app.
4. Copie essa URL.

DEPOIS DA PUBLICAÇÃO:
No Supabase > Authentication > URL Configuration:
- Site URL: coloque a URL do Netlify
- Redirect URLs: adicione a URL do Netlify e a mesma URL com /* se desejar permitir caminhos internos.

No Google Cloud > OAuth Client:
- Authorized JavaScript origins: adicione a origem do Netlify, por exemplo https://seu-site.netlify.app
- Authorized redirect URIs: MANTENHA o callback do Supabase:
  https://aqnrjjllfzirrtwvjjbl.supabase.co/auth/v1/callback

O botão Acessar com Google usa automaticamente a URL em que o site estiver publicado.


V4.4 — tabela de movimentações com colunas fixas, truncamento seguro e coluna de ação estável.
