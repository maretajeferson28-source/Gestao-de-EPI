(() => {
  'use strict';

  // Lista de sugestões própria do app no lugar do <datalist> do navegador (que
  // no celular vira uma faixa em cima do teclado). Vale para todo campo com
  // atributo list="...": o <datalist> continua sendo a fonte das opções (os
  // outros scripts seguem preenchendo ele), só a exibição muda. Ao escolher,
  // dispara 'input' e 'change' no campo, como se a pessoa tivesse digitado.
  if (window.__EPI_AUTOCOMPLETAR__) return;
  window.__EPI_AUTOCOMPLETAR__ = true;

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 60;

  const caixa = document.createElement('div');
  caixa.className = 'auto-lista';
  caixa.setAttribute('role', 'listbox');
  caixa.hidden = true;

  let campo = null;   // input em uso
  let itens = [];     // opções mostradas
  let ativo = -1;     // opção destacada pelo teclado

  // Tira o list="" (desliga a lista do navegador) e guarda o id do datalist.
  function preparar(input) {
    if (!input || input.tagName !== 'INPUT' || !input.hasAttribute('list')) return;
    input.dataset.lista = input.getAttribute('list');
    input.removeAttribute('list');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
  }

  function opcoes(input) {
    const dl = document.getElementById(input.dataset.lista);
    if (!dl) return [];
    return [...dl.options].map((o) => o.value).filter(Boolean);
  }

  function posicionar() {
    if (!campo || caixa.hidden) return;
    const r = campo.getBoundingClientRect();
    const abaixo = window.innerHeight - r.bottom;
    const alto = Math.min(260, caixa.scrollHeight || 260);
    caixa.style.left = `${Math.max(8, r.left)}px`;
    caixa.style.width = `${r.width}px`;
    // Abre para cima só se não couber embaixo e couber em cima.
    if (abaixo < alto + 12 && r.top > abaixo) {
      caixa.style.top = '';
      caixa.style.bottom = `${window.innerHeight - r.top + 4}px`;
    } else {
      caixa.style.bottom = '';
      caixa.style.top = `${r.bottom + 4}px`;
    }
  }

  function mostrar() {
    if (!campo) return;
    const q = norm(campo.value);
    const todas = opcoes(campo);
    const comeca = [], contem = [];
    for (const v of todas) {
      const n = norm(v);
      if (!q || n.startsWith(q)) comeca.push(v);
      else if (n.includes(q)) contem.push(v);
    }
    itens = [...comeca, ...contem].slice(0, MAX);
    // Se o que está escrito já é exatamente a única opção, não precisa abrir.
    if (!itens.length || (itens.length === 1 && norm(itens[0]) === q)) return fechar();
    ativo = -1;
    caixa.innerHTML = itens.map((v, i) => `<div class="auto-op" role="option" data-i="${i}">${esc(v)}</div>`).join('');
    caixa.hidden = false;
    caixa.scrollTop = 0;
    posicionar();
  }

  function fechar() {
    caixa.hidden = true;
    caixa.innerHTML = '';
    itens = [];
    ativo = -1;
  }

  function escolher(i) {
    if (!campo || i < 0 || i >= itens.length) return;
    campo.value = itens[i];
    fechar();
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function destacar(i) {
    const ops = caixa.querySelectorAll('.auto-op');
    if (!ops.length) return;
    ativo = (i + ops.length) % ops.length;
    ops.forEach((o, k) => o.classList.toggle('is-ativo', k === ativo));
    ops[ativo].scrollIntoView({ block: 'nearest' });
  }

  function start() {
    document.body.appendChild(caixa);
    document.querySelectorAll('input[list]').forEach(preparar);
    // Campos criados depois (linhas da tela Programar, por exemplo).
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('input[list]')) preparar(n);
        n.querySelectorAll?.('input[list]').forEach(preparar);
      }
    }).observe(document.body, { childList: true, subtree: true });

    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (el.tagName === 'INPUT' && el.hasAttribute('list')) preparar(el);
      if (el.tagName === 'INPUT' && el.dataset.lista) { campo = el; mostrar(); }
    });
    document.addEventListener('input', (e) => { if (e.target === campo && e.isTrusted) mostrar(); });
    document.addEventListener('focusout', (e) => { if (e.target === campo) setTimeout(() => { if (document.activeElement !== campo) fechar(); }, 150); });
    document.addEventListener('keydown', (e) => {
      if (e.target !== campo || caixa.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); destacar(ativo + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); destacar(ativo - 1); }
      else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); e.stopPropagation(); escolher(ativo); }
      else if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    }, true);
    // pointerdown + preventDefault: o campo não perde o foco ao tocar na lista.
    caixa.addEventListener('pointerdown', (e) => {
      const op = e.target.closest('.auto-op');
      e.preventDefault();
      if (op) escolher(Number(op.dataset.i));
    });
    window.addEventListener('resize', posicionar);
    document.addEventListener('scroll', (e) => { if (e.target !== caixa && !caixa.contains(e.target)) posicionar(); }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
