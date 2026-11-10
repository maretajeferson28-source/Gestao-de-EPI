// Menu lateral em grupos que abrem e fecham (Entregas, Cadastros, Estoque,
// Administração). Move os botões que já existem para dentro dos grupos, então
// cada um continua fazendo o que fazia. Dashboard, Pendências e Consulta C.A.
// ficam soltos. O grupo da tela aberta abre sozinho; os outros lembram como
// foram deixados. Grupo sem nenhum item visível (celular, não admin) some.
(() => {
  'use strict';

  const GRUPOS = [
    { id: 'entregas', nome: 'Entregas', icone: 'package', depois: 'dashboard', paginas: ['nova', 'programar', 'fila', 'movimentacoes'] },
    { id: 'cadastros', nome: 'Cadastros', icone: 'users', depois: 'entregas', paginas: ['colaboradores', 'epis', 'ciepi'] },
    { id: 'estoque', nome: 'Estoque', icone: 'layers', depois: 'cadastros', paginas: ['estoque', 'notas'] },
    { id: 'admin', nome: 'Administração', icone: 'settings', depois: null, paginas: ['autorizacoes', 'dados'] }
  ];
  const CHAVE = 'epi-menu-grupos-v1';
  const nav = document.querySelector('.sidebar .nav');
  if (!nav) return;

  let abertos = {};
  try { abertos = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (_) { abertos = {}; }
  const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(abertos)); } catch (_) {} };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const visivel = (el) => !el.hidden && getComputedStyle(el).display !== 'none';

  function criarGrupo(g) {
    const box = document.createElement('div');
    box.className = 'nav-grupo';
    box.dataset.grupo = g.id;
    box.innerHTML = `<button type="button" class="nav-grupo-cab" aria-expanded="false">
        <span class="ico"><i data-lucide="${g.icone}"></i></span><span class="text">${g.nome}</span>
        <span class="nav-badge" data-grupo-badge hidden></span><span class="nav-grupo-seta"><i data-lucide="chevron-down"></i></span></button>
      <div class="nav-grupo-itens"></div>`;
    box.querySelector('.nav-grupo-cab').addEventListener('click', () => {
      abertos[g.id] = !box.classList.contains('is-aberto');
      guardar();
      atualizar();
    });
    return box;
  }

  // Coloca cada grupo no lugar (depois do item/grupo anterior) e puxa os botões.
  // Só mexe no que está fora do lugar: tirar e recolocar um botão no meio de um
  // clique faz o clique se perder (e cada mudança dispararia outra organização).
  function organizar() {
    let criou = false;
    for (const g of GRUPOS) {
      let box = nav.querySelector(`.nav-grupo[data-grupo="${g.id}"]`);
      if (!box) {
        box = criarGrupo(g);
        criou = true;
        const ancora = g.depois && (nav.querySelector(`.nav-grupo[data-grupo="${g.depois}"]`) || nav.querySelector(`:scope > [data-page="${g.depois}"]`));
        if (ancora) ancora.after(box); else nav.appendChild(box);
      }
      const itens = box.querySelector('.nav-grupo-itens');
      // Ordem certa dos botões que já existem (Estoque e Notas chegam depois).
      const certos = g.paginas.map((p) => nav.querySelector(`[data-page="${p}"]`)).filter(Boolean);
      const atuais = [...itens.children];
      const emOrdem = certos.length === atuais.length && certos.every((b, i) => atuais[i] === b);
      if (!emOrdem) certos.forEach((b) => itens.appendChild(b));
    }
    // Pendências e Consulta C.A. ficam soltas, logo depois do Estoque (Administração por último).
    const estoque = nav.querySelector('.nav-grupo[data-grupo="estoque"]');
    const pend = nav.querySelector(':scope > [data-page="pendencias"]');
    const caepi = nav.querySelector(':scope > [data-page="caepi"]');
    if (pend && estoque && estoque.nextElementSibling !== pend) estoque.after(pend);
    const antesCa = pend || estoque;
    if (caepi && antesCa && antesCa.nextElementSibling !== caepi) antesCa.after(caepi);
    if (criou) icons();
  }

  let agendado = false;
  function atualizar() {
    agendado = false;
    for (const box of nav.querySelectorAll('.nav-grupo')) {
      const filhos = [...box.querySelectorAll('.nav-grupo-itens > [data-page]')];
      const vis = filhos.filter(visivel);
      box.hidden = !vis.length;
      // Grupo com um item só (celular, ou Administração sem Dados): o item aparece direto.
      box.classList.toggle('is-unico', vis.length === 1);
      const ativo = filhos.some((b) => b.classList.contains('active'));
      const aberto = ativo || abertos[box.dataset.grupo] === true;
      box.classList.toggle('is-aberto', aberto);
      box.classList.toggle('tem-ativo', ativo);
      box.querySelector('.nav-grupo-cab').setAttribute('aria-expanded', String(aberto));
      // Bolinha do grupo: soma das bolinhas dos itens (aparece com o grupo fechado).
      const soma = vis.reduce((t, b) => { const n = b.querySelector('.nav-badge:not([hidden])'); return t + (n ? Number(n.textContent) || 0 : 0); }, 0);
      const badge = box.querySelector('[data-grupo-badge]');
      badge.textContent = soma;
      badge.hidden = !soma || aberto;
    }
  }
  const agendar = () => { if (!agendado) { agendado = true; setTimeout(() => { organizar(); atualizar(); }, 30); } };

  organizar();
  atualizar();
  new MutationObserver((lista) => {
    // Ignora as mudanças que o próprio menu faz nos grupos.
    if (lista.every((m) => m.target.classList?.contains('nav-grupo') || m.target.closest?.('.nav-grupo-cab'))) return;
    agendar();
  }).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'], characterData: true });
  window.addEventListener('resize', agendar);
})();
