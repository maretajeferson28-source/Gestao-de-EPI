(() => {
  'use strict';

  if (window.__EPI_STOCK_NAV__) return;
  window.__EPI_STOCK_NAV__ = true;

  function isAdmin() {
    try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; }
    catch (_) { return false; }
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
    }
  }

  function syncAdminButton(button) {
    const start = Date.now();
    const timer = setInterval(() => {
      button.hidden = !isAdmin();
      if (isAdmin() || Date.now() - start > 15000) clearInterval(timer);
    }, 350);
  }

  function injectStockButton() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-stock-nav]')) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.stockNav = 'true';
    button.setAttribute('data-admin-only', '');
    button.hidden = true;
    button.innerHTML = '<span class="ico"><i data-lucide="warehouse"></i></span><span class="text">Estoque</span>';

    const notesButton = nav.querySelector('[data-page="notas"]');
    const epiButton = nav.querySelector('[data-page="epis"]');
    const anchor = notesButton || epiButton;

    if (anchor) anchor.insertAdjacentElement('afterend', button);
    else nav.appendChild(button);

    // Por enquanto o botão é apenas visual na navbar; nenhum stage/página é criado.
    button.addEventListener('click', (event) => event.preventDefault());

    syncAdminButton(button);
    refreshIcons();
    return true;
  }

  function start() {
    if (injectStockButton()) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (injectStockButton() || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
