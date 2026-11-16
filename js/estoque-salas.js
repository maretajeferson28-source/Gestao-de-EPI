(() => {
  'use strict';
  // Estoque (PC): seletor "Depósito" na barra. "Sala de EPI" é o estoque de
  // EPI de sempre (js/stock-nav.js). As outras salas (public.depositos, ex.:
  // uniformes novos e usados) usam o mesmo layout: 4 cards à esquerda e a
  // tabela à direita, com uma linha por peça e os tamanhos em chips
  // (public.deposito_itens). Só lê dados nesta etapa.
  if (window.__EPI_ESTOQUE_SALAS__) return;
  window.__EPI_ESTOQUE_SALAS__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const db = () => (typeof sb !== 'undefined' ? sb : null);
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const pagina = () => document.querySelector('.page[data-page-content="estoque"]');
  const ORDEM = ['PP', 'P', 'M', 'G', 'GG', 'EXG', 'EXGG', 'EXGGG'];
  const pesoTam = (t) => { const s = String(t || '').trim().toUpperCase(); const n = parseFloat(s); if (!Number.isNaN(n)) return n; const i = ORDEM.indexOf(s.split(' ')[0]); return i < 0 ? 999 : 1000 + i; };
  const ACABANDO = 2; // tamanho com até 2 peças está acabando
  const SIT = { ok: ['ok', 'OK'], acabando: ['atencao', 'Acabando'], zerado: ['critico', 'Zerado'] };
  const iconePeca = (p) => (/bota|cal[cç]ado|sapato|t[eê]nis/i.test(p) ? 'footprints' : /jaqueta|blus/i.test(p) ? 'shirt' : /cal[cç]a/i.test(p) ? 'ruler' : 'shirt');

  let salas = [], itens = [], sala = '', pag = 1, carregado = false, menos = 0;
  let textoOriginal = '';

  async function carregar() {
    const cli = db();
    if (!cli) return;
    const [d, i] = await Promise.all([
      cli.from('depositos').select('id,nome,ativo').order('nome'),
      cli.from('deposito_itens').select('id,deposito_id,peca,tamanho,quantidade,ca')
    ]);
    if (d.error) console.error('[Estoque salas]', d.error);
    salas = (d.data || []).filter((x) => x.ativo !== false && !/^sala de epi$/i.test(x.nome.trim()));
    itens = i.data || [];
    carregado = true;
    if (sala && !salas.some((s) => s.id === sala)) sala = '';
    montarSeletor();
    desenhar();
  }

  // ---- Seletor na barra (botão com painel, no estilo das pílulas) ----
  function montarSeletor() {
    const pg = pagina(), barra = pg && $('.estq-barra', pg);
    if (!barra) return;
    let caixa = $('#estqDep', barra);
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.id = 'estqDep';
      caixa.className = 'estq-dep';
      const filtros = $('.colab-filtros', barra);
      (filtros || barra).after(caixa);
      caixa.addEventListener('click', (e) => {
        const op = e.target.closest('[data-estq-dep]');
        if (op) { escolher(op.dataset.estqDep); abrir(false); return; }
        if (e.target.closest('.estq-dep__botao')) abrir($('.estq-dep__painel', caixa).hidden);
      });
      caixa.addEventListener('keydown', (e) => { if (e.key === 'Escape') { abrir(false); $('.estq-dep__botao', caixa)?.focus(); } });
      document.addEventListener('click', (e) => { if (caixa.isConnected && !caixa.contains(e.target)) abrir(false); });
    }
    const atual = salas.find((s) => s.id === sala);
    const opcoes = [{ id: '', nome: 'Sala de EPI' }, ...salas];
    caixa.innerHTML = `
      <button type="button" class="estq-dep__botao${sala ? ' tem-valor' : ''}" aria-haspopup="listbox" aria-expanded="false">
        <i data-lucide="warehouse"></i><span><em>Depósito:</em> ${esc(atual ? atual.nome : 'Sala de EPI')}</span><i data-lucide="chevron-down"></i>
      </button>
      <div class="estq-dep__painel" role="listbox" hidden>
        ${opcoes.map((o) => `<button type="button" role="option" data-estq-dep="${esc(o.id)}" aria-selected="${o.id === sala}"${o.id === sala ? ' class="is-sel"' : ''}><i data-lucide="${o.id ? 'shirt' : 'hard-hat'}"></i>${esc(o.nome)}${o.id ? `<small>${num(itens.filter((x) => x.deposito_id === o.id).reduce((t, x) => t + x.quantidade, 0))} peças</small>` : ''}</button>`).join('')}
      </div>`;
    icons();
  }
  function abrir(sim) {
    const caixa = document.getElementById('estqDep');
    if (!caixa) return;
    $('.estq-dep__painel', caixa).hidden = !sim;
    $('.estq-dep__botao', caixa).setAttribute('aria-expanded', sim ? 'true' : 'false');
  }
  function escolher(id) {
    sala = id; pag = 1; menos = 0;
    montarSeletor();
    desenhar();
  }

  // ---- Visão da sala de uniforme ----
  function garantirBlocos(pg) {
    if (!$('#estqUniKpis', pg)) {
      const k = document.createElement('section');
      k.className = 'kpi-grid estq-kpis estq-uni-kpis';
      k.id = 'estqUniKpis';
      k.setAttribute('aria-label', 'Resumo da sala');
      k.innerHTML = `
        <article class="kpi-card kpi-card--green"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="boxes"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Peças</p><div class="kpi-card__value-row"><strong class="kpi-card__value" data-uni-kpi="pecas">–</strong></div><p class="kpi-card__sub">guardadas nesta sala</p></div></article>
        <article class="kpi-card kpi-card--orange"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="shirt"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Tipos de peça</p><div class="kpi-card__value-row"><strong class="kpi-card__value" data-uni-kpi="tipos">–</strong></div><p class="kpi-card__sub" data-uni-kpi="tamanhos">tamanhos</p></div></article>
        <article class="kpi-card kpi-card--yellow"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="gauge"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Acabando</p><div class="kpi-card__value-row"><strong class="kpi-card__value" data-uni-kpi="acabando">–</strong></div><p class="kpi-card__sub">tamanhos com 1 ou 2 peças</p></div></article>
        <article class="kpi-card kpi-card--red"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="triangle-alert"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Zerados</p><div class="kpi-card__value-row"><strong class="kpi-card__value" data-uni-kpi="zerados">–</strong></div><p class="kpi-card__sub">tamanhos sem nenhuma peça</p></div></article>`;
      const ref = $('.estq-kpis:not(.estq-uni-kpis)', pg);
      (ref ? ref.after(k) : pg.appendChild(k));
    }
    if (!$('#estqUniWrap', pg)) {
      const w = document.createElement('div');
      w.className = 'epi-tab-wrap estq-tab-wrap estq-uni-wrap';
      w.id = 'estqUniWrap';
      w.innerHTML = `<table class="epi-tab estq-tab estq-uni-tab">
        <colgroup><col class="c-foto"><col class="c-epi"><col class="c-tams"><col class="c-num"><col class="c-sit"><col class="c-acao"></colgroup>
        <thead><tr><th>Foto</th><th>Peça</th><th>Tamanhos</th><th class="num">Saldo</th><th>Situação</th><th class="acao">Ação</th></tr></thead>
        <tbody id="estqUniBody"></tbody></table>`;
      const f = document.createElement('footer');
      f.className = 'g-employee-footer mov-rodape epi-rodape';
      f.id = 'estqUniRodape';
      f.addEventListener('click', (e) => {
        const b = e.target.closest('[data-uni-pagina]');
        if (b && !b.disabled) { pag = Number(b.dataset.uniPagina); desenhar(); }
      });
      const ref = $('#estqRodape', pg) || $('.estq-tab-wrap', pg);
      (ref ? ref.after(w) : pg.appendChild(w));
      w.after(f);
    }
  }

  function porPagina() {
    const wrap = document.getElementById('estqUniWrap');
    const topo = wrap && wrap.offsetParent ? wrap.getBoundingClientRect().top : 230;
    return Math.max(5, Math.floor((window.innerHeight - topo - 38 - 50 - 16) / 46));
  }

  function desenhar() {
    const pg = pagina();
    if (!pg || !$('.estq-barra', pg)) return;
    const head = $('.estq-head p', pg);
    if (head && !textoOriginal) textoOriginal = head.textContent;
    pg.classList.toggle('estq-uni', !!sala);
    if (!sala) { if (head && textoOriginal) head.textContent = textoOriginal; trocarBusca(false); return; }
    garantirBlocos(pg);
    trocarBusca(true);
    const s = salas.find((x) => x.id === sala);
    if (head) head.textContent = `${s.nome}: peças, tamanhos e quantidades de cada uma.`;

    const daSala = itens.filter((x) => x.deposito_id === sala);
    const pecas = new Map();
    daSala.forEach((x) => { const p = pecas.get(x.peca) || { peca: x.peca, ca: x.ca, tams: [] }; p.tams.push(x); if (x.ca && !p.ca) p.ca = x.ca; pecas.set(x.peca, p); });
    const linhas = [...pecas.values()].map((p) => {
      p.tams.sort((a, b) => pesoTam(a.tamanho) - pesoTam(b.tamanho) || a.tamanho.localeCompare(b.tamanho, 'pt-BR', { numeric: true }));
      p.total = p.tams.reduce((t, x) => t + x.quantidade, 0);
      p.sit = p.total <= 0 ? 'zerado' : p.tams.some((x) => x.quantidade <= ACABANDO) ? 'acabando' : 'ok';
      return p;
    }).sort((a, b) => a.peca.localeCompare(b.peca, 'pt-BR'));

    // Cards
    const k = (n, v) => { const el = $(`[data-uni-kpi="${n}"]`, pg); if (el) el.textContent = v; };
    k('pecas', num(daSala.reduce((t, x) => t + x.quantidade, 0)));
    k('tipos', num(linhas.length));
    k('tamanhos', `${num(daSala.length)} tamanhos ao todo`);
    k('acabando', num(daSala.filter((x) => x.quantidade > 0 && x.quantidade <= ACABANDO).length));
    k('zerados', num(daSala.filter((x) => x.quantidade <= 0).length));

    // Tabela com a busca da barra
    const q = semAcento($('#estqBusca', pg)?.value.trim());
    const filtradas = q ? linhas.filter((p) => semAcento(`${p.peca} ${p.ca || ''} ${p.tams.map((t) => t.tamanho).join(' ')}`).includes(q)) : linhas;
    const por = Math.max(3, porPagina() - menos);
    const paginas = Math.max(1, Math.ceil(filtradas.length / por));
    if (pag > paginas) pag = paginas;
    const daPagina = filtradas.slice((pag - 1) * por, pag * por);
    $('#estqUniBody', pg).innerHTML = daPagina.map((p) => {
      const st = SIT[p.sit];
      return `<tr>
        <td class="foto"><span class="epi-tab-foto"><i data-lucide="${iconePeca(p.peca)}" aria-hidden="true"></i></span></td>
        <td><strong class="epi-tab-nome" title="${esc(p.peca)}">${esc(p.peca)}</strong>${p.ca ? `<small class="estq-uni-ca">C.A. ${esc(p.ca)}</small>` : ''}</td>
        <td><div class="estq-tams">${p.tams.map((t) => `<span class="estq-tam${t.quantidade <= 0 ? ' is-zero' : t.quantidade <= ACABANDO ? ' is-pouco' : ''}" title="Tamanho ${esc(t.tamanho || '—')}: ${num(t.quantidade)} ${t.quantidade === 1 ? 'peça' : 'peças'}"><b>${esc(t.tamanho || '—')}</b>${num(t.quantidade)}</span>`).join('')}</div></td>
        <td class="num"><b class="epi-tab-saldo${p.total <= 0 ? ' is-zero' : ''}">${num(p.total)}</b></td>
        <td><span class="epi-sit epi-sit--${st[0]}">${st[1]}</span></td>
        <td class="acao"><div class="table-action-group"><button class="btn movement-action-btn estq-abrir" type="button" disabled title="Na próxima etapa: ajustar os tamanhos com − e +" aria-label="Abrir peça"><i data-lucide="package-open" aria-hidden="true"></i></button></div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="epi-tab-nada">${carregado ? (q ? 'Nenhuma peça encontrada.' : 'Nenhuma peça nesta sala ainda.') : 'Carregando…'}</td></tr>`;

    let ini = Math.max(1, pag - 2); const fim = Math.min(paginas, ini + 4); ini = Math.max(1, fim - 4);
    let nums = '';
    for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === pag ? ' is-current' : ''}" data-uni-pagina="${p}"${p === pag ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
    $('#estqUniRodape', pg).innerHTML = `<span class="g-employee-count">Exibindo ${num(daPagina.length)} de ${num(filtradas.length)} ${filtradas.length === 1 ? 'peça' : 'peças'}</span>` + (paginas > 1 ? `<nav class="g-employee-pagination" aria-label="Páginas">
      <button type="button" class="g-employee-page" data-uni-pagina="${pag - 1}"${pag <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${nums}
      <button type="button" class="g-employee-page" data-uni-pagina="${pag + 1}"${pag >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button></nav>` : '');
    icons();
    // Linha com muitos tamanhos é mais alta: se a tela passou da altura, tira uma linha da página.
    const c = document.querySelector('.content');
    if (c && c.scrollHeight > c.clientHeight + 1 && por > 3 && menos < 6) { menos++; desenhar(); }
  }

  // Busca: o mesmo campo da barra; na sala de uniforme o texto de ajuda muda.
  function trocarBusca(uni) {
    const b = document.getElementById('estqBusca');
    if (!b) return;
    if (!b.dataset.dicaEpi) b.dataset.dicaEpi = b.placeholder;
    b.placeholder = uni ? 'Buscar peça, tamanho ou C.A.' : b.dataset.dicaEpi;
  }
  document.addEventListener('input', (e) => { if (sala && e.target.id === 'estqBusca') { pag = 1; menos = 0; desenhar(); } });
  window.addEventListener('resize', () => { if (sala) { menos = 0; desenhar(); } });

  // A tela do Estoque é montada pelo stock-nav.js; espera a barra existir.
  setInterval(() => {
    const pg = pagina();
    if (pg && $('.estq-barra', pg)) {
      if (!document.getElementById('estqDep')) { montarSeletor(); if (!carregado) carregar(); }
    }
  }, 800);
  // Ao abrir o Estoque de novo, recarrega as salas (alguém pode ter mexido).
  document.addEventListener('click', (e) => { if (e.target.closest('[data-page="estoque"],[data-nav="estoque"]')) setTimeout(carregar, 300); });
  window.addEventListener('epi:data-loaded', () => { if (pagina()) carregar(); });
  window.EPI_ESTOQUE_SALAS = { recarregar: carregar };
})();
