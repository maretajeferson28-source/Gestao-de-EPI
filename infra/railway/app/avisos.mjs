// Avisos de acesso por e-mail (POST /api/avisos), enviados pelo servidor do
// app para a senha do Gmail nunca ir ao navegador.
//   { tipo: 'pedido' }            -> avisa o administrador que quem chamou pediu acesso
//   { tipo: 'liberado', email }   -> avisa a pessoa que o acesso foi liberado (só administrador chama)
// Cada aviso é marcado em usuarios_autorizados (aviso_pedido_em / aviso_liberado_em)
// para não repetir. Sem as variáveis SMTP_* o endpoint só responde "desligado".
import net from 'node:net';
import tls from 'node:tls';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_ROLE_KEY,
  SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS,
  AVISO_ADMIN_EMAIL, APP_URL = 'https://app-production-184a.up.railway.app'
} = process.env;

export const avisosLigados = Boolean(SERVICE_ROLE_KEY && SMTP_HOST && SMTP_USER && SMTP_PASS && AVISO_ADMIN_EMAIL);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svc = { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY };

// ---- SMTP (STARTTLS + AUTH LOGIN), sem dependências ----
function conversa(sock) {
  let buf = '';
  const fila = [];
  sock.on('data', (d) => {
    buf += d.toString();
    for (;;) {
      const m = buf.match(/^(\d{3})([ -])[^\r\n]*\r\n/);
      if (!m) break;
      buf = buf.slice(m[0].length);
      if (m[2] === ' ') fila.shift()?.(m[1]);
    }
  });
  return (cmd, esperado) => new Promise((res, rej) => {
    fila.push((cod) => (esperado && !esperado.includes(cod) ? rej(new Error(`SMTP ${cod} em "${String(cmd).slice(0, 10)}"`)) : res(cod)));
    if (cmd !== null) sock.write(cmd + '\r\n');
  });
}

export async function enviarEmail(para, assunto, html) {
  // Teste local: AVISOS_SIMULAR=1 só registra, sem enviar.
  if (process.env.AVISOS_SIMULAR === '1') { console.log(`[AVISOS] simulado para ${para}: ${assunto} (${html.length} bytes)`); return; }
  const b64 = (s) => Buffer.from(s).toString('base64');
  const s = net.connect(Number(SMTP_PORT), SMTP_HOST);
  s.setTimeout(20000, () => s.destroy(new Error('SMTP sem resposta')));
  await new Promise((r, j) => { s.once('connect', r); s.once('error', j); });
  let falar = conversa(s);
  await falar(null, ['220']);
  await falar('EHLO gestao-epi', ['250']);
  await falar('STARTTLS', ['220']);
  const t = tls.connect({ socket: s, servername: SMTP_HOST });
  await new Promise((r, j) => { t.once('secureConnect', r); t.once('error', j); });
  falar = conversa(t);
  try {
    await falar('EHLO gestao-epi', ['250']);
    await falar('AUTH LOGIN', ['334']);
    await falar(b64(SMTP_USER), ['334']);
    await falar(b64(SMTP_PASS), ['235']);
    await falar(`MAIL FROM:<${SMTP_USER}>`, ['250']);
    await falar(`RCPT TO:<${para}>`, ['250', '251']);
    await falar('DATA', ['354']);
    // Texto simples + HTML (multipart/alternative) ajuda a não cair no Spam.
    // Sem Message-ID: o próprio Gmail coloca um no padrão dele.
    const linhas = (s) => b64(s).replace(/.{1,76}/g, '$&\r\n');
    const texto = html
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2: $1')
      .replace(/<\/(p|h2|div)>/g, '\n').replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n\n');
    const fronteira = 'gestao-epi-' + Math.random().toString(36).slice(2);
    const msg = [
      `From: =?UTF-8?B?${b64('Gestão de EPI')}?= <${SMTP_USER}>`,
      `To: <${para}>`,
      `Subject: =?UTF-8?B?${b64(assunto)}?=`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${fronteira}"`,
      '',
      `--${fronteira}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      linhas(texto),
      `--${fronteira}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      linhas(html),
      `--${fronteira}--`,
      '.'
    ].join('\r\n');
    await falar(msg, ['250']);
    await falar('QUIT', ['221']).catch(() => {});
  } finally {
    t.end();
  }
}

