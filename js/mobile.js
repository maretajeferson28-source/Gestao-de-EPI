(() => {
  'use strict';
  // As folhas dos módulos são inseridas dinamicamente antes deste script.
  const mobileStyle = document.querySelector('link[href="css/mobile.css"]');
  if (mobileStyle) document.head.appendChild(mobileStyle);
  const media = matchMedia('(max-width:720px)');
  const app = document.getElementById('epiApp');
  const sidebar = app?.querySelector('.sidebar');
  const topbar = app?.querySelector('.topbar');
  const main = app?.querySelector('.main');
  if (!sidebar || !topbar) return;
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'mobile-only mobile-icon-btn';
  menuButton.innerHTML = icon('menu');
  menuButton.setAttribute('aria-label', 'Abrir menu');
  menuButton.setAttribute('aria-expanded', 'false');
  sidebar.id = 'mobileMenu';
  menuButton.setAttribute('aria-controls', sidebar.id);
  topbar.prepend(menuButton);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'mobile-only mobile-icon-btn mobile-menu-close';
  closeButton.setAttribute('aria-label', 'Fechar menu');
  closeButton.innerHTML = icon('x');
  sidebar.prepend(closeButton);
  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'mobile-only mobile-backdrop';
  backdrop.hidden = true;
  backdrop.tabIndex = -1;
  backdrop.setAttribute('aria-label', 'Fechar menu');
  app.appendChild(backdrop);
  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'mobile-only btn';
  signOut.innerHTML = `${icon('log-out')}Sair da conta`;
  signOut.addEventListener('click', () => { closeMenu(); document.getElementById('signOutBtn').click(); });
  sidebar.appendChild(signOut);
  let returnFocus = menuButton;
  function closeMenu() {
    const wasOpen = document.body.classList.contains('mobile-menu-open');
    document.body.classList.remove('mobile-menu-open');
    backdrop.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    main.inert = false;
    if (wasOpen && media.matches) returnFocus.focus();
  }
  function openMenu(event) {
    if (!media.matches) return;
    returnFocus = event.currentTarget;
    document.body.classList.add('mobile-menu-open');
    backdrop.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'Menu do aplicativo');
    main.inert = true;
    closeButton.focus();
  }
  menuButton.addEventListener('click', openMenu);
  closeButton.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('[data-page],#sideUserProfile')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (!document.body.classList.contains('mobile-menu-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    if (event.key !== 'Tab') return;
    const focusable = [...sidebar.querySelectorAll('button,a,input,select,[tabindex="0"]')].filter((node) => !node.disabled && node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  // Páginas que o celular não mostra (o mobile.css esconde os botões). Se uma
  // delas estiver aberta — o app abre no Dashboard —, vai para a primeira
  // página permitida. Enquanto o acesso de administrador ainda carrega, a
  // escolha automática pode mudar de novo; depois que a pessoa navega, não.
  const MOBILE_HIDDEN_PAGES = ['dashboard', 'movimentacoes', 'notas'];
  let autoPage = null;
  function leaveHiddenPage() {
    if (!media.matches || app.classList.contains('app-hidden')) return;
    const active = sidebar.querySelector('[data-page].active');
    const preferred = [...sidebar.querySelectorAll('.nav [data-page]')]
      .find((button) => !button.hidden && !MOBILE_HIDDEN_PAGES.includes(button.dataset.page));
    if (!preferred) return;
    const onHidden = !active || MOBILE_HIDDEN_PAGES.includes(active.dataset.page);
    const betterAuto = autoPage && active?.dataset.page === autoPage && preferred.dataset.page !== autoPage;
    if (onHidden || betterAuto) {
      autoPage = preferred.dataset.page;
      preferred.click();
    }
  }
  sidebar.addEventListener('click', (event) => {
    if (event.isTrusted && event.target.closest('[data-page]')) autoPage = null;
  });
  let previousPage = '';
  function syncNavigation() {
    leaveHiddenPage();
    const active = sidebar.querySelector('[data-page].active')?.dataset.page;
    if (media.matches && active !== previousPage) {
      closeMenu();
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    previousPage = active;
    if (app.classList.contains('app-hidden')) closeMenu();
  }
  new MutationObserver(syncNavigation).observe(sidebar.querySelector('.nav'), { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'], childList: true });
  new MutationObserver(syncNavigation).observe(app, { attributes: true, attributeFilter: ['class'] });
  const filters = app.querySelector('.filters');
  if (filters) {
    filters.id = 'mobileDashboardFilters';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-only mobile-filter-toggle';
    toggle.setAttribute('aria-controls', filters.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `${icon('sliders-horizontal')}<span>Filtrar indicadores</span>${icon('chevron-down')}`;
    toggle.addEventListener('click', () => {
      const open = filters.classList.toggle('mobile-filters-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    filters.before(toggle);
  }
  function labelTables() {
    app.querySelectorAll('[data-page-content="dashboard"] .table-wrap table,.movement-table,.authz-table').forEach((table) => {
      table.classList.add('mobile-card-table');
      const labels = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent.trim());
      table.querySelectorAll('tbody tr').forEach((row) => [...row.cells].forEach((cell, index) => {
        if (cell.dataset.mobileLabel !== labels[index]) cell.dataset.mobileLabel = labels[index] || '';
      }));
    });
  }
  const adaptNoteHint = () => {
    const hint = app.querySelector('.nfe-view-hint');
    if (!hint) return;
    const text = media.matches ? 'Use + e − para ampliar a nota. Depois de ampliar, arraste com o dedo. Ajustar volta à nota inteira.' : 'Use + e − para ajustar o zoom. Arraste para mover a nota ampliada. A roda do mouse apenas rola o documento.';
    if (hint.textContent !== text) hint.textContent = text;
  };
  new MutationObserver(() => { if (media.matches) labelTables(); adaptNoteHint(); }).observe(app.querySelector('.content'), { childList: true, subtree: true });
  media.addEventListener('change', () => { closeMenu(); if (media.matches) labelTables(); adaptNoteHint(); syncNavigation(); });
  syncNavigation();
  if (media.matches) labelTables();
  adaptNoteHint();
  window.lucide?.createIcons();
})();
