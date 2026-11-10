(() => {
  'use strict';
  // Cabeçalho do Dashboard (css/padrao.css, "Etapa 4"): foto, título, ferramentas
  // (sincronizar, notificações, perfil), período e abas. Não cria lógica nova:
  // o período escreve nos filtros De/Até que o Dashboard já usa, e os botões
  // acionam os que já existem no topo e no menu.
  if (window.__EPI_DASH_HERO__) return;
  window.__EPI_DASH_HERO__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const lista = () => { try { return Array.isArray(movements) ? movements : []; } catch (_) { return []; } };

  function montar() {
    const pagina = $('.page[data-page-content="dashboard"]');
    if (!pagina || $('#dashHero')) return;
    const el = document.createElement('section');
    el.className = 'gpi-hero';
    el.id = 'dashHero';
    el.innerHTML = `
      <span class="gpi-hero__slash" aria-hidden="true"></span>
      <div class="gpi-hero__copy">
        <h2 class="gpi-hero__title">Controle, conformidade e<br><strong>segurança</strong> na estrada.</h2>
        <p class="gpi-hero__subtitle">Gestão completa dos EPIs da sua operação.</p>
      </div>
      <div class="gpi-hero__toolbar">
        <button type="button" class="gpi-hero__icon-btn" data-hero="sync" title="Sincronizar"><i data-lucide="refresh-cw"></i><span class="gpi-hero__notification-dot" data-hero-sync-dot hidden></span></button>
        <button type="button" class="gpi-hero__icon-btn" data-hero="notif" title="Notificações"><i data-lucide="bell"></i><span class="gpi-hero__notification-dot" data-hero-notif-dot hidden></span></button>
        <div class="gpi-hero__perfil-box">
          <button type="button" class="gpi-hero__profile" data-hero="perfil" aria-haspopup="menu" aria-expanded="false">
            <span class="gpi-hero__avatar" data-hero-avatar></span>
            <span class="gpi-hero__profile-text"><span class="gpi-hero__profile-name" data-hero-nome>Usuário</span><span class="gpi-hero__profile-role" data-hero-papel>Usuário</span></span>
            <i class="gpi-hero__profile-chevron" data-lucide="chevron-down"></i>
          </button>
          <div class="gpi-hero__menu" role="menu" hidden>
            <button type="button" role="menuitem" data-hero="editar"><i data-lucide="user-round-pen"></i>Editar perfil</button>
            <button type="button" role="menuitem" data-hero="sair"><i data-lucide="log-out"></i>Sair</button>
          </div>
        </div>
      </div>
      <div class="gpi-hero__bottom">
        <label class="gpi-hero__period">
          <i class="gpi-hero__period-icon" data-lucide="calendar-days"></i>
          <span class="gpi-hero__period-text"><span class="gpi-hero__period-label">Período</span><span class="gpi-hero__period-value" data-hero-periodo>Todo o período</span></span>
          <i class="gpi-hero__period-chevron" data-lucide="chevron-down"></i>
          <select data-hero-select aria-label="Período do painel"></select>
        </label>
        <div class="gpi-hero__modes" role="tablist" aria-label="Visão do painel">
          <button type="button" class="gpi-hero__mode" role="tab" aria-selected="true" data-modo="geral"><i data-lucide="chart-column-increasing"></i>Geral</button>
          <button type="button" class="gpi-hero__mode" role="tab" aria-selected="false" data-modo="colaborador"><i data-lucide="users-round"></i>Por Colaborador</button>
          <button type="button" class="gpi-hero__mode" role="tab" aria-selected="false" data-modo="epi"><i data-lucide="hard-hat"></i>Por EPI</button>
          <button type="button" class="gpi-hero__mode" role="tab" aria-selected="false" data-modo="unidade" aria-disabled="true" title="Em construção"><i data-lucide="map-pin"></i>Por Unidade</button>
        </div>
      </div>`;
    pagina.prepend(el);
    ligar(el);
    ligarBusca(el);
    icons();
    atualizar();
  }

  // ---- Período: meses que têm entrega, do mais novo para o mais velho ----
  function preencherPeriodos() {
    const sel = $('[data-hero-select]');
    if (!sel) return;
    const meses = [...new Set(lista().map((m) => { const p = String(m.data || '').split('/'); return p[2] ? `${p[2]}-${p[1]}` : ''; }).filter(Boolean))].sort().reverse();
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todo o período</option>' + meses.map((k) => { const [a, m] = k.split('-'); return `<option value="${k}">${MESES[+m - 1]} / ${a}</option>`; }).join('');
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
    mostrarPeriodo();
  }
  function mostrarPeriodo() {
    const sel = $('[data-hero-select]');
    const txt = $('[data-hero-periodo]');
    if (sel && txt) txt.textContent = sel.options[sel.selectedIndex]?.text || 'Todo o período';
  }
  function aplicarPeriodo(valor) {
    const de = $('#fDe'), ate = $('#fAte');
    if (!de || !ate) return;
    if (!valor) { de.value = ''; ate.value = ''; }
    else {
      const [a, m] = valor.split('-').map(Number);
      const ultimo = new Date(a, m, 0).getDate();
      de.value = `${a}-${String(m).padStart(2, '0')}-01`;
      ate.value = `${a}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
    }
    de.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- Perfil, notificações e sincronização espelhados dos botões existentes ----
  function atualizar() {
    const hero = $('#dashHero');
    if (!hero) return;
    const img = $('#sideUserAvatar');
    const ini = $('#sideUserInitial')?.textContent || 'U';
    const av = $('[data-hero-avatar]', hero);
    av.innerHTML = img && !img.hidden && img.src ? `<img src="${esc(img.src)}" alt="">` : esc(ini);
    $('[data-hero-nome]', hero).textContent = $('#sideUserName')?.textContent || 'Usuário';
    let admin = false; try { admin = currentIsAdmin === true; } catch (_) {}
    $('[data-hero-papel]', hero).textContent = admin ? 'Administrador' : 'Usuário';
    const notif = $('.topbar [data-notif-btn="pc"] .notif-badge');
    $('[data-hero-notif-dot]', hero).hidden = !notif || notif.hidden;
    const sync = $('.topbar [data-sync-btn="pc"]');
    $('[data-hero="sync"]', hero).classList.toggle('is-busy', !!sync?.classList.contains('is-busy'));
    $('[data-hero-sync-dot]', hero).hidden = !sync?.classList.contains('has-pending');
    const st = $('#statusText')?.textContent || '';
    $('[data-hero="sync"]', hero).title = st ? `Sincronizar · ${st}` : 'Sincronizar';
  }

  function ligar(el) {
    const menu = $('.gpi-hero__menu', el);
    const perfil = $('[data-hero="perfil"]', el);
    const fecharMenu = () => { menu.hidden = true; perfil.setAttribute('aria-expanded', 'false'); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hero]');
      if (!b) return;
      const acao = b.dataset.hero;
      if (acao === 'sync') $('.topbar [data-sync-btn="pc"]')?.click();
      if (acao === 'notif') $('.topbar [data-notif-btn="pc"]')?.click();
      if (acao === 'perfil') { menu.hidden = !menu.hidden; perfil.setAttribute('aria-expanded', String(!menu.hidden)); }
      if (acao === 'editar') { fecharMenu(); $('#sideUserProfile')?.click(); }
      if (acao === 'sair') { fecharMenu(); $('#signOutBtn')?.click(); }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.gpi-hero__perfil-box')) fecharMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
    $('[data-hero-select]', el).addEventListener('change', (e) => { mostrarPeriodo(); aplicarPeriodo(e.target.value); });
    // Se alguém mexer nas datas por outro caminho, o período volta para "Todo o período".
    ['#fDe', '#fAte'].forEach((id) => $(id)?.addEventListener('change', () => {
      const sel = $('[data-hero-select]', el); const de = $('#fDe').value, ate = $('#fAte').value;
      if (!de && !ate && sel.value) { sel.value = ''; mostrarPeriodo(); }
    }));
    // Mantém o espelho em dia (nome, foto, bolinhas, sincronização).
    const alvos = ['#sideUserName', '#sideUserInitial', '#sideUserAvatar', '.topbar [data-notif-btn="pc"]', '.topbar [data-sync-btn="pc"]', '#statusText'];
    const obs = new MutationObserver(() => setTimeout(atualizar, 0));
    alvos.forEach((s) => { const t = $(s); if (t) obs.observe(t, { attributes: true, childList: true, subtree: true, characterData: true }); });
  }

  // ---- Abas + busca por texto: a aba escolhe onde procurar (colaborador, EPI
  // ou os dois no Geral) e o texto digitado filtra os KPIs, sem lista.
  // O estado fica em window.EPI_BUSCA e o dash-kpis.js recalcula no evento.
  const MODOS = {
    geral: { dica: 'Colaborador ou EPI…' },
    colaborador: { dica: 'Nome do colaborador…' },
    epi: { dica: 'Nome do EPI…' }
  };
  window.EPI_BUSCA = window.EPI_BUSCA || { modo: 'geral', texto: '' };
  let espera = null;

  function avisar() { window.dispatchEvent(new CustomEvent('epi:busca', { detail: window.EPI_BUSCA })); }
  function escolherModo(el, novo) {
    window.EPI_BUSCA.modo = novo;
    el.querySelectorAll('.gpi-hero__mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === novo)));
    const campo = $('[data-hero-busca-campo]', el);
    if (campo) campo.placeholder = MODOS[novo].dica;
    avisar();
  }

  function ligarBusca(el) {
    const busca = document.createElement('label');
    busca.className = 'gpi-hero__search';
    busca.innerHTML = `
      <i class="gpi-hero__search-icon" data-lucide="search"></i>
      <input type="search" autocomplete="off" spellcheck="false" placeholder="${MODOS.geral.dica}" aria-label="Pesquisar no painel" data-hero-busca-campo>
      <button type="button" class="gpi-hero__search-limpar" aria-label="Limpar pesquisa" data-hero-busca-limpar hidden>×</button>`;
    el.appendChild(busca);
    const campo = $('[data-hero-busca-campo]', el), limpar = $('[data-hero-busca-limpar]', el);
    const aplicar = () => {
      window.EPI_BUSCA.texto = campo.value.trim();
      limpar.hidden = !campo.value;
      avisar();
    };
    campo.addEventListener('input', () => { limpar.hidden = !campo.value; clearTimeout(espera); espera = setTimeout(aplicar, 250); });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(espera); aplicar(); }
      if (e.key === 'Escape') { campo.value = ''; aplicar(); }
    });
    limpar.addEventListener('click', (e) => { e.preventDefault(); campo.value = ''; aplicar(); campo.focus(); });
    el.addEventListener('click', (e) => {
      const aba = e.target.closest('.gpi-hero__mode');
      if (!aba || aba.getAttribute('aria-disabled') === 'true') return;
      escolherModo(el, aba.dataset.modo);
      if (aba.dataset.modo !== 'geral') campo.focus();
    });
  }

  function start() {
    montar();
    window.addEventListener('epi:data-loaded', () => { montar(); preencherPeriodos(); atualizar(); });
    // Os botões do topo (sino, sincronizar) chegam depois e mudam sozinhos: confere de tempos em tempos.
    setInterval(atualizar, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
