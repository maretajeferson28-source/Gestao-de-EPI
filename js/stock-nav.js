(() => {
  'use strict';

  if (window.__EPI_STOCK_NAV__) return;
  window.__EPI_STOCK_NAV__ = true;

  let stockSummary = null;
  let stockItens = null; // saldo de cada EPI (epi_stock_por_item)
  let refreshId = 0;

  function isAdmin() {
    try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; }
    catch (_) { return false; }
  }

  function db() {
    try { return typeof sb !== 'undefined' ? sb : null; }
    catch (_) { return null; }
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
    }
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
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
        width:min(860px,100%);
        display:grid;
        grid-template-columns:minmax(0,1fr) auto auto;
        align-items:center;
        gap:8px;
      }
      [data-page-content="estoque"] .stock-filter-bar input{
        width:100%;
        height:36px;
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
      [data-page-content="estoque"] .stock-search-btn,
      [data-page-content="estoque"] .stock-register-btn{
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
      [data-page-content="estoque"] .stock-search-btn svg,
      [data-page-content="estoque"] .stock-register-btn svg{
        width:15px!important;
        height:15px!important;
      }

      @media(max-width:900px){
        [data-page-content="estoque"] .stock-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:520px){
        [data-page-content="estoque"] .stock-kpis{grid-template-columns:1fr}
        [data-page-content="estoque"] .stock-filter-bar{grid-template-columns:1fr auto auto;width:100%;margin-top:20px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderStockKpis(page) {
    if (!page) return;
    const stockValue = page.querySelector('#stockKpiStock');
    const outValue = page.querySelector('#stockKpiOut');
    const minValue = page.querySelector('#stockKpiMin');
    const criticalValue = page.querySelector('#stockKpiCritical');

    if (stockValue) stockValue.textContent = stockSummary ? formatNumber(stockSummary.saldo) : '—';
    if (outValue) outValue.textContent = stockSummary ? formatNumber(stockSummary.saidas) : '—';
    if (minValue) minValue.textContent = '—';
    if (criticalValue) criticalValue.textContent = stockSummary ? formatNumber(stockSummary.criticos) : '—';
  }

  // Saldo por EPI: cartões no computador e lista no celular (css/mobile.css).
  function renderStockItens(page) {
    const box = page?.querySelector('#stockItens');
    if (!box) return;
    if (!isAdmin() || !Array.isArray(stockItens)) { box.hidden = true; return; }
    box.hidden = false;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const busca = page.querySelector('#stockSearchInput')?.value.trim();
    const cards = stockItens.map((i) => {
      const critico = Number(i.saldo) <= 0;
      return `<article class="stock-item${critico ? ' is-critico' : ''}">
        <strong class="stock-item-nome" title="${esc(i.nome)}">${esc(i.nome)}</strong>
        <span class="stock-item-saldo">${formatNumber(i.saldo)}<small>em estoque</small></span>
        <span class="stock-item-mov"><span class="stock-item-mov-saldo">Estoque ${formatNumber(i.saldo)}</span><span class="stock-item-mov-entrou">Entrou ${formatNumber(i.entradas)}</span><span class="stock-item-mov-saiu">Saiu ${formatNumber(i.saidas)}</span></span>
        <span class="stock-item-tag">${critico ? 'Crítico' : 'OK'}</span>
      </article>`;
    }).join('');
    box.innerHTML = `<h3 class="stock-itens-titulo">Saldo por item</h3>${cards ? `<div class="stock-itens-grade">${cards}</div>` : `<p class="stock-itens-vazio">${busca ? 'Nenhum EPI com estoque para essa busca.' : 'Nenhum EPI com entrada de estoque ainda. Lance uma nota fiscal ou use o Cadastro.'}</p>`}`;
  }

  async function refreshStockFromSupabase(page) {
    const client = db();
    const request = ++refreshId;
    if (!client || !isAdmin()) {
      stockSummary = null;
      stockItens = null;
      renderStockKpis(page);
      renderStockItens(page);
      return;
    }

    try {
      const busca = page.querySelector('#stockSearchInput')?.value.trim() || '';
      const [resumo, itens] = await Promise.all([
        client.rpc('epi_stock_summary', { p_busca: busca }),
        client.rpc('epi_stock_por_item', { p_busca: busca })
      ]);
      if (resumo.error) throw resumo.error;
      if (request !== refreshId || !isAdmin()) return;
      stockSummary = resumo.data;
      stockItens = itens.error ? null : (itens.data || []);
      if (itens.error) console.error('[Estoque] Falha ao carregar o saldo por item', itens.error);
      const msg = page.querySelector('#stockStatus');
      if (msg) { msg.textContent = ''; msg.hidden = true; }
    } catch (error) {
      if (request !== refreshId) return;
      stockSummary = null;
      stockItens = null;
      console.error('[Estoque] Falha ao carregar entradas de NF-e', error);
      const msg = page.querySelector('#stockStatus');
      if (msg) { msg.textContent = 'Não foi possível consultar o saldo: ' + (error.message || error); msg.hidden = false; }
    }

    renderStockKpis(page);
    renderStockItens(page);
  }

  function buildStockStage(page) {
    if (!page || page.dataset.stockKpisReady === 'true') return;

    ensureStockStyles();
    page.innerHTML = `
      <div class="kpis stock-kpis">
        <div class="kpi stock-kpi stock-kpi-stock">
          <div class="label">Estoque</div>
          <div class="value" id="stockKpiStock">0</div>
          <div class="sub">entradas menos saídas</div>
        </div>
        <div class="kpi stock-kpi stock-kpi-out">
          <div class="label">Saídas</div>
          <div class="value" id="stockKpiOut">0</div>
          <div class="sub">baixas do estoque por notas</div>
        </div>
        <div class="kpi stock-kpi stock-kpi-min">
          <div class="label">Mínimo</div>
          <div class="value" id="stockKpiMin">0</div>
          <div class="sub">ainda não configurado</div>
        </div>
        <div class="kpi stock-kpi stock-kpi-critical">
          <div class="label">Crítico</div>
          <div class="value" id="stockKpiCritical">0</div>
          <div class="sub">itens com saldo zero ou negativo</div>
        </div>
      </div>

      <form class="stock-filter-bar" id="stockFilterForm">
        <input id="stockSearchInput" type="search" autocomplete="off" placeholder="Buscar EPI / Item">
        <button class="btn primary stock-search-btn" id="stockSearchBtn" type="submit">
          <i data-lucide="search" aria-hidden="true"></i><span>Buscar</span>
        </button>
        <button class="btn primary stock-register-btn" id="stockRegisterBtn" type="button" title="Cadastrar estoque antigo">
          <i data-lucide="package-plus" aria-hidden="true"></i><span>Cadastro</span>
        </button>
      </form>
      <p id="stockStatus" role="status" hidden style="font-size:12px;color:var(--muted);line-height:1.6"></p>
      <section class="stock-itens" id="stockItens" aria-live="polite" hidden></section>`;

    const filterForm = page.querySelector('#stockFilterForm');
    filterForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      refreshStockFromSupabase(page);
    });
    // Filtra enquanto digita (espera a pessoa parar de digitar para consultar uma vez só).
    let filtroTimer = 0;
    page.querySelector('#stockSearchInput')?.addEventListener('input', () => {
      clearTimeout(filtroTimer);
      filtroTimer = setTimeout(() => refreshStockFromSupabase(page), 450);
    });

    page.querySelector('#stockRegisterBtn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('epi:stock-register-request'));
    });

    page.dataset.stockKpisReady = 'true';
    renderStockKpis(page);
    refreshStockFromSupabase(page);
  }

  function syncAdminButton(button) {
    const start = Date.now();
    const timer = setInterval(() => {
      button.hidden = !isAdmin();
      if (isAdmin()) {
        const page = document.querySelector('[data-page-content="estoque"]');
        refreshStockFromSupabase(page);
      }
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
      refreshStockFromSupabase(page);
      refreshIcons();
    });

    window.addEventListener('epi:stock-changed', () => refreshStockFromSupabase(page));
    window.addEventListener('epi:data-loaded', () => { button.hidden = !isAdmin(); refreshStockFromSupabase(page); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && page.classList.contains('active')) refreshStockFromSupabase(page);
    });

    const statusText = document.getElementById('statusText');
    if (statusText) {
      new MutationObserver(() => { if (!isAdmin()) { stockSummary = null; renderStockKpis(page); } }).observe(statusText, {
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
