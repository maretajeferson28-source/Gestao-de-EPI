import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

test('mobile sem navegação inferior nem perfil duplicado no cabeçalho', () => {
  const source = read('js/mobile.js');
  assert.ok(!source.includes('mobile-bottom-nav'));
  assert.ok(!source.includes('profileButton'));
  assert.ok(source.includes("'Abrir menu'"));
  assert.ok(source.includes('#sideUserProfile'));
});
test('nota fiscal usa botões de zoom sem interceptar a roda do mouse', () => {
  const source = read('js/nfe.js');
  assert.ok(!/addEventListener\(['"]wheel['"]/.test(source));
  assert.ok(source.includes("$('nfeZoomIn').addEventListener('click'"));
  assert.ok(source.includes("$('nfeZoomOut').addEventListener('click'"));
});

test('manifest instalável e ícones reais com dimensões declaradas', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const png = readFileSync(new URL(icon.src.slice(1), root));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
test('CSS isolado no mobile; desktop sem overrides', () => {
  const css = read('css/mobile.css').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.ok(css.startsWith('.mobile-only{display:none!important}'));
  const remaining = css.slice('.mobile-only{display:none!important}'.length).trim();
  let depth = 0, start = 0;
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i] === '{') {
      if (depth === 0) assert.match(remaining.slice(start, i).trim(), /^@media\(max-width:(720|360)px\)/);
      depth++;
    }
    if (remaining[i] === '}') { depth--; if (depth === 0) start = i + 1; }
  }
  assert.equal(depth, 0);
});
test('HTML referencia os arquivos do PWA e do mobile', () => {
  const html = read('index.html');
  for (const file of ['manifest.webmanifest', 'css/mobile.css', 'js/mobile.js', 'js/pwa.js']) {
    assert.ok(html.includes(file));
    assert.ok(existsSync(fileURLToPath(new URL(file, root))));
  }
  assert.ok(html.includes('viewport-fit=cover'));
});
function worker() {
  const listeners = {}, cached = [], requests = [];
  let offline = false;
  const context = {
    URL,
    self: { location: { origin: 'https://epi.test' }, addEventListener: (name, fn) => { listeners[name] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => ({ addAll: async (files) => cached.push(...files) }), keys: async () => [], match: async (key) => ({ offlinePage: key }), delete: async () => true },
    fetch: async (request) => { requests.push(request); if (offline) throw Error('offline'); return { fromNetwork: true }; }
  };
  vm.runInNewContext(read('sw.js'), context);
  return { listeners, cached, requests, setOffline: () => { offline = true; } };
}
test('cache limitado à contingência e ícones públicos', async () => {
  const sw = worker();
  let pending;
  sw.listeners.install({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(sw.cached.length, 4);
  assert.ok(sw.cached.every((file) => file === '/offline.html' || file.startsWith('/assets/app-brand/')));
  assert.ok(!sw.cached.includes('/index.html'));
});
test('autenticação, banco, uploads e arquivos privados não são interceptados', () => {
  const sw = worker();
  for (const request of [
    { url: 'https://project.supabase.co/rest/v1/movements', method: 'GET' },
    { url: 'https://epi.test/api/auth', method: 'POST' },
    { url: 'https://epi.test/api/private', method: 'GET' },
    { url: 'https://epi.test/js/app.js', method: 'GET' },
    { url: 'https://epi.test/private/invoice.pdf', method: 'GET' }
  ]) {
    let intercepted = false;
    sw.listeners.fetch({ request, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, request.url);
  }
});
test('navegação usa rede e retorna contingência somente sem conexão', async () => {
  const sw = worker();
  const request = { url: 'https://epi.test/', method: 'GET', mode: 'navigate' };
  let result;
  sw.listeners.fetch({ request, respondWith: (promise) => { result = promise; } });
  assert.equal((await result).fromNetwork, true);
  sw.setOffline();
  sw.listeners.fetch({ request, respondWith: (promise) => { result = promise; } });
  assert.equal((await result).offlinePage, '/offline.html');
});
