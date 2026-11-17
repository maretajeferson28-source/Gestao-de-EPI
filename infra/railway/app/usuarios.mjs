// Criar usuário pela Administração (POST /api/usuarios), só administrador.
//   { nome, email, telefone, senha, perfil_id }
// Cria o login no GoTrue já confirmado (a pessoa entra direto com o e-mail e
// a senha), autoriza o e-mail em usuarios_autorizados e liga o perfil.
// Se o e-mail já tem login (ex.: entrou com o Google antes), não mexe na
// senha: só autoriza e liga o perfil. A senha nunca é guardada nem registrada
// em log aqui; vai direto para o GoTrue.
const { SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY } = process.env;
const svc = { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY };
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function quemChamou(req) {
  const auth = req.headers.authorization || '';
  if (!/^Bearer \S+$/.test(auth)) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.email ? { email: String(u.email).toLowerCase(), auth } : null;
}
async function ehAdmin(quem) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/epi_admin_is_admin`, {
    method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: quem.auth, 'Content-Type': 'application/json' }, body: '{}'
  });
  return r.ok && (await r.json()) === true;
}

export async function handleUsuarios(req, res, send) {
  const json = (status, obj) => send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(obj));
  if (!SERVICE_ROLE_KEY) return json(503, { erro: 'Criação de usuário desligada neste servidor.' });
  let body = '';
  for await (const parte of req) { body += parte; if (body.length > 4000) return json(413, { erro: 'Dados grandes demais.' }); }
  let d;
  try { d = JSON.parse(body || '{}'); } catch { return json(400, { erro: 'Dados inválidos.' }); }
  try {
    const quem = await quemChamou(req);
    if (!quem) return json(401, { erro: 'Faça login de novo.' });
    if (!(await ehAdmin(quem))) return json(403, { erro: 'Somente administradores criam usuários.' });

    const nome = String(d.nome || '').trim().slice(0, 120);
    const email = String(d.email || '').trim().toLowerCase();
    const telefone = String(d.telefone || '').replace(/[^\d+()\s-]/g, '').trim().slice(0, 30) || null;
    const senha = String(d.senha || '');
    const perfil = d.perfil_id && UUID_OK.test(String(d.perfil_id)) ? String(d.perfil_id) : null;
    if (!nome) return json(400, { erro: 'Informe o nome.' });
    if (!EMAIL_OK.test(email)) return json(400, { erro: 'E-mail inválido.' });
    if (senha.length < 8) return json(400, { erro: 'A senha precisa ter pelo menos 8 caracteres.' });

    // Conta de administrador não é mexida por aqui.
    const atual = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_autorizados?email=eq.${encodeURIComponent(email)}&select=email,admin`, { headers: svc });
    if (!atual.ok) throw new Error('banco ' + atual.status);
    if ((await atual.json())[0]?.admin) return json(409, { erro: 'Esse e-mail é de um administrador.' });

    // 1) Login no GoTrue, já confirmado.
    let jaTinha = false;
    const cria = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { full_name: nome, name: nome, phone: telefone } })
    });
    if (!cria.ok) {
      const t = await cria.text();
      if (cria.status === 422 && /already|registered|exists/i.test(t)) jaTinha = true;
      else if (/password/i.test(t)) return json(400, { erro: 'Senha recusada pelo login: use pelo menos 8 caracteres, com letras e números.' });
      else { console.error('[USUARIOS] gotrue', cria.status); return json(502, { erro: 'Não foi possível criar o login.' }); }
    }

    // 2) Autoriza e liga o perfil.
    const up = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_autorizados?on_conflict=email`, {
      method: 'POST', headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email, nome, telefone, ativo: true, perfil_id: perfil, updated_at: new Date().toISOString() })
    });
    if (!up.ok) { console.error('[USUARIOS] autorizar', up.status); return json(502, { erro: 'Login criado, mas não foi possível autorizar. Autorize pela lista.' }); }
    console.log(`[USUARIOS] ${jaTinha ? 'autorizado (já tinha login)' : 'criado'} por ${quem.email}`);
    return json(200, { resultado: jaTinha ? 'ja_tinha_login' : 'criado' });
  } catch (e) {
    console.error('[USUARIOS]', e.message);
    return json(500, { erro: 'Não foi possível criar o usuário.' });
  }
}
