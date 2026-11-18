(() => {
  'use strict';
  // Perfis de acesso (Administração → Usuários e acesso → aba Perfis).
  // A aba é uma tabela de perfis (⋯ Editar / Excluir e + para criar). O perfil
  // abre num modal: à esquerda as partes do menu, à direita as telas daquela
  // parte em dropdown, com as ações de cada tela (Consultar, Cadastrar…).
  // O perfil é ligado ao usuário na aba Usuários (coluna Perfil).
  // Etapa 1: só cadastro e vínculo; as regras ainda não consultam o perfil.
  if (window.__EPI_PERFIS__) return;
  window.__EPI_PERFIS__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const admin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const data = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); };

  // Catálogo, na ordem do menu. Cada tela tem ações; a chave fica
  // "tela.acao" (ex.: colaboradores.cadastrar). "consultar" é sempre a
  // primeira: marcar qualquer ação marca o consultar da tela, e desmarcar o
  // consultar desmarca a tela inteira. A Administração não entra: é só do
  // administrador.
  const C = ['consultar', 'Consultar'];
  const ARVORE = [
    { sec: 'dashboard', nome: 'Dashboard', icone: 'layout-dashboard', telas: [
      { k: 'dashboard', nome: 'Dashboard', icone: 'layout-dashboard', acoes: [['consultar', 'Consultar (indicadores, Economia, Valor gasto, Depósitos)']] }] },
    { sec: 'entregas', nome: 'Entregas', icone: 'package', telas: [
      { k: 'programar', nome: 'Programar entrega', icone: 'calendar-plus', acoes: [C, ['programar', 'Programar'], ['cancelar', 'Cancelar programação']] },
      { k: 'entregar', nome: 'Entregar', icone: 'hand-helping', acoes: [C, ['entregar', 'Entregar (Fila do celular e entrega avulsa)']] },
      { k: 'movimentacoes', nome: 'Movimentações', icone: 'arrow-left-right', acoes: [C, ['lancar', 'Lançar'], ['editar', 'Editar'], ['excluir', 'Excluir'], ['exportar', 'Exportar Excel']] }] },
    { sec: 'cadastros', nome: 'Cadastros', icone: 'users', telas: [
      { k: 'colaboradores', nome: 'Colaboradores', icone: 'users', acoes: [C, ['cadastrar', 'Cadastrar'], ['editar', 'Editar'], ['desativar', 'Desativar / Ativar'], ['excluir', 'Excluir']] },
      { k: 'epis', nome: 'EPIs / Itens', icone: 'hard-hat', acoes: [C, ['cadastrar', 'Cadastrar'], ['editar', 'Editar'], ['desativar', 'Desativar / Ativar'], ['excluir', 'Excluir']] },
      { k: 'ciepi', nome: 'Base CIEPI', icone: 'book-open', acoes: [C, ['cadastrar', 'Cadastrar']] }] },
    { sec: 'estoque', nome: 'Estoque', icone: 'layers', telas: [
      { k: 'estoque', nome: 'Estoque de EPI', icone: 'boxes', acoes: [C, ['entrada', 'Dar entrada'], ['ajustar', 'Ajustar saldo']] },
      { k: 'uniformes', nome: 'Uniformes (depósitos)', icone: 'shirt', acoes: [C, ['ajustar', 'Tirar e repor (− e +)'], ['cadastrar', 'Cadastrar peça e depósito'], ['editar', 'Editar e excluir peça']] },
      { k: 'notas', nome: 'Notas Fiscais', icone: 'receipt-text', acoes: [C, ['importar', 'Importar XML']] }] },
    { sec: 'outros', nome: 'Pendências e C.A.', icone: 'circle-ellipsis', telas: [
      { k: 'pendencias', nome: 'Pendências', icone: 'circle-alert', acoes: [C] },
      { k: 'caepi', nome: 'Consulta C.A.', icone: 'search', acoes: [C] }] }
  ];
  const chaves = (t) => t.acoes.map(([a]) => `${t.k}.${a}`);
  const TODAS = ARVORE.flatMap((s) => s.telas.flatMap(chaves));

  let perfis = [], erro = false;

  async function carregar() {
    const cli = db();
    if (!cli || !admin()) return;
    let { data: lista, error } = await cli.from('perfis').select('id,nome,descricao,permissoes,created_at,ativo,desativado_em').order('nome');
    if (error) ({ data: lista, error } = await cli.from('perfis').select('id,nome,descricao,permissoes,created_at').order('nome'));
    erro = !!error;
    if (error) console.error('[Perfis]', error);
    perfis = lista || [];
    // Perfil do formulário "Criar usuário".
    const sel = document.getElementById('authzPerfil');
    if (sel) { const v = sel.value; sel.innerHTML = '<option value="">Sem perfil</option>' + perfis.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}${p.ativo === false ? ' (desativado)' : ''}</option>`).join(''); sel.value = v; }
    desenhar();
    // A coluna Perfil da lista de usuários usa esta lista.
    try { if (typeof renderAuthorizedUsers === 'function') renderAuthorizedUsers(); } catch (_) {}
  }

  // ---- Abas Usuários | Perfis dentro da tela "Usuários e acesso" ----
  function montar() {
    const tela = document.querySelector('.adm-tela[data-adm-tela="usuarios"]');
    if (!tela || $('.prf-abas', tela)) return !!tela;
    const head = $('.adm-head', tela);
    const abas = document.createElement('div');
    abas.className = 'nfl-abas prf-abas';
    abas.setAttribute('role', 'tablist');
    abas.innerHTML = '<button type="button" role="tab" data-prf-aba="usuarios" aria-selected="true"><i data-lucide="users-round"></i>Usuários</button><button type="button" role="tab" data-prf-aba="perfis" aria-selected="false"><i data-lucide="shield-check"></i>Perfis</button>';
    (head || tela.firstChild).after(abas);
    const box = document.createElement('div');
    box.className = 'prf';
    box.hidden = true;
    tela.appendChild(box);
    abas.addEventListener('click', (e) => { const b = e.target.closest('[data-prf-aba]'); if (b) aba(b.dataset.prfAba); });
    montarJanelaNovo();
    icons();
    carregar();
    return true;
  }

  // "Criar usuário" vira uma janela aberta pelo + da lista.
  function montarJanelaNovo() {
    const card = document.querySelector('.authz-form-card');
    if (!card || document.getElementById('authzNovoModal')) return;
    const m = document.createElement('div');
    m.className = 'data-edit-modal dep-modal hidden';
    m.id = 'authzNovoModal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="data-edit-card dep-janela authz-modal-card"><button class="data-edit-close" type="button" aria-label="Fechar" data-authz-fechar><i data-lucide="x" aria-hidden="true"></i></button></div>';
    m.firstElementChild.appendChild(card);
    document.body.appendChild(m);
    const fechar = () => { m.classList.add('hidden'); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-authz-fechar]')) fechar(); });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } });
    document.getElementById('authzNovo')?.addEventListener('click', () => {
      const msg = document.getElementById('authzMsg'); if (msg) { msg.textContent = ''; msg.classList.remove('is-error'); }
      m.classList.remove('hidden');
      icons();
      setTimeout(() => document.getElementById('authzName')?.focus(), 30);
    });
  }
  // Usuário criado: fecha a janela (a lista já foi recarregada).
  function criado() {
    document.getElementById('authzNovoModal')?.classList.add('hidden');
    aba('usuarios');
  }

  function aba(qual) {
    const tela = document.querySelector('.adm-tela[data-adm-tela="usuarios"]');
    if (!tela) return;
    tela.classList.toggle('prf-ativa', qual === 'perfis');
    tela.querySelectorAll('[data-prf-aba]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.prfAba === qual)));
    $('.prf', tela).hidden = qual !== 'perfis';
    if (qual === 'perfis') desenhar();
  }

  const usados = (id) => { try { return (authorizedUsers || []).filter((u) => u.perfil_id === id).length; } catch (_) { return 0; } };
  const validas = (p) => (p.permissoes || []).filter((k) => TODAS.includes(k));

  // ---- Tabela de perfis ----
  function desenhar() {
    const box = document.querySelector('.adm-tela[data-adm-tela="usuarios"] .prf');
    if (!box) return;
    const n = perfis.length;
    box.innerHTML = `
      <div class="panel authz-list-panel prf-painel">
        <div class="panel-head">
          <div><h3>Perfis</h3><small>${erro ? 'Não foi possível carregar.' : n === 1 ? '1 perfil' : `${n} perfis`}</small></div>
          <div class="authz-topo-acoes"><button class="authz-redondo is-novo" type="button" data-prf-novo title="Novo perfil" aria-label="Novo perfil"><i data-lucide="plus"></i></button></div>
        </div>
        <div class="table-wrap authz-table-wrap">
          <table class="authz-table prf-tabela">
            <colgroup><col class="c-acao"><col class="c-nome"><col class="c-num"><col class="c-num"><col class="c-data"><col class="c-ativo"></colgroup>
            <thead><tr><th class="acao">Ações</th><th>Nome</th><th>Permissões</th><th>Usuários</th><th>Cadastro</th><th>Ativo</th></tr></thead>
            <tbody>${n ? perfis.map((p) => {
              const k = validas(p).length, u = usados(p.id);
              return `<tr>
                <td class="authz-action-cell"><button type="button" class="authz-mais" data-prf-mais="${esc(p.id)}" aria-label="Ações do perfil ${esc(p.nome)}"><i data-lucide="ellipsis"></i></button></td>
                <td class="authz-nome" title="${esc(p.nome)}">${esc(p.nome)}</td>
                <td>${k} de ${TODAS.length}</td>
                <td>${u ? `${u} ${u === 1 ? 'usuário' : 'usuários'}` : '<span class="authz-sem">Nenhum</span>'}</td>
                <td>${data(p.created_at)}</td>
                <td><span class="authz-ativo ${p.ativo === false ? 'is-nao' : 'is-sim'}"${p.desativado_em ? ` title="Desativado em ${data(p.desativado_em)}"` : ''}>${p.ativo === false ? 'Não' : 'Sim'}</span></td>
              </tr>`;
            }).join('') : `<tr><td colspan="6" class="prf-vazio-linha">Nenhum perfil ainda. Clique no + para criar o primeiro.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
    box.querySelector('[data-prf-novo]').addEventListener('click', () => abrirModal(null));
    box.querySelectorAll('[data-prf-mais]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); menu(b, perfis.find((x) => x.id === b.dataset.prfMais)); }));
    icons();
  }

  // ---- Menu ⋯ (Editar / Excluir) ----
  let menuEl = null;
  function fecharMenu() { menuEl?.remove(); menuEl = null; }
  function menu(botao, p) {
    if (!p) return;
    const ja = menuEl && menuEl.dataset.id === p.id;
    fecharMenu();
    if (ja) return;
    menuEl = document.createElement('div');
    menuEl.className = 'authz-menu';
    menuEl.dataset.id = p.id;
    menuEl.setAttribute('role', 'menu');
    const ativo = p.ativo !== false;
    menuEl.innerHTML = `<button type="button" role="menuitem" data-m="editar"><i data-lucide="pencil"></i>Alterar perfil</button>
      <button type="button" role="menuitem" data-m="duplicar"><i data-lucide="copy"></i>Duplicar perfil</button>
      <button type="button" role="menuitem" data-m="ativo"><i data-lucide="${ativo ? 'archive' : 'archive-restore'}"></i>${ativo ? 'Desativar perfil' : 'Ativar perfil'}</button>
      <div class="authz-menu-sep"></div>
      <button type="button" role="menuitem" class="is-perigo" data-m="excluir"><i data-lucide="trash-2"></i>Excluir perfil</button>`;
    document.body.appendChild(menuEl);
    const r = botao.getBoundingClientRect();
    menuEl.style.left = Math.min(r.left, innerWidth - menuEl.offsetWidth - 8) + 'px';
    const cima = r.bottom + menuEl.offsetHeight + 8 > innerHeight;
    menuEl.style.top = (cima ? r.top - menuEl.offsetHeight - 4 : r.bottom + 4) + 'px';
    menuEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      fecharMenu();
      if (b.dataset.m === 'editar') abrirModal(p);
      else if (b.dataset.m === 'duplicar') abrirModal(p, true);
      else if (b.dataset.m === 'ativo') alternarAtivo(p);
      else excluir(p);
    });
    icons();
  }
  document.addEventListener('click', (e) => { if (menuEl && !menuEl.contains(e.target)) fecharMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
  window.addEventListener('scroll', fecharMenu, true);
  window.addEventListener('resize', fecharMenu);

  // Desativar: o perfil fica guardado, mas não vale (quem está nele fica
  // como quem não tem perfil). Ativar volta a valer.
  async function alternarAtivo(p) {
    const ativo = p.ativo !== false, n = usados(p.id);
    if (ativo && !confirm(`Desativar o perfil "${p.nome}"?${n ? `\n\n${n} ${n === 1 ? 'usuário fica' : 'usuários ficam'} só com o acesso básico até ativar de novo.` : ''}`)) return;
    const { error } = await db().from('perfis').update({ ativo: !ativo, desativado_em: ativo ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) { alert('Não foi possível ' + (ativo ? 'desativar' : 'ativar') + ': ' + error.message); return; }
    await carregar();
  }

  async function excluir(p) {
    const n = usados(p.id);
    if (!confirm(`Excluir o perfil "${p.nome}"?${n ? `\n\n${n} ${n === 1 ? 'usuário fica' : 'usuários ficam'} sem perfil.` : ''}`)) return;
    const { error } = await db().from('perfis').delete().eq('id', p.id);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    await carregar();
    try { if (typeof loadAuthorizedUsers === 'function') loadAuthorizedUsers(); } catch (_) {}
  }

  // ---- Modal do perfil: partes do menu à esquerda, telas em dropdown à direita ----
  // copia = true: "Duplicar perfil" (abre preenchido e salva como perfil novo).
  function abrirModal(p, copia = false) {
    const base = p;
    if (copia) p = null;
    document.getElementById('prfModal')?.remove();
    const marc = new Set(base ? validas(base) : []);
    const abertos = new Set();
    let sec = ARVORE[0].sec;
    const m = document.createElement('div');
    m.className = 'data-edit-modal dep-modal';
    m.id = 'prfModal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'prfModalTitulo');
    m.innerHTML = `
      <div class="data-edit-card dep-janela prf-janela">
        <button class="data-edit-close" type="button" aria-label="Fechar" data-prf-fechar><i data-lucide="x"></i></button>
        <div class="data-edit-head">
          <div class="data-edit-icon"><i data-lucide="shield-check"></i></div>
          <div><h3 id="prfModalTitulo">${copia ? 'Duplicar perfil' : p ? 'Alterar perfil' : 'Novo perfil'}</h3><p>Escolha o que quem tiver este perfil pode fazer.</p></div>
        </div>
        <div class="data-edit-body">
          <div class="field prf-nome"><label for="prfNome">Nome*</label><input id="prfNome" maxlength="60" placeholder="Ex.: Almoxarife" value="${esc(copia ? `${base.nome} (cópia)` : p?.nome || '')}" autocomplete="off"></div>
          <div class="prf-corpo">
            <nav class="prf-nav" aria-label="Partes do sistema"></nav>
            <div class="prf-telas"></div>
          </div>
          <div class="data-edit-actions">
            <span class="prf-msg" data-prf-msg></span>
            <button class="btn" type="button" data-prf-fechar>Cancelar</button>
            <button class="btn primary" type="button" data-prf-salvar><i data-lucide="save"></i>Salvar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    const nav = $('.prf-nav', m), lado = $('.prf-telas', m), msg = $('[data-prf-msg]', m);

    // Estado de uma lista de chaves: 'tudo' | 'parte' | 'nada'.
    const estado = (ks) => { const n = ks.filter((k) => marc.has(k)).length; return n === 0 ? 'nada' : n === ks.length ? 'tudo' : 'parte'; };
    const caixa = (st, attrs) => `<input type="checkbox" ${attrs}${st === 'tudo' ? ' checked' : ''}${st === 'parte' ? ' data-meio' : ''}>`;
    const marcarTela = (t, sim) => chaves(t).forEach((k) => sim ? marc.add(k) : marc.delete(k));

    function render() {
      nav.innerHTML = ARVORE.map((s) => {
        const ks = s.telas.flatMap(chaves), n = ks.filter((k) => marc.has(k)).length;
        return `<button type="button" class="prf-sec${s.sec === sec ? ' is-ativo' : ''}" data-sec="${s.sec}"${s.sec === sec ? ' aria-current="true"' : ''}>
          <i data-lucide="${s.icone}"></i><span>${esc(s.nome)}</span><small class="${n ? 'tem' : ''}">${n}/${ks.length}</small><i data-lucide="chevron-right" class="prf-sec-seta"></i></button>`;
      }).join('');
      const s = ARVORE.find((x) => x.sec === sec);
      const ksSec = s.telas.flatMap(chaves);
      lado.innerHTML = `
        <label class="prf-tudo">${caixa(estado(ksSec), 'data-tudo')}<b>${esc(s.nome)}</b><span>Marcar tudo desta parte</span></label>
        ${s.telas.map((t) => {
          const ks = chaves(t), n = ks.filter((k) => marc.has(k)).length, aberto = abertos.has(t.k);
          return `<div class="prf-tela${aberto ? ' is-aberto' : ''}">
            <div class="prf-tela-cab">
              ${caixa(estado(ks), `data-tela="${t.k}" aria-label="${esc(t.nome)}: tudo"`)}
              <button type="button" class="prf-tela-abre" data-abre="${t.k}" aria-expanded="${aberto}">
                <i data-lucide="${t.icone}"></i><b>${esc(t.nome)}</b><small class="${n ? 'tem' : ''}">${n}/${ks.length}</small><i data-lucide="chevron-down" class="prf-tela-seta"></i>
              </button>
            </div>
            ${aberto ? `<div class="prf-acoes-lista">${t.acoes.map(([a, rot]) => `<label class="prf-acao">${caixa(marc.has(`${t.k}.${a}`) ? 'tudo' : 'nada', `data-acao="${t.k}.${a}"`)}<span>${esc(rot)}</span></label>`).join('')}</div>` : ''}
          </div>`;
        }).join('')}`;
      m.querySelectorAll('input[data-meio]').forEach((c) => { c.indeterminate = true; });
      icons();
    }

    nav.addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) { sec = b.dataset.sec; render(); } });
    lado.addEventListener('click', (e) => {
      const b = e.target.closest('[data-abre]'); if (!b) return;
      const k = b.dataset.abre; abertos.has(k) ? abertos.delete(k) : abertos.add(k); render();
    });
    lado.addEventListener('change', (e) => {
      const c = e.target, s = ARVORE.find((x) => x.sec === sec);
      if (c.matches('[data-tudo]')) s.telas.forEach((t) => marcarTela(t, c.checked));
      else if (c.matches('[data-tela]')) { const t = s.telas.find((x) => x.k === c.dataset.tela); marcarTela(t, c.checked); if (c.checked) abertos.add(t.k); }
      else if (c.matches('[data-acao]')) {
        const k = c.dataset.acao, [tk, a] = k.split('.');
        const t = s.telas.find((x) => x.k === tk);
        if (c.checked) { marc.add(k); marc.add(`${tk}.consultar`); }
        else if (a === 'consultar') marcarTela(t, false);
        else marc.delete(k);
      }
      msg.textContent = '';
      render();
    });

    const fechar = () => m.remove();
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-prf-fechar]')) fechar(); });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } });

    m.querySelector('[data-prf-salvar]').addEventListener('click', async () => {
      const nome = $('#prfNome', m).value.trim();
      if (!nome) { msg.textContent = 'Informe o nome do perfil.'; msg.className = 'prf-msg is-erro'; $('#prfNome', m).focus(); return; }
      if (perfis.some((x) => x.id !== p?.id && x.nome.trim().toLowerCase() === nome.toLowerCase())) { msg.textContent = 'Já existe um perfil com esse nome.'; msg.className = 'prf-msg is-erro'; return; }
      const permissoes = TODAS.filter((k) => marc.has(k));
      msg.textContent = 'Salvando…'; msg.className = 'prf-msg';
      const dados = { nome, permissoes, updated_at: new Date().toISOString() };
      const r = p ? await db().from('perfis').update(dados).eq('id', p.id).select('id').single() : await db().from('perfis').insert(dados).select('id').single();
      if (r.error) { msg.textContent = r.error.code === '23505' ? 'Já existe um perfil com esse nome.' : 'Não foi possível salvar: ' + r.error.message; msg.className = 'prf-msg is-erro'; return; }
      fechar();
      await carregar();
    });

    render();
    setTimeout(() => $('#prfNome', m)?.focus(), 30);
  }

  const espera = setInterval(() => { if (montar()) clearInterval(espera); }, 600);
  document.addEventListener('click', (e) => { if (e.target.closest('.nav [data-page="autorizacoes"]')) setTimeout(carregar, 300); });
  window.EPI_PERFIS = { lista: () => perfis, recarregar: carregar, arvore: ARVORE, aba, criado };
})();
