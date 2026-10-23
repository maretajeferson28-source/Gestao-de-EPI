// Site do Gestão de EPI no Railway: serve os arquivos estáticos do repositório,
// responde /api/caepi (a mesma lógica da função da Vercel) e entrega um
// js/config.js apontando para o gateway do Railway em vez do Supabase.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryCaepi } from '../../../api/caepi.js';
import { handleAvisos } from './avisos.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis do serviço.');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// O site só precisa da raiz, de js/, css/ e assets/; o resto do repositório fica fora.
const BLOCKED = /^\/(\.|infra\/|scripts\/|supabase\/|node_modules\/|netlify\/|api\/|docs\/|package|pnpm-lock|README)/i;

// Mesmos cabeçalhos do arquivo _headers.
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN'
};

async function buildConfigJs() {
  const src = await readFile(join(ROOT, 'js', 'config.js'), 'utf8');
  const out = src
    .replace(/SUPABASE_URL:\s*"[^"]*"/, `SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)}`)
    .replace(/SUPABASE_PUBLISHABLE_KEY:\s*"[^"]*"/, `SUPABASE_PUBLISHABLE_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)}`);
  if (!out.includes(JSON.stringify(SUPABASE_URL)) || !out.includes(JSON.stringify(SUPABASE_ANON_KEY))) {
    throw new Error('js/config.js mudou de formato: não foi possível apontar para o gateway.');
  }
  return out;
}

const configJs = await buildConfigJs();

function send(res, status, headers, body, head) {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(head ? undefined : body);
}

async function handleCaepi(url, res, head) {
  try {
    const data = await queryCaepi(url.searchParams.get('ca') || '');
    send(res, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }, JSON.stringify(data), head);
  } catch (error) {
    console.error('[CAEPI API]', error);
    send(res, 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      JSON.stringify({ error: 'Não foi possível consultar a base CAEPI.' }), head);
  }
}

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/avisos') return handleAvisos(req, res, send);
  const head = req.method === 'HEAD';
  if (req.method !== 'GET' && !head) {
    return send(res, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Método não permitido.');
  }

  const url = new URL(req.url, 'http://localhost');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Endereço inválido.', head);
  }

  if (path === '/api/caepi') return handleCaepi(url, res, head);
  if (path === '/health') return send(res, 200, { 'Content-Type': 'text/plain' }, 'ok', head);
  if (path === '/js/config.js') {
    return send(res, 200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' }, configJs, head);
  }

  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (BLOCKED.test(path) || !file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Não encontrado.', head);
  }

  try {
    const body = await readFile(file);
    send(res, 200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }, body, head);
  } catch {
    send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Não encontrado.', head);
  }
}).listen(PORT, '::', () => console.log(`Gestão de EPI ouvindo na porta ${PORT}`));
