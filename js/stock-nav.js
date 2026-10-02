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

  function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
  }

  function totalSaidas() {
    try {
      if (typeof movements === 'undefined' || !Array.isArray(movements)) return 0;
      return movements.reduce((sum, movement) => sum + (Number(movement?.quantidade) || 0), 0);
    } catch (_) {
      return 0;
    }
  }

  function ensureStockStyles() {
    if (document.getElementById('stockKpiStyles')) return;

    const style = document.createElement('style');
    style.id = 'stockKpiStyles';
    style.textContent = `
      [data-page-content="estoque"] .stock-kpis{
        grid-template-columns:repeat(4,minmax(0,1fr));
        margin-bottom:0;
      }
      [data-page-content="estoque"] .stock-kpi::before{
        background:var(--stock-kpi-accent,var(--gold));
      }
      [data-page-content="estoque"] .stock-kpi-stock{--stock-kpi-accent:#35c98b}
      [data-page-content="estoque"] .stock-kpi-out{--stock-kpi-accent:#ff6600}
      [data-page-content="estoque"] .stock-kpi-min{--stock-kpi-accent:#ffb800}
      [data-page-content="estoque"] .stock-kpi-critical{--stock-kpi-accent:#ef5b5b}

      [data-page-content="estoque"] .stock-filter-bar{
        margin-top:28px;
        width:min(760px,100%);
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        align-items:center;
        gap:8px;
      }
      [data-page-content="estoque"] .stock-filter-bar input{
        width:100%;
        height:40px;
        background:#262626;
        border:1px solid rgba(232,111,24,.18);
        color:#fff;
        border-radius:9px;
        padding:0 12px;
        outline:none;
      }
      [data-page-content="estoque"] .stock-filter-bar input::placeholder{
        color:#8f8f8f;
      }
      [data-page-content="estoque"] .stock-filter-bar input:focus{
        border-color:var(--gold);
        box-shadow:0 0 10px rgba(232,111,24,.18);
      }
      [data-page-content="estoque"] .stock-search-btn{
        min-height:36px!important;
        height:36px!important;
        padding:0 10px!important;
        border-radius:8px!important;
        gap:6px!important;
        font-size:12px!important;
        font-weight:800!important;
        line-height:1!important;
        white-space:nowrap;
      }
      [data-page-content="estoque"] .stock-search-btn svg{
        width:15px!important;
        height:15px!important;
      }

      @media(max-width:900px){
        [data-page-content="estoque"] .stock-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:520px){
        [data-page-content="estoque"] .stock-kpis{grid-template-columns:1fr}
        [data-page-content="estoque"] .stock-filter-bar{grid-template-columns:1fr auto;width:100%;margin-top:20px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderStockKpis(page) {
    if (!page) return;
    const exits = totalSaidas();

    const stockValue = page.querySelector('#stockKpiStock');
    const outValue = page.querySelector('#stockKpiOut');
    const minValue = page.querySelector('#stockKpiMin');
    const criticalValue = page.querySelector('#stockKpiCritical');

    if (stockValue) stockValue.textContent = '0';
    if (outValue) outValue.textContent = formatNumber(exits);
    if (minValue) minValue.textContent = '0';
    if (criticalValue) criticalValue.textContent = '0';
  }

  function buildStockStage(page) {
    if (!page || page.dataset.stockKpisReady === 'true') return;

    ensureStockStyles();
    page.innerHTML = `
      <div class="kpis stock-kpis">
        <div class="kpi stock-kpi stock-kpi-stock">
          <div class="label">Estoque</div>
          <div class="value" id="stockKpiStock">0</div>
          <div class="sub">itens disponíveis</div>
        </div>
        <div class="kpi stock-kpi stock-kpi-out">
          <div class="label">Saídas</div>
          <div class="value" id="stockKpiOut">0</div>
          <div class="sub">itens movimentados</div>
        </div>
        <div class="kpi stock-kpi stock-kpi-min">
          <div class="label">Mínimo</div>
          <div class="value" id="stockKpiMin">0</div>
          <div class="sub">itens no limite mínimo</div>
        </div>
        <div class="kpi stock-kpi stock-kpi-critical">
          <div class="label">Crítico</div>
          <div class="value" id="stockKpiCritical">0</div>
          <div class="sub">itens abaixo do mínimo</div>
        </div>
      </div>

      <form class="stock-filter-bar" id="stockFilterForm">
        <input id="stockSearchInput" type="search" autocomplete="off" placeholder="Buscar EPI / Item">
        <button class="btn primary stock-search-btn" id="stockSearchBtn" type="submit">
          <i data-lucide="search" aria-hidden="true"></i><span>Buscar</span>
        </button>
      </form>`;

    const filterForm = page.querySelector('#stockFilterForm');
    filterForm?.addEventListener('submit', (event) => {
      event.preventDefault();
    });

    page.dataset.stockKpisReady = 'true';
    renderStockKpis(page);
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

    buildStockStage(page);

    button.addEventListener('click', () => {
      if (!isAdmin()) return;

      document.querySelectorAll('.nav button').forEach((navButton) => {
        navButton.classList.toggle('active', navButton === button);
      });

      document.querySelectorAll('.page').forEach((stage) => {
        stage.classList.toggle('active', stage === page);
      });

      renderStockKpis(page);
      refreshIcons();
    });

    const statusText = document.getElementById('statusText');
    if (statusText) {
      new MutationObserver(() => renderStockKpis(page)).observe(statusText, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

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
