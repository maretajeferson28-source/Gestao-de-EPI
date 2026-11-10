(() => {
  'use strict';
  // Moldura do padrão visual (css/padrao.css): o nome da página aberta vira o
  // título grande da barra do topo, e o título antigo dentro da página some.
  if (window.__EPI_MOLDURA__) return;
  window.__EPI_MOLDURA__ = true;

  const NOMES = { dashboard: 'Dashboard', nova: 'Entregar', programar: 'Programar entrega', fila: 'Fila de entregas',
    movimentacoes: 'Movimentações', colaboradores: 'Colaboradores', epis: 'EPIs / Itens', caepi: 'Consulta C.A.',
    ciepi: 'Base CIEPI', autorizacoes: 'Autorizações', dados: 'Dados', pendencias: 'Pendências', estoque: 'Estoque' };

  const pc = window.matchMedia('(min-width:721px)');
  let original = null;
  function titulo() {
    const h1 = document.querySelector('.topbar .title h1');
    if (!h1) return;
    if (original === null) original = h1.innerHTML;
    // No celular o topo continua com a marca de antes.
    if (!pc.matches) { if (h1.innerHTML !== original) h1.innerHTML = original; return; }
    const pagina = document.querySelector('.content .page.active');
    const chave = pagina?.dataset.pageContent || '';
    const proprio = pagina?.querySelector('.section-title h2')?.textContent.trim();
    const nome = proprio || NOMES[chave] || 'Gestão de EPI';
    if (h1.textContent !== nome) h1.textContent = nome;
    document.title = nome === 'Gestão de EPI' ? 'Gestão de EPI' : `${nome} · Gestão de EPI`;
  }

  // Cabeçalho que só tinha título e frase some de vez; se tiver botões, fica.
  function limparCabecalhos() {
    document.querySelectorAll('.content .section-title').forEach((s) => {
      const extras = [...s.children].slice(1).filter((el) => el.offsetParent !== null || el.children.length);
      s.classList.toggle('pv-vazio', !extras.length);
    });
  }

  function atualizar() { titulo(); limparCabecalhos(); }

  function start() {
    atualizar();
    // A página ativa muda pela classe "active"; observa só os <section class="page">.
    const obs = new MutationObserver(() => setTimeout(atualizar, 0));
    document.querySelectorAll('.content .page').forEach((p) => obs.observe(p, { attributes: true, attributeFilter: ['class'] }));
    window.addEventListener('epi:data-loaded', atualizar);
    pc.addEventListener?.('change', atualizar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
