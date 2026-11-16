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
    // Mínimo: quantos itens estão acima de zero mas no mínimo ou abaixo dele.
    const comMinimo = Array.isArray(stockItens) ? stockItens.filter((i) => i.minimo != null) : [];
    const baixos = comMinimo.filter((i) => Number(i.saldo) > 0 && Number(i.saldo) <= Number(i.minimo)).length;
    if (minValue) minValue.textContent = comMinimo.length ? formatNumber(baixos) : '—';
    const minSub = minValue?.parentElement?.querySelector('.sub');
    if (minSub) minSub.textContent = comMinimo.length ? 'no mínimo ou abaixo' : 'ainda não configurado';
    if (criticalValue) criticalValue.textContent = stockSummary ? formatNumber(stockSummary.criticos) : '—';
    // Mesmos números nos KPIs do PC.
    const pc = (id, txt) => { const el = page.querySelector('#' + id); if (el) el.textContent = txt; };
    pc('estqKpiStock', stockValue?.textContent || '—');
    pc('estqKpiOut', outValue?.textContent || '—');
    pc('estqKpiMin', minValue?.textContent || '—');
    pc('estqKpiMinSub', minSub?.textContent || 'no mínimo ou abaixo');
    pc('estqKpiCritical', criticalValue?.textContent || '—');
  }

  // Saldo por EPI: cartões no computador e lista no celular (css/mobile.css).
  function renderStockItens(page) {
    const box = page?.querySelector('#stockItens');
    if (!box) return;
    if (!isAdmin() || !Array.isArray(stockItens)) { box.hidden = true; return; }
    box.hidden = false;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const busca = page.querySelector('#stockSearchInput')?.value.trim();
    // EPIs cadastrados que ainda não tiveram entrada aparecem no fim, com 0.
    const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let catalogo = [];
    try { catalogo = Array.isArray(epiCatalog) ? epiCatalog : []; } catch (_) {}
    const comSaldo = new Set(stockItens.map((i) => i.epi_id));
    const semEntrada = catalogo
      .filter((e) => e.ativo !== false && !comSaldo.has(e.id) && (!busca || semAcento(e.nome).includes(semAcento(busca))))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
      .map((e) => ({ epi_id: e.id, nome: e.nome, entradas: 0, saidas: 0, saldo: 0, minimo: null, semEntrada: true }));
    const cards = [...stockItens, ...semEntrada].map((i) => {
      const critico = !i.semEntrada && Number(i.saldo) <= 0;
      const baixo = !critico && i.minimo != null && Number(i.saldo) <= Number(i.minimo);
      return `<article class="stock-item${i.semEntrada ? ' is-sem-entrada' : critico ? ' is-critico' : baixo ? ' is-baixo' : ''}" data-stock-epi="${esc(i.epi_id)}" data-stock-nome="${esc(i.nome)}" tabindex="0" role="button" title="${i.minimo != null ? `Mínimo: ${formatNumber(i.minimo)} • ` : ''}Clique para editar">
        <span class="stock-item-icone" aria-hidden="true"><i data-lucide="${esc(typeof epiCardIcon === 'function' ? epiCardIcon({ nome: i.nome }) : 'package')}"></i></span>
        <strong class="stock-item-nome" title="${esc(i.nome)}">${esc(i.nome)}</strong>
        <span class="stock-item-saldo">${formatNumber(i.saldo)}<small>em estoque</small></span>
        <span class="stock-item-mov"><span class="stock-item-mov-saldo" title="Em estoque"><i data-lucide="package" aria-hidden="true"></i><span class="rot">Estoque </span>${formatNumber(i.saldo)}</span><span class="stock-item-mov-entrou" title="Entrou"><i data-lucide="arrow-up" aria-hidden="true"></i><span class="rot">Entrou </span>${formatNumber(i.entradas)}</span><span class="stock-item-mov-saiu" title="Saiu"><i data-lucide="arrow-down" aria-hidden="true"></i><span class="rot">Saiu </span>${formatNumber(i.saidas)}</span></span>
        <span class="stock-item-tag">${i.semEntrada ? 'Sem entrada' : critico ? 'Crítico' : baixo ? 'Baixo' : 'OK'}</span>
      </article>`;
    }).join('');
    box.innerHTML = `<h3 class="stock-itens-titulo">Saldo por item</h3>${cards ? `<div class="stock-itens-grade">${cards}</div>` : `<p class="stock-itens-vazio">${busca ? 'Nenhum EPI com estoque para essa busca.' : 'Nenhum EPI com entrada de estoque ainda. Lance uma nota fiscal ou use o Cadastro.'}</p>`}`;
    renderEstqTabela(page, [...stockItens, ...semEntrada]);
    refreshIcons();
  }

  // PC: tabela no estilo de EPIs / Itens (mesmas classes .epi-tab), com
  // páginas. Situação: OK, Baixo (no mínimo ou abaixo), Crítico (zero ou
  // negativo) e Sem entrada. O botão da linha abre a mesma janela do cartão.
  let estqPagina = 1;
  const SIT = { ok: ['ok', 'OK'], baixo: ['atencao', 'Baixo'], critico: ['critico', 'Crítico'], sem: ['sem', 'Sem entrada'] };
  function situacaoDe(i) {
    if (i.semEntrada) return 'sem';
    if (Number(i.saldo) <= 0) return 'critico';
    if (i.minimo != null && Number(i.saldo) <= Number(i.minimo)) return 'baixo';
    return 'ok';
  }
  function estqPorPagina() {
    const wrap = document.querySelector('.estq-tab-wrap');
    const topo = wrap && wrap.offsetParent ? wrap.getBoundingClientRect().top : 380;
    return Math.max(5, Math.floor((window.innerHeight - topo - 38 - 50 - 16) / 46));
  }
  function renderEstqTabela(page, lista) {
    const corpo = page?.querySelector('#estqTabBody');
    if (!corpo) return;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const filtro = page.querySelector('#estqSit')?.value || '';
    page.querySelector('#estqSit')?.classList.toggle('tem-valor', !!filtro);
    const linhas = lista.filter((i) => !filtro || situacaoDe(i) === filtro);
    const porPag = estqPorPagina();
    const paginas = Math.max(1, Math.ceil(linhas.length / porPag));
    if (estqPagina > paginas) estqPagina = paginas;
    const daPagina = linhas.slice((estqPagina - 1) * porPag, estqPagina * porPag);
    const fotoDe = (id) => { try { return epiCaPrincipal(id)?.foto || null; } catch (_) { return null; } };
    const icone = (nome) => (typeof epiCardIcon === 'function' ? epiCardIcon({ nome }) : 'package');
    corpo.innerHTML = daPagina.map((i) => {
      const s = SIT[situacaoDe(i)], foto = fotoDe(i.epi_id), saldo = Number(i.saldo) || 0;
      return `<tr data-estq-epi="${esc(i.epi_id)}">
        <td class="foto"><span class="epi-tab-foto"${foto ? ` data-foto="${esc(foto)}"` : ''}><i data-lucide="${esc(icone(i.nome))}" aria-hidden="true"></i></span></td>
        <td><strong class="epi-tab-nome" title="${esc(i.nome)}">${esc(i.nome)}</strong></td>
        <td class="num">${i.semEntrada ? '<span class="epi-tab-vazio">—</span>' : formatNumber(i.entradas)}</td>
        <td class="num">${i.semEntrada ? '<span class="epi-tab-vazio">—</span>' : formatNumber(i.saidas)}</td>
        <td class="num">${i.semEntrada ? '<span class="epi-tab-vazio">—</span>' : `<b class="epi-tab-saldo${saldo <= 0 ? ' is-zero' : ''}">${formatNumber(saldo)}</b>`}</td>
        <td class="num">${i.minimo == null ? '<span class="epi-tab-vazio" title="Sem estoque mínimo cadastrado">—</span>' : formatNumber(i.minimo)}</td>
        <td><span class="epi-sit epi-sit--${s[0]}">${s[1]}</span></td>
        <td class="acao"><div class="table-action-group">
          <button class="btn movement-action-btn estq-abrir" type="button" data-estq-abrir="${esc(i.epi_id)}" data-estq-nome="${esc(i.nome)}" title="Abrir estoque do item (C.A.s e lançamentos)" aria-label="Abrir estoque do item"><i data-lucide="package-open" aria-hidden="true"></i></button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="epi-tab-nada">Nenhum item encontrado.</td></tr>';
    const rod = page.querySelector('#estqRodape');
    if (rod) {
      let ini = Math.max(1, estqPagina - 2); const fim = Math.min(paginas, ini + 4); ini = Math.max(1, fim - 4);
      let nums = '';
      for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === estqPagina ? ' is-current' : ''}" data-estq-pagina="${p}"${p === estqPagina ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
      rod.hidden = false;
      rod.innerHTML = `<span class="g-employee-count">Exibindo ${formatNumber(daPagina.length)} de ${formatNumber(linhas.length)} ${linhas.length === 1 ? 'item' : 'itens'}</span>` + (paginas > 1 ? `<nav class="g-employee-pagination" aria-label="Páginas">
        <button type="button" class="g-employee-page" data-estq-pagina="${estqPagina - 1}"${estqPagina <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${nums}
        <button type="button" class="g-employee-page" data-estq-pagina="${estqPagina + 1}"${estqPagina >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button></nav>` : '');
    }
    // Fotos dos C.A.s, sem o fundo branco (mesmo cache da tela de EPIs).
    corpo.querySelectorAll('.epi-tab-foto[data-foto]').forEach(async (el) => {
      try {
        const path = el.dataset.foto;
        const src = epiFotoRecorte.get(path) || await variantImageUrl(path).then((u) => u && recortarFundoBranco(u)).then((r) => { if (r) epiFotoRecorte.set(path, r); return r; });
        if (src && el.isConnected) { el.innerHTML = `<img src="${esc(src)}" alt="">`; el.classList.add('tem-foto'); }
      } catch (_) {}
    });
  }
  document.addEventListener('click', (e) => {
    const abrir = e.target.closest('#estqTabBody [data-estq-abrir]');
    if (abrir) {
      window.dispatchEvent(new CustomEvent('epi:stock-register-request', { detail: { epiId: abrir.dataset.estqAbrir, nome: abrir.dataset.estqNome } }));
      return;
    }
    const pag = e.target.closest('#estqRodape [data-estq-pagina]');
    if (pag && !pag.disabled) {
      estqPagina = Number(pag.dataset.estqPagina);
      const page = document.querySelector('[data-page-content="estoque"]');
      renderStockItens(page);
    }
  });

  function abrirItem(card) {
    window.dispatchEvent(new CustomEvent('epi:stock-register-request', { detail: { epiId: card.dataset.stockEpi, nome: card.dataset.stockNome } }));
  }
  document.addEventListener('click', (e) => {
    const card = e.target.closest('#stockItens [data-stock-epi]');
    if (card) abrirItem(card);
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('#stockItens [data-stock-epi]');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirItem(card); }
  });

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
    // No PC: cabeçalho padrão das outras telas e KPIs com o componente do
    // Dashboard (css/padrao.css, "Estoque (PC)"). No celular continuam os
    // cartões antigos (.stock-kpis).
    page.innerHTML = `
      <div class="estq-head">
        <span class="estq-head-ic" aria-hidden="true"><i data-lucide="warehouse"></i></span>
        <h2>Estoque</h2>
        <p>Saldo de cada item: o que entrou, o que saiu e o que está em falta.</p>
      </div>
      <section class="kpi-grid estq-kpis" aria-label="Resumo do estoque">
        <article class="kpi-card kpi-card--green"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="boxes"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Estoque</p><div class="kpi-card__value-row"><strong class="kpi-card__value" id="estqKpiStock">–</strong></div><p class="kpi-card__sub">entradas menos saídas</p></div></article>
        <article class="kpi-card kpi-card--orange"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="package-minus"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Saídas</p><div class="kpi-card__value-row"><strong class="kpi-card__value" id="estqKpiOut">–</strong></div><p class="kpi-card__sub">baixas do estoque por notas</p></div></article>
        <article class="kpi-card kpi-card--yellow"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="gauge"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Mínimo</p><div class="kpi-card__value-row"><strong class="kpi-card__value" id="estqKpiMin">–</strong></div><p class="kpi-card__sub" id="estqKpiMinSub">no mínimo ou abaixo</p></div></article>
        <article class="kpi-card kpi-card--red"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="triangle-alert"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Crítico</p><div class="kpi-card__value-row"><strong class="kpi-card__value" id="estqKpiCritical">–</strong></div><p class="kpi-card__sub">itens com saldo zero ou negativo</p></div></article>
      </section>
      <div class="epi-barra estq-barra">
        <label class="colab-busca epi-busca"><i data-lucide="search" aria-hidden="true"></i><input id="estqBusca" type="search" placeholder="Buscar EPI / Item" autocomplete="off" aria-label="Buscar EPI no estoque"></label>
        <div class="colab-filtros">
          <label class="colab-filtro"><select id="estqSit" aria-label="Filtrar por situação"><option value="">Situação</option><option value="ok">OK</option><option value="baixo">Baixo</option><option value="critico">Crítico</option><option value="sem">Sem entrada</option></select><i data-lucide="chevron-down" aria-hidden="true"></i></label>
        </div>
        <button class="colab-novo epi-novo" id="estqCadastro" type="button" title="Cadastrar estoque antigo"><i data-lucide="package-plus" aria-hidden="true"></i>Cadastro</button>
      </div>
      <div class="epi-tab-wrap estq-tab-wrap"><table class="epi-tab estq-tab">
        <colgroup><col class="c-foto"><col class="c-epi"><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num"><col class="c-sit"><col class="c-acao"></colgroup>
        <thead><tr><th>Foto</th><th>EPI</th><th class="num">Entrou</th><th class="num">Saiu</th><th class="num">Saldo</th><th class="num">Mínimo</th><th>Situação</th><th class="acao">Ação</th></tr></thead>
        <tbody id="estqTabBody"></tbody>
      </table></div>
      <footer class="g-employee-footer mov-rodape epi-rodape" id="estqRodape" hidden></footer>
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
    // Barra do PC: a busca usa a mesma consulta da busca antiga (KPIs e
    // tabela filtram juntos); a situação filtra só a tabela.
    page.querySelector('#estqBusca')?.addEventListener('input', (e) => {
      const antiga = page.querySelector('#stockSearchInput');
      if (antiga) antiga.value = e.target.value;
      estqPagina = 1;
      clearTimeout(filtroTimer);
      filtroTimer = setTimeout(() => refreshStockFromSupabase(page), 450);
    });
    page.querySelector('#estqSit')?.addEventListener('change', () => { estqPagina = 1; renderStockItens(page); });
    page.querySelector('#estqCadastro')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('epi:stock-register-request'));
    });
    let resizeT = 0;
    window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (page.classList.contains('active')) renderStockItens(page); }, 200); });

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
