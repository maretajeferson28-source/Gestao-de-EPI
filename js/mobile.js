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
  // Início: página de entrada do celular, com saudação e atalhos grandes para
  // as páginas do menu. O botão é mobile-only; no computador nada aparece.
  const navList = sidebar.querySelector('.nav');
  const homeButton = document.createElement('button');
  homeButton.type = 'button';
  homeButton.className = 'mobile-only';
  homeButton.dataset.page = 'inicio';
  homeButton.innerHTML = `<span class="ico">${icon('house')}</span><span class="text">Início</span>`;
  navList.prepend(homeButton);
  const homePage = document.createElement('section');
  homePage.className = 'page mobile-home';
  homePage.dataset.pageContent = 'inicio';
  app.querySelector('.content').prepend(homePage);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  // Barra inferior do celular: Início, C.A., Entrega (botão central), Termo e
  // Estoque. Cada item aciona o botão correspondente do menu lateral, que no
  // celular fica escondido (mobile.css). Sem `page`: recurso ainda não existe.
  const TABS = [
    { page: 'inicio', label: 'Início', icon: 'house' },
    { page: 'caepi', label: 'C.A.', icon: 'search' },
    { page: 'nova', label: 'Entrega', icon: 'clipboard-list', main: true },
    { label: 'Termo', icon: 'shield-check' },
    { page: 'estoque', label: 'Estoque', icon: 'warehouse' }
  ];
  const tabbar = document.createElement('nav');
  tabbar.className = 'mobile-only mobile-tabbar';
  tabbar.setAttribute('aria-label', 'Navegação principal');
  tabbar.innerHTML = TABS.map((tab) => `
    <button type="button" class="mobile-tab${tab.main ? ' is-main' : ''}${tab.page ? '' : ' is-soon'}"
      ${tab.page ? `data-tab="${tab.page}"` : 'disabled aria-disabled="true" title="Em breve"'}>
      <span class="mobile-tab-icon">${icon(tab.icon)}</span>
      <span class="mobile-tab-label">${escapeHtml(tab.label)}</span>
    </button>`).join('');
  app.appendChild(tabbar);
  tabbar.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) navList.querySelector(`[data-page="${CSS.escape(tab.dataset.tab)}"]`)?.click();
  });
  function syncTabbar() {
    const active = sidebar.querySelector('[data-page].active')?.dataset.page;
    tabbar.querySelectorAll('[data-tab]').forEach((tab) => {
      // Item que a pessoa não pode abrir (ex.: Entrega para leitor) some da barra.
      const target = navList.querySelector(`[data-page="${CSS.escape(tab.dataset.tab)}"]`);
      tab.hidden = !target || target.hidden;
      tab.classList.toggle('active', tab.dataset.tab === active);
    });
  }

  // Início: resumo rápido das saídas (os atalhos agora estão na barra).
  const fmtDate = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : '—'; };
  let lastHomeHtml = '';
  function renderHome() {
    if (!homePage.classList.contains('active')) return;
    const name = (document.getElementById('sideUserName')?.textContent || '').trim();
    const firstName = name && name !== 'Usuário' ? name.split(/\s+/)[0] : '';
    const list = typeof movements !== 'undefined' && Array.isArray(movements) ? movements : [];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const month = today.slice(0, 7);
    const qty = (rows) => rows.reduce((sum, row) => sum + (Number(row.quantidade) || 0), 0);
    const hoje = list.filter((row) => String(row.data || '').slice(0, 10) === today);
    const mes = list.filter((row) => String(row.data || '').slice(0, 7) === month);
    const ultimas = list.slice().sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 5);
    const html = `
      <div class="mobile-home-head">
        <h2>Olá${firstName ? `, ${escapeHtml(firstName)}` : ''}</h2>
        <p>${escapeHtml(now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      </div>
      <div class="mobile-home-stats">
        <div class="mobile-home-stat"><span>Saídas hoje</span><strong>${qty(hoje)}</strong><small>${hoje.length} lançamento(s)</small></div>
        <div class="mobile-home-stat"><span>Saídas no mês</span><strong>${qty(mes)}</strong><small>${mes.length} lançamento(s)</small></div>
      </div>
      <section class="mobile-home-recent">
        <h3>Últimas entregas</h3>
        ${ultimas.length ? `<ul>${ultimas.map((row) => `
          <li>
            <span class="mobile-home-recent-date">${fmtDate(row.data)}</span>
            <span class="mobile-home-recent-info"><strong>${escapeHtml(row.epi || 'EPI')}</strong><small>${escapeHtml(row.colaborador || 'Sem colaborador')}</small></span>
            <span class="mobile-home-recent-qty">${escapeHtml(row.quantidade ?? '—')}</span>
          </li>`).join('')}</ul>` : '<p class="mobile-home-empty">Nenhuma entrega registrada ainda.</p>'}
      </section>`;
    if (html === lastHomeHtml && homePage.childElementCount) return;
    lastHomeHtml = html;
    homePage.innerHTML = html;
  }
  // Os números do resumo vêm do carregamento de dados do app.
  window.addEventListener('epi:data-loaded', renderHome);
  homeButton.addEventListener('click', () => { window.nav?.('inicio'); renderHome(); });

  // Páginas que o celular não mostra (o mobile.css esconde os botões). Se uma
  // delas estiver aberta — o app abre no Dashboard —, vai para a primeira
  // página permitida, que é o Início (primeiro botão do menu).
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
    // Tela que cresceu para computador com o Início aberto: volta ao Dashboard.
    if (!media.matches && homeButton.classList.contains('active')) navList.querySelector('[data-page="dashboard"]')?.click();
    renderHome();
    syncTabbar();
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