// ---- Modelos (email-templates/) ----
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export async function modelo(nome, campos) {
  let html = await readFile(join(ROOT, 'email-templates', nome), 'utf8');
  for (const [k, v] of Object.entries(campos)) html = html.replaceAll(`{{ .${k} }}`, esc(v));
  return html.replace(/^<!--.*?-->\s*/s, '');
}

// ---- Banco, pelo gateway ----
async function quemChamou(req) {
  const auth = req.headers.authorization || '';
  if (!/^Bearer \S+$/.test(auth)) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.email ? { email: String(u.email).toLowerCase(), auth } : null;
}

async function linha(email) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_autorizados?email=eq.${encodeURIComponent(email)}&select=*`, { headers: svc });
  if (!r.ok) throw new Error('banco ' + r.status);
  return (await r.json())[0] || null;
}

// Marca o aviso só se a condição ainda valer (evita mandar duas vezes).
async function marcar(email, filtro, campos) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios_autorizados?email=eq.${encodeURIComponent(email)}&${filtro}`, {
    method: 'PATCH',
    headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(campos)
  });
  if (!r.ok) throw new Error('banco ' + r.status);
  return (await r.json()).length > 0;
}

async function avisoPedido(quem) {
  const u = await linha(quem.email);
  if (!u || u.ativo || u.aviso_pedido_em) return 'nada a avisar';
  if (!(await marcar(quem.email, 'aviso_pedido_em=is.null&ativo=is.false', { aviso_pedido_em: new Date().toISOString() }))) return 'já avisado';
  try {
    const html = await modelo('aviso-pedido.html', { Nome: u.nome || '(sem nome)', Email: u.email, Link: APP_URL });
    await enviarEmail(AVISO_ADMIN_EMAIL, `Novo pedido de acesso: ${u.nome || u.email}`, html);
  } catch (e) {
    await marcar(quem.email, 'select=email', { aviso_pedido_em: null }).catch(() => {});
    throw e;
  }
  return 'enviado';
}

async function avisoLiberado(quem, email) {
  const adm = await fetch(`${SUPABASE_URL}/rest/v1/rpc/epi_admin_is_admin`, {
    method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: quem.auth, 'Content-Type': 'application/json' }, body: '{}'
  });
  if (!adm.ok || (await adm.json()) !== true) return 'sem permissão';
  const alvo = String(email || '').trim().toLowerCase();
  const u = alvo && await linha(alvo);
  if (!u || !u.ativo) return 'nada a avisar';
  if (u.aviso_liberado_em && new Date(u.aviso_liberado_em) >= new Date(u.updated_at)) return 'já avisado';
  const antes = u.aviso_liberado_em;
  const filtro = antes ? `aviso_liberado_em=eq.${encodeURIComponent(antes)}` : 'aviso_liberado_em=is.null';
  if (!(await marcar(alvo, `${filtro}&ativo=is.true`, { aviso_liberado_em: new Date().toISOString() }))) return 'já avisado';
  try {
    const html = await modelo('aviso-liberado.html', { Nome: u.nome ? ' ' + u.nome.split(/\s+/)[0] : '', Email: u.email, Link: APP_URL });
    await enviarEmail(u.email, 'Seu acesso ao Gestão de EPI foi liberado', html);
  } catch (e) {
    await marcar(alvo, 'select=email', { aviso_liberado_em: antes }).catch(() => {});
    throw e;
  }
  return 'enviado';
}

export async function handleAvisos(req, res, send) {
  const json = (status, obj) => send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(obj));
  if (!avisosLigados) return json(200, { resultado: 'desligado' });
  let body = '';
  for await (const parte of req) { body += parte; if (body.length > 2000) return json(413, { erro: 'grande demais' }); }
  let dados;
  try { dados = JSON.parse(body || '{}'); } catch { return json(400, { erro: 'JSON inválido' }); }
  try {
    const quem = await quemChamou(req);
    if (!quem) return json(401, { erro: 'login obrigatório' });
    let resultado;
    if (dados.tipo === 'pedido') resultado = await avisoPedido(quem);
    else if (dados.tipo === 'liberado') resultado = await avisoLiberado(quem, dados.email);
    else return json(400, { erro: 'tipo inválido' });
    console.log(`[AVISOS] ${dados.tipo}: ${resultado}`);
    return json(200, { resultado });
  } catch (e) {
    console.error('[AVISOS]', e.message);
    return json(500, { erro: 'não foi possível enviar o aviso' });
  }
}
