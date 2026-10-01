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
  const profileButton = document.createElement('button');
  profileButton.type = 'button';
  profileButton.className = 'mobile-only mobile-icon-btn mobile-profile';
  profileButton.setAttribute('aria-label', 'Meu perfil');
  profileButton.innerHTML = icon('user-round');
  profileButton.addEventListener('click', () => document.getElementById('sideUserProfile').click());
  topbar.appendChild(profileButton);
  const syncProfile = () => {
    const image = document.getElementById('sideUserAvatar');
    const name = document.getElementById('sideUserName')?.textContent || 'Usuário';
    profileButton.setAttribute('aria-label', `Meu perfil: ${name}`);
    if (image?.getAttribute('src') && !image.hidden) {
      const clone = image.cloneNode();
      clone.removeAttribute('id');
      clone.alt = '';
      profileButton.replaceChildren(clone);
    } else profileButton.textContent = document.getElementById('sideUserInitial')?.textContent || 'U';
  };
  const profileObserver = new MutationObserver(syncProfile);
  profileObserver.observe(document.getElementById('sideUserAvatarWrap'), { subtree: true, attributes: true, childList: true, characterData: true });
  profileObserver.observe(document.getElementById('sideUserName'), { childList: true, characterData: true, subtree: true });
  syncProfile();
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
  const bottom = document.createElement('nav');
  bottom.className = 'mobile-only mobile-bottom-nav';
  bottom.setAttribute('aria-label', 'Navegação principal');
  const destinations = [
    ['dashboard', 'Início', 'layout-dashboard'],
    ['nova', 'Nova saída', 'package-plus'],
    ['movimentacoes', 'Histórico', 'arrow-right-left'],
    ['caepi', 'Consulta C.A.', 'badge-check']
  ];
  destinations.forEach(([page, label, glyph]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mobilePage = page;
    button.innerHTML = `${icon(glyph)}<span>${label}</span>`;
    button.addEventListener('click', () => {
      const original = sidebar.querySelector(`[data-page="${page}"]`);
      if (!original || original.hidden) return;
      original.click();
    });
    bottom.appendChild(button);
  });
  const more = document.createElement('button');
  more.type = 'button';
  more.innerHTML = `${icon('grid-2x2')}<span>Mais</span>`;
  more.setAttribute('aria-controls', sidebar.id);
  more.setAttribute('aria-expanded', 'false');
  bottom.appendChild(more);
  app.appendChild(bottom);
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
    more.setAttribute('aria-expanded', 'false');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    main.inert = false;
    bottom.inert = false;
    if (wasOpen && media.matches) returnFocus.focus();
  }
  function openMenu(event) {
    if (!media.matches) return;
    returnFocus = event.currentTarget;
    document.body.classList.add('mobile-menu-open');
    backdrop.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
    more.setAttribute('aria-expanded', 'true');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'Menu do aplicativo');
    main.inert = true;
    bottom.inert = true;
    closeButton.focus();
  }
  menuButton.addEventListener('click', openMenu);
  more.addEventListener('click', openMenu);
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
  let previousPage = '';
  function syncNavigation() {
    const active = sidebar.querySelector('[data-page].active')?.dataset.page;
    bottom.querySelectorAll('[data-mobile-page]').forEach((button) => {
      const original = sidebar.querySelector(`[data-page="${button.dataset.mobilePage}"]`);
      button.hidden = !original || original.hidden;
      if (active === button.dataset.mobilePage) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (active && !destinations.some(([page]) => page === active)) more.setAttribute('aria-current', 'page');
    else more.removeAttribute('aria-current');
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
    const text = media.matches ? 'Use + e − para ampliar a nota. Depois de ampliar, arraste com o dedo. Ajustar volta à nota inteira.' : 'Role para cima sobre a nota para ampliar e arraste para mover. No tamanho padrão, rolar para baixo move a página.';
    if (hint.textContent !== text) hint.textContent = text;
  };
  new MutationObserver(() => { if (media.matches) labelTables(); adaptNoteHint(); }).observe(app.querySelector('.content'), { childList: true, subtree: true });
  media.addEventListener('change', () => { closeMenu(); if (media.matches) labelTables(); adaptNoteHint(); syncNavigation(); });
  syncNavigation();
  if (media.matches) labelTables();
  adaptNoteHint();
  window.lucide?.createIcons();
})();
