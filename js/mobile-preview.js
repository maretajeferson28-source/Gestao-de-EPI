(() => {
  'use strict';

  // Botão "Celular" no topo (só computador e só administrador): abre o próprio
  // app numa moldura de 390 px, onde as regras de css/mobile.css passam a valer.
  if (window.__EPI_MOBILE_PREVIEW__) return;
  window.__EPI_MOBILE_PREVIEW__ = true;
  if (window.top !== window) return; // dentro da própria moldura não aparece

  const $ = (id) => document.getElementById(id);
  function isAdmin() { try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; } catch (_) { return false; } }
  function icons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); }

  let toggle = null;
  let panel = null;

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'mp-overlay';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="mp-side" role="dialog" aria-label="Prévia do celular">
        <div class="mp-bar">
          <strong>Prévia do celular</strong>
          <button class="btn compact" type="button" data-mp-reload title="Recarregar a prévia"><i data-lucide="refresh-cw"></i>Recarregar</button>
          <button class="btn compact" type="button" data-mp-close aria-label="Fechar prévia"><i data-lucide="x"></i></button>
        </div>
        <div class="mp-stage"><div class="mp-phone"><iframe title="App em tamanho de celular"></iframe></div></div>
      </div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
      if (e.target === panel || e.target.closest('[data-mp-close]')) setOpen(false);
      if (e.target.closest('[data-mp-reload]')) panel.querySelector('iframe').contentWindow?.location.reload();
    });
    icons();
  }

  // A tela do celular fica sempre com 390 × 844; se não couber na altura, o desenho inteiro diminui.
  function fit() {
    if (!panel || panel.hidden) return;
    const stage = panel.querySelector('.mp-stage');
    const phone = panel.querySelector('.mp-phone');
    const scale = Math.min(1, stage.clientHeight / 864);
    phone.style.transform = `scale(${scale})`;
    stage.style.width = `${Math.ceil(410 * scale)}px`;
  }

  function setOpen(open) {
    if (!panel) buildPanel();
    toggle.querySelector('input').checked = open;
    panel.hidden = !open;
    const frame = panel.querySelector('iframe');
    if (open && !frame.src) frame.src = location.origin + location.pathname;
    if (!open) frame.removeAttribute('src'); // fecha de verdade, sem deixar o app rodando escondido
    if (open) requestAnimationFrame(fit);
  }

  function build() {
    const status = document.querySelector('.topbar .status');
    if (!status || $('mpToggle')) return;
    toggle = document.createElement('label');
    toggle.className = 'mp-switch';
    toggle.id = 'mpToggle';
    toggle.hidden = true;
    toggle.title = 'Ver como o app fica no celular';
    toggle.innerHTML = '<input type="checkbox"><span class="mp-track" aria-hidden="true"></span><i data-lucide="smartphone"></i><span>Celular</span>';
    status.insertBefore(toggle, $('signOutBtn'));
    toggle.querySelector('input').addEventListener('change', (e) => setOpen(e.target.checked));
    window.addEventListener('resize', fit);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !panel.hidden) setOpen(false); });
    icons();
  }

  function sync() {
    if (!toggle) return;
    toggle.hidden = !isAdmin();
    if (!isAdmin() && panel && !panel.hidden) setOpen(false);
  }

  function start() {
    build();
    sync();
    window.addEventListener('epi:data-loaded', sync);
    const begin = Date.now();
    const timer = setInterval(() => { sync(); if (isAdmin() || Date.now() - begin > 15000) clearInterval(timer); }, 400);
    const statusText = $('statusText');
    if (statusText) new MutationObserver(sync).observe(statusText, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
