'use strict';
const CACHE = 'epi-offline-v1';
const OFFLINE = '/offline.html';
// Somente tela de contingência e identidade visual pública; nunca dados do app.
const PUBLIC_FILES = [OFFLINE, '/assets/app-brand/favicon-192.png', '/assets/app-brand/pwa-512.png', '/assets/app-brand/pwa-maskable-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('epi-offline-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
  } else if (PUBLIC_FILES.includes(url.pathname) && !url.search) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});
