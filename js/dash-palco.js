(() => {
  'use strict';
  // Palco do Dashboard (PC): espaço abaixo dos KPIs onde o card escolhido
  // "abre" com a cor dele, arte e informações. Troca com transição suave.
  // Cada palco tem seu módulo (por enquanto só Economia: js/economia.js).
  if (window.__EPI_DASH_PALCO__) return;
  window.__EPI_DASH_PALCO__ = true;

  const PALCOS = {
    economia: { tom: 'green', icone: 'piggy-bank', modulo: () => window.EPI_PALCO_ECONOMIA }
  };
  const CHAVE = 'epi:palco';
  const lerEscolha = () => { try { return localStorage.getItem(CHAVE); } catch (_) { return null; } };
  const salvarEscolha = (k) => { try { localStorage.setItem(CHAVE, k); } catch (_) {} };
  let atual = PALCOS[lerEscolha()] ? lerEscolha() : 'economia';
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });

  function garantir() {
    const topo = document.getElementById('dashTopo');
    if (!topo) return null;
    let palco = document.getElementById('dashPalco');
    if (!palco) {
      palco = document.createElement('section');
      palco.id = 'dashPalco';
      palco.className = 'dash-palco pv-dash-novo';
      palco.setAttribute('aria-live', 'polite');
      palco.innerHTML = '<div class="dash-palco__arte" aria-hidden="true"></div><div class="dash-palco__conteudo"></div>';
      topo.after(palco);
    }
    // Cards que têm palco ficam clicáveis.
    Object.keys(PALCOS).forEach((k) => {
      const card = document.querySelector(`#dashKpis [data-kpi="${k}"]`);
      if (card && !card.classList.contains('tem-palco')) {
        card.classList.add('tem-palco');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.removeAttribute('title');
      }
    });
    return palco;
  }

  function mostrar(k, animar) {
    const palco = garantir();
    const def = PALCOS[k];
    if (!palco || !def || !def.modulo()) return;
    const trocar = () => {
      atual = k;
      palco.dataset.tom = def.tom;
      palco.querySelector('.dash-palco__arte').innerHTML = `<i data-lucide="${def.icone}"></i>`;
      def.modulo().montar(palco.querySelector('.dash-palco__conteudo'));
      document.querySelectorAll('#dashKpis .kpi-card').forEach((c) => c.classList.toggle('is-palco', c.dataset.kpi === k));
      icons();
      palco.classList.remove('is-saindo');
    };
    if (animar && palco.dataset.tom) {
      palco.classList.add('is-saindo');
      setTimeout(trocar, 180);
    } else trocar();
  }

  function atualizar() {
    const palco = garantir();
    if (!palco) return;
    if (!palco.dataset.tom) { mostrar(atual, false); return; }
    PALCOS[atual]?.modulo()?.atualizar();
    document.querySelectorAll('#dashKpis .kpi-card').forEach((c) => c.classList.toggle('is-palco', c.dataset.kpi === atual));
  }

  function escolher(card) {
    const k = card?.dataset.kpi;
    if (!PALCOS[k]) return;
    salvarEscolha(k);
    if (k !== atual) mostrar(k, true);
    document.getElementById('dashPalco')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  document.addEventListener('click', (e) => { const c = e.target.closest('#dashKpis .kpi-card.tem-palco'); if (c) escolher(c); });
  document.addEventListener('keydown', (e) => {
    const c = e.target.closest?.('#dashKpis .kpi-card.tem-palco');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolher(c); }
  });

  // Acompanha os KPIs: quando eles recalculam (período, filtros, dados), o palco também.
  let pendente = null;
  const agendar = () => { clearTimeout(pendente); pendente = setTimeout(atualizar, 60); };
  let observado = null;
  setInterval(() => {
    const kpis = document.getElementById('dashKpis');
    if (kpis && kpis !== observado) {
      observado = kpis;
      new MutationObserver(agendar).observe(kpis, { childList: true, characterData: true, subtree: true });
      agendar();
    }
  }, 800);
  window.addEventListener('epi:data-loaded', agendar);
  window.addEventListener('epi:busca', agendar);
})();
