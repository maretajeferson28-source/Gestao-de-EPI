(() => {
  'use strict';
  // Administração (antiga "Autorizações"): painel com um card para cada
  // assunto de administração. Cada card abre a sua tela por cima do painel
  // ("Voltar à Administração"). Por enquanto só "Usuários e acesso" funciona:
  // é a tela de autorizações de sempre (app.js), movida para dentro da tela.
  // Os outros cards aparecem como "Em breve".
  if (window.__EPI_ADMINISTRACAO__) return;
  window.__EPI_ADMINISTRACAO__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const pagina = () => document.querySelector('.page[data-page-content="autorizacoes"]');

  const CARDS = [
    { k: 'usuarios', icone: 'users-round', tom: 'orange', titulo: 'Usuários e acesso', texto: 'Quem pode entrar no app e quem é administrador.', pronto: true },
    { k: 'avisos', icone: 'mail', tom: 'blue', titulo: 'Avisos por e-mail', texto: 'Estoque baixo, C.A. vencendo e resumo da semana: o que vai e para quem.' },
    { k: 'empresa', icone: 'building-2', tom: 'green', titulo: 'Empresa', texto: 'Razão social, CNPJ, endereço e logo dos termos, fichas e PDFs.' },
    { k: 'padroes', icone: 'sliders-horizontal', tom: 'purple', titulo: 'Padrões do dia a dia', texto: 'Responsável padrão, quando avisar C.A. vencendo e o "Acabando" dos uniformes.' },
    { k: 'historico', icone: 'history', tom: 'yellow', titulo: 'Histórico de alterações', texto: 'Quem cadastrou, editou ou apagou o quê, e quando.' }
  ];

  let tela = null;

  function montar() {
    const pg = pagina();
    if (!pg || $('.adm', pg)) return !!pg;
    // Tudo o que já existia vira a tela "Usuários e acesso".
    const usuarios = document.createElement('div');
    usuarios.className = 'adm-tela';
    usuarios.dataset.admTela = 'usuarios';
    usuarios.hidden = true;
    usuarios.innerHTML = `<div class="adm-tela-barra">
        <button type="button" class="btn ecn-btn" data-adm-voltar><i data-lucide="arrow-left"></i>Voltar à Administração</button>
        <span class="adm-tela-ic" aria-hidden="true"><i data-lucide="users-round"></i></span>
        <span class="adm-tela-tit">Usuários e acesso</span>
      </div>`;
    [...pg.children].forEach((el) => usuarios.appendChild(el));

    const painel = document.createElement('div');
    painel.className = 'adm';
    painel.innerHTML = `
      <div class="estq-head adm-head">
        <span class="estq-head-ic" aria-hidden="true"><i data-lucide="settings"></i></span>
        <h2>Administração</h2>
        <p>Acessos, avisos, dados da empresa e regras do app, num lugar só.</p>
      </div>
      <div class="adm-grade">${CARDS.map((c) => `
        <button type="button" class="adm-card adm-card--${c.tom}${c.pronto ? '' : ' is-breve'}" data-adm-abrir="${c.k}"${c.pronto ? '' : ' aria-disabled="true"'}>
          <span class="adm-card__ic" aria-hidden="true"><i data-lucide="${c.icone}"></i></span>
          <span class="adm-card__corpo">
            <strong>${c.titulo}</strong>
            <span>${c.texto}</span>
          </span>
          <span class="adm-card__pe">${c.pronto ? '<span data-adm-info="' + c.k + '">Abrir</span><i data-lucide="arrow-right"></i>' : '<span class="adm-breve">Em breve</span>'}</span>
        </button>`).join('')}</div>`;
    pg.prepend(painel);
    pg.appendChild(usuarios);
    pg.classList.add('adm-pronta');

    painel.addEventListener('click', (e) => {
      const c = e.target.closest('[data-adm-abrir]');
      if (c && !c.classList.contains('is-breve')) abrir(c.dataset.admAbrir);
    });
    usuarios.querySelector('[data-adm-voltar]').addEventListener('click', () => abrir(null));
    icons();
    contar();
    return true;
  }

  function abrir(k) {
    const pg = pagina();
    if (!pg) return;
    tela = k;
    $('.adm', pg).hidden = !!k;
    pg.querySelectorAll('.adm-tela').forEach((t) => { t.hidden = t.dataset.admTela !== k; });
    pg.classList.toggle('adm-na-tela', !!k);
    if (!k) contar();
    window.scrollTo({ top: 0 });
    document.querySelector('.content')?.scrollTo?.({ top: 0 });
  }

  // Rodapé do card Usuários: quantos estão autorizados (a tabela do app.js).
  function contar() {
    const el = document.querySelector('[data-adm-info="usuarios"]');
    const txt = document.getElementById('authzCount')?.textContent || '';
    const n = (txt.match(/\d+/) || [])[0];
    if (el) el.textContent = n ? `${n} ${n === '1' ? 'usuário' : 'usuários'} · Abrir` : 'Abrir';
  }

  // A página já existe no HTML; espera o app carregar. Ao abrir pelo menu,
  // volta para o painel.
  const espera = setInterval(() => { if (montar()) clearInterval(espera); }, 500);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-page="autorizacoes"]')) setTimeout(() => { abrir(null); setTimeout(contar, 1500); }, 50);
  });
  window.EPI_ADMIN = { abrir };
})();
