(() => {
  'use strict';
  // Telas dos KPIs do Dashboard (PC). Clicar num card troca a tela inteira
  // do Dashboard (banner, KPIs, tudo) por uma tela no tema daquele card, com
  // transição suave; "Voltar ao Dashboard" (ou Esc) faz o caminho inverso.
  // O Dashboard em si não muda. Cada tela tem seu módulo; por enquanto só
  // Economia (js/economia.js).
  if (window.__EPI_DASH_PALCO__) return;
  window.__EPI_DASH_PALCO__ = true;

  const TELAS = { economia: () => window.EPI_PALCO_ECONOMIA };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const pagina = () => document.querySelector('.page[data-page-content="dashboard"]');
  const noPc = () => matchMedia('(min-width:721px)').matches;
  let aberta = null;

  function palco() {
    const pg = pagina();
    if (!pg) return null;
    let el = document.getElementById('dashStage');
    if (!el) {
      el = document.createElement('section');
      el.id = 'dashStage';
      el.className = 'dash-stage pv-dash-novo';
      el.setAttribute('aria-live', 'polite');
      pg.appendChild(el);
    }
    return el;
  }

  function abrir(k) {
    const mod = TELAS[k]?.();
    const pg = pagina(), el = palco();
    if (!mod || !pg || !el || !noPc() || aberta === k) return;
    aberta = k;
    pg.classList.add('stage-saindo');
    setTimeout(() => {
      el.dataset.tela = k;
      mod.montar(el, fechar);
      icons();
      pg.classList.remove('stage-saindo');
      pg.classList.add('stage-ativo');
      window.scrollTo({ top: 0 });
      document.querySelector('.main')?.scrollTo?.({ top: 0 });
      el.querySelector('[data-stage-voltar]')?.focus({ preventScroll: true });
    }, 220);
  }

  function fechar() {
    const pg = pagina(), el = document.getElementById('dashStage');
    if (!pg || !aberta) return;
    const k = aberta;
    aberta = null;
    pg.classList.add('stage-fechando');
    setTimeout(() => {
      pg.classList.remove('stage-ativo', 'stage-fechando');
      if (el) el.innerHTML = '';
      pg.classList.add('stage-voltando');
      setTimeout(() => pg.classList.remove('stage-voltando'), 320);
      document.querySelector(`#dashKpis [data-kpi="${k}"]`)?.focus({ preventScroll: true });
    }, 220);
  }
  window.EPI_DASH_STAGE = { abrir, fechar };

  // Cards com tela própria: clique, Enter ou espaço abrem.
  document.addEventListener('click', (e) => {
    const card = e.target.closest('#dashKpis .kpi-card');
    if (card && TELAS[card.dataset.kpi]) abrir(card.dataset.kpi);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aberta && !document.querySelector('.data-edit-modal:not(.hidden),.epi-detail-modal:not(.hidden)')) { fechar(); return; }
    const card = e.target.closest?.('#dashKpis .kpi-card');
    if (card && TELAS[card.dataset.kpi] && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(card.dataset.kpi); }
  });
  // Só deixa o card focável pelo teclado (sem mudar o visual).
  setInterval(() => {
    Object.keys(TELAS).forEach((k) => {
      const c = document.querySelector(`#dashKpis [data-kpi="${k}"]`);
      if (c && !c.hasAttribute('tabindex')) { c.tabIndex = 0; c.setAttribute('role', 'button'); }
    });
    // Saiu do Dashboard com uma tela aberta: volta ao normal sem animação.
    const pg = pagina();
    if (aberta && pg && !pg.classList.contains('active')) {
      aberta = null;
      pg.classList.remove('stage-ativo', 'stage-saindo', 'stage-fechando');
      const el = document.getElementById('dashStage'); if (el) el.innerHTML = '';
    }
  }, 800);

  // Dados recarregados: a tela aberta se atualiza.
  window.addEventListener('epi:data-loaded', () => { if (aberta) TELAS[aberta]?.()?.atualizar(); });
})();
