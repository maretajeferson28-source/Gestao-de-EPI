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
    const content = document.querySelector('.content');
    if (!nav || !content || nav.querySelector('[data-stock-nav]')) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.stockNav = 'true';
    button.dataset.page = 'estoque';
    button.setAttribute('data-admin-only', '');
    button.hidden = true;
    button.innerHTML = '<span class="ico"><i data-lucide="warehouse"></i></span><span class="text">Estoque</span>';

    const notesButton = nav.querySelector('[data-page="notas"]');
    const epiButton = nav.querySelector('[data-page="epis"]');
    const anchor = notesButton || epiButton;

    if (anchor) anchor.insertAdjacentElement('afterend', button);
    else nav.appendChild(button);

    let page = content.querySelector('[data-page-content="estoque"]');
    if (!page) {
      page = document.createElement('section');
      page.className = 'page';
      page.dataset.pageContent = 'estoque';

      const caPage = content.querySelector('[data-page-content="caepi"]');
      if (caPage) caPage.insertAdjacentElement('beforebegin', page);
      else content.appendChild(page);
    }

    button.addEventListener('click', () => {
      if (!isAdmin()) return;

      document.querySelectorAll('.nav button').forEach((navButton) => {
        navButton.classList.toggle('active', navButton === button);
      });

      document.querySelectorAll('.page').forEach((stage) => {
        stage.classList.toggle('active', stage === page);
      });

      refreshIcons();
    });

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
