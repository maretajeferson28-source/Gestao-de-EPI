'use strict';
// App offline: guarda no aparelho os arquivos do próprio app (telas, estilos,
// código, ícones) e as bibliotecas das CDNs, para o app abrir sem internet.
// Nunca guarda respostas do banco/gateway, da autenticação ou da /api.
const SHELL = 'epi-app-v2';     // arquivos do próprio app (rede primeiro, cópia se cair)
const LIBS = 'epi-libs-v1';     // bibliotecas das CDNs (cópia na hora, atualiza por trás)
const OFFLINE = '/offline.html';
const PRECACHE = ['/', OFFLINE, '/assets/app-brand/favicon-192.png', '/assets/app-brand/pwa-512.png', '/assets/app-brand/pwa-maskable-512.png'];
const CDN = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL, LIBS];
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('epi-') && !keep.includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro: com internet sempre pega a versão nova (e atualiza a cópia);
// sem internet usa a cópia guardada.
async function redePrimeiro(request, fallback) {
  const cache = await caches.open(SHELL);
  try {
    const resp = await fetch(request);
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch (err) {
    const salvo = await cache.match(request, { ignoreSearch: false }) || (fallback && await cache.match(fallback));
    if (salvo) return salvo;
    throw err;
  }
}

// Bibliotecas de CDN: responde com a cópia (rápido e sem gastar rede) e
// atualiza a cópia em segundo plano quando há internet.
async function copiaPrimeiro(request) {
  const cache = await caches.open(LIBS);
  const salvo = await cache.match(request);
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
