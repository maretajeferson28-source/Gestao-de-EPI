(() => {
  'use strict';
  // Administração: grupo no menu lateral (como Entregas, Cadastros, Estoque),
  // com um subitem para cada assunto. Todos abrem a página "autorizacoes" e
  // aqui é escolhida a tela do subitem (data-adm). "Usuários e acesso" é a
  // tela de autorizações de sempre (app.js); os outros ainda mostram
  // "Em construção".
  if (window.__EPI_ADMINISTRACAO__) return;
  window.__EPI_ADMINISTRACAO__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const pagina = () => document.querySelector('.page[data-page-content="autorizacoes"]');

  const TELAS = {
    usuarios: { icone: 'users-round', titulo: 'Usuários e acesso', texto: 'Quem pode entrar no app e quem é administrador.', pronto: true },
    avisos: { icone: 'mail', titulo: 'Avisos por e-mail', texto: 'Estoque baixo, C.A. vencendo e resumo da semana: o que vai e para quem.' },
    empresa: { icone: 'building-2', titulo: 'Empresa', texto: 'Razão social, CNPJ, endereço e logo dos termos, fichas e PDFs.' },
    padroes: { icone: 'sliders-horizontal', titulo: 'Padrões do dia a dia', texto: 'Responsável padrão, quando avisar C.A. vencendo e o "Acabando" dos uniformes.' },
    historico: { icone: 'history', titulo: 'Histórico de alterações', texto: 'Quem cadastrou, editou ou apagou o quê, e quando.' }
  };

  let atual = 'usuarios';

  function cabecalho(k) {
    const t = TELAS[k];
    return `<div class="estq-head adm-head">
        <span class="estq-head-ic" aria-hidden="true"><i data-lucide="${t.icone}"></i></span>
        <h2>${esc(t.titulo)}</h2>
        <p>${esc(t.texto)}</p>
      </div>`;
  }

  function montar() {
    const pg = pagina();
    if (!pg || $('.adm-tela', pg)) return !!pg;
    // O que já existia vira a tela "Usuários e acesso".
    const usuarios = document.createElement('div');
    usuarios.className = 'adm-tela';
    usuarios.dataset.admTela = 'usuarios';
    usuarios.innerHTML = cabecalho('usuarios');
    [...pg.children].forEach((el) => usuarios.appendChild(el));
    pg.appendChild(usuarios);
    // As outras telas, por enquanto "Em construção".
    Object.entries(TELAS).filter(([, t]) => !t.pronto).forEach(([k, t]) => {
      const el = document.createElement('div');
      el.className = 'adm-tela';
      el.dataset.admTela = k;
      el.hidden = true;
      el.innerHTML = cabecalho(k) + `<div class="dep-vazio adm-breve-box">
          <span class="dep-vazio__ic" aria-hidden="true"><i data-lucide="${t.icone}"></i></span>
          <h3>Em construção</h3>
          <p>${esc(t.texto)}</p>
        </div>`;
      pg.appendChild(el);
    });
    pg.classList.add('adm-pronta');
    icons();
    mostrar(atual);
    return true;
  }

  function mostrar(k) {
    const pg = pagina();
    if (!pg || !TELAS[k]) return;
    atual = k;
    pg.querySelectorAll('.adm-tela').forEach((t) => { t.hidden = t.dataset.admTela !== k; });
    // No menu, só o subitem desta tela fica marcado.
    document.querySelectorAll('.nav [data-page="autorizacoes"]').forEach((b) => b.classList.toggle('active', pg.classList.contains('active') && (b.dataset.adm || 'usuarios') === k));
  }

  // Clique num subitem: o app.js abre a página; aqui escolhe a tela.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.nav [data-page="autorizacoes"]');
    if (!b) return;
    setTimeout(() => { montar(); mostrar(b.dataset.adm || 'usuarios'); }, 0);
  });

  const espera = setInterval(() => { if (montar()) clearInterval(espera); }, 500);
  window.EPI_ADMIN = { abrir: mostrar };
})();
