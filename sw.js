'use strict';
// App offline: guarda no aparelho os arquivos do próprio app (telas, estilos,
// código, ícones) e as bibliotecas das CDNs, para o app abrir sem internet.
// Nunca guarda respostas do banco/gateway, da autenticação ou da /api.
const SHELL = 'epi-app-v3';     // arquivos do próprio app (rede primeiro, cópia se cair)
const LIBS = 'epi-libs-v3';     // bibliotecas das CDNs (cópia na hora, atualiza por trás)
const OFFLINE = '/offline.html';
const FIXOS = ['/', OFFLINE, '/assets/app-brand/favicon-192.png', '/assets/app-brand/pwa-512.png', '/assets/app-brand/pwa-maskable-512.png'];
// storage.googleapis.com: modelo da leitura facial (MediaPipe), para validar entrega sem internet.
const CDN = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'storage.googleapis.com'];

// Na instalação já guarda TUDO que a página usa: lê o index.html e o
// js/config.js (que carrega os módulos) e baixa cada arquivo citado. Assim o
// app abre completo sem internet mesmo sem ter passado por todas as telas.
async function listaDoApp() {
  const locais = new Set(FIXOS);
  const cdn = new Set();
  for (const pagina of ['/', '/js/config.js']) {
    try {
      const texto = await (await fetch(pagina, { cache: 'no-store' })).text();
      for (const m of texto.matchAll(/(?:src|href)=["']([^"']+)["']|['"]((?:\/)?(?:js|css|assets)\/[^'"\s]+)['"]/g)) {
        const bruto = m[1] || m[2];
        if (!bruto || bruto.startsWith('data:') || bruto.startsWith('#')) continue;
        const url = new URL(bruto, self.location.origin);
        if (url.origin === self.location.origin) {
          if (/^\/(js|css|assets)\//.test(url.pathname) || url.pathname.endsWith('.webmanifest')) locais.add(url.pathname + url.search);
        } else if (CDN.includes(url.hostname)) cdn.add(url.href);
      }
    } catch (_) { /* sem rede na instalação: fica com os fixos */ }
  }
  return { locais: [...locais], cdn: [...cdn] };
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const { locais, cdn } = await listaDoApp();
    const shell = await caches.open(SHELL);
    // Um arquivo que falhar não impede os outros.
    await Promise.all(locais.map((p) => shell.add(p).catch(() => null)));
    const libs = await caches.open(LIBS);
    await Promise.all(cdn.map((u) => fetch(new Request(u, { mode: 'no-cors' })).then((r) => libs.put(u, r)).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL, LIBS];
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('epi-') && !keep.includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro: com internet sempre pega a versão nova (e atualiza a cópia);
// sem internet usa a cópia guardada — a mesma versão ou, se o "?v=" mudou, a
// última cópia daquele arquivo.
async function redePrimeiro(request, fallback) {
  const cache = await caches.open(SHELL);
  try {
    const resp = await fetch(request);
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch (err) {
    const salvo = await cache.match(request) || await cache.match(request, { ignoreSearch: true }) || (fallback && await cache.match(fallback));
    if (salvo) return salvo;
    throw err;
  }
}

// Bibliotecas de CDN: responde com a cópia (rápido e sem gastar rede) e
// atualiza a cópia em segundo plano quando há internet.
async function copiaPrimeiro(request) {
  const cache = await caches.open(LIBS);
  const salvo = await cache.match(request) || await cache.match(request.url);
  const atualiza = fetch(request).then((resp) => { if (resp.ok || resp.type === 'opaque') cache.put(request, resp.clone()); return resp; }).catch(() => null);
  return salvo || (await atualiza) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return; // consulta CAEPI: sempre na hora
    if (req.mode === 'navigate') {
      event.respondWith(redePrimeiro(req, '/').catch(() => caches.match(OFFLINE)));
      return;
    }
    event.respondWith(redePrimeiro(req));
    return;
  }

  if (CDN.includes(url.hostname)) event.respondWith(copiaPrimeiro(req));
});
