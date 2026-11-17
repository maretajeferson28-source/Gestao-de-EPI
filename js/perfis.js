(() => {
  'use strict';
  // Perfis de acesso (Administração → Usuários e acesso → aba Perfis).
  // Cada perfil tem um nome e as permissões marcadas numa árvore igual ao
  // menu. O perfil é ligado ao usuário na aba Usuários (coluna Perfil).
  // Etapa 1: só cadastro e vínculo; as regras ainda não consultam o perfil.
  if (window.__EPI_PERFIS__) return;
  window.__EPI_PERFIS__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const admin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });

  // Catálogo de permissões, na ordem do menu. A Administração não entra:
  // é só do administrador.
  const ARVORE = [
    { grupo: 'Dashboard', icone: 'layout-dashboard', itens: [['dashboard.ver', 'Ver o Dashboard (indicadores, Economia, Valor gasto)']] },
    { grupo: 'Entregas', icone: 'package', itens: [
      ['entregas.programar', 'Programar entregas'],
      ['entregas.entregar', 'Entregar (Fila do celular e entrega avulsa)'],
      ['movimentacoes.ver', 'Ver movimentações'],
      ['movimentacoes.editar', 'Lançar, editar e excluir movimentações']] },
    { grupo: 'Cadastros', icone: 'users', itens: [
      ['colaboradores.ver', 'Ver colaboradores e histórico'],
      ['colaboradores.editar', 'Cadastrar, editar e desativar colaboradores'],
      ['epis.ver', 'Ver EPIs / Itens'],
      ['epis.editar', 'Cadastrar e editar EPIs / Itens e C.A.s'],
      ['ciepi.ver', 'Base CIEPI']] },
    { grupo: 'Estoque', icone: 'layers', itens: [
      ['estoque.ver', 'Ver estoque e depósitos'],
      ['estoque.ajustar', 'Entradas e ajustes (inclui − e + dos uniformes)'],
      ['notas.ver', 'Ver notas fiscais'],
      ['notas.importar', 'Importar notas (XML)']] },
    { grupo: 'Outros', icone: 'circle-ellipsis', itens: [
      ['pendencias.ver', 'Pendências'],
      ['caepi.ver', 'Consulta C.A.']] }
  ];
  const TODAS = ARVORE.flatMap((g) => g.itens.map((i) => i[0]));

  let perfis = [], erro = false, editando = null; // editando: id ou 'novo'

  async function carregar() {
    const cli = db();
    if (!cli || !admin()) return;
    const { data, error } = await cli.from('perfis').select('id,nome,descricao,permissoes').order('nome');
    erro = !!error;
    if (error) console.error('[Perfis]', error);
    perfis = data || [];
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
    icons();
    carregar();
    return true;
  }

  function aba(qual) {
    const tela = document.querySelector('.adm-tela[data-adm-tela="usuarios"]');
    if (!tela) return;
    tela.classList.toggle('prf-ativa', qual === 'perfis');
    tela.querySelectorAll('[data-prf-aba]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.prfAba === qual)));
    $('.prf', tela).hidden = qual !== 'perfis';
    if (qual === 'perfis') { if (!editando && perfis[0]) editando = perfis[0].id; desenhar(); }
  }

  // ---- Lista de perfis + editor com a árvore ----
  function desenhar() {
    const box = document.querySelector('.adm-tela[data-adm-tela="usuarios"] .prf');
    if (!box) return;
    const p = editando === 'novo' ? { id: null, nome: '', descricao: '', permissoes: [] } : perfis.find((x) => x.id === editando);
    const usados = (id) => { try { return (authorizedUsers || []).filter((u) => u.perfil_id === id).length; } catch (_) { return 0; } };
    box.innerHTML = `
      <aside class="prf-lista">
        <div class="prf-lista-cab"><h3>Perfis</h3><button type="button" class="colab-novo" data-prf-novo><i data-lucide="plus"></i>Novo perfil</button></div>
        ${erro ? '<p class="prf-vazio">Não foi possível carregar os perfis.</p>' : perfis.length ? perfis.map((x) => `
          <button type="button" class="prf-item${x.id === editando ? ' is-ativo' : ''}" data-prf-abrir="${esc(x.id)}">
            <span class="prf-item-ic" aria-hidden="true"><i data-lucide="shield-check"></i></span>
            <span class="prf-item-txt"><b>${esc(x.nome)}</b><small>${x.permissoes.length} ${x.permissoes.length === 1 ? 'permissão' : 'permissões'} · ${usados(x.id)} ${usados(x.id) === 1 ? 'usuário' : 'usuários'}</small></span>
          </button>`).join('') : '<p class="prf-vazio">Nenhum perfil ainda. Crie o primeiro em "Novo perfil".</p>'}
      </aside>
      <section class="prf-editor">${p ? editor(p) : '<div class="prf-vazio prf-vazio--grande">Escolha um perfil à esquerda ou crie um novo.</div>'}</section>`;
    ligar(box, p);
    icons();
  }

  function editor(p) {
    const tem = new Set(p.permissoes || []);
    return `
      <div class="prf-editor-cab">
        <div class="field prf-nome"><label for="prfNome">Nome do perfil*</label><input id="prfNome" maxlength="60" placeholder="Ex.: Almoxarife" value="${esc(p.nome)}" autocomplete="off"></div>
        <div class="field prf-desc"><label for="prfDesc">Descrição</label><input id="prfDesc" maxlength="160" placeholder="Opcional" value="${esc(p.descricao || '')}" autocomplete="off"></div>
      </div>
      <div class="prf-arvore">
        <div class="prf-arvore-topo"><span>O que este perfil pode fazer</span><button type="button" class="prf-link" data-prf-tudo>Marcar tudo</button><button type="button" class="prf-link" data-prf-nada>Desmarcar tudo</button></div>
        ${ARVORE.map((g, gi) => {
          const n = g.itens.filter((i) => tem.has(i[0])).length;
          return `<div class="prf-grupo">
            <label class="prf-grupo-cab"><input type="checkbox" data-prf-grupo="${gi}"${n === g.itens.length ? ' checked' : ''}><i data-lucide="${g.icone}"></i><b>${esc(g.grupo)}</b><small data-prf-conta="${gi}">${n}/${g.itens.length}</small></label>
            <div class="prf-itens">${g.itens.map(([k, t]) => `<label class="prf-perm"><input type="checkbox" data-prf-perm="${k}" data-prf-g="${gi}"${tem.has(k) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
          </div>`;
        }).join('')}
        <p class="prf-nota"><i data-lucide="info"></i>A Administração é só do administrador. Por enquanto o perfil fica guardado e ligado ao usuário; na próxima etapa o app e o banco passam a obedecer a ele.</p>
      </div>
      <div class="prf-acoes">
        ${p.id ? '<button type="button" class="btn uni-ed-excluir prf-excluir" data-prf-excluir><i data-lucide="trash-2"></i>Excluir perfil</button>' : ''}
        <span class="uni-ed-espaco"></span>
        <span class="prf-msg" data-prf-msg></span>
        <button type="button" class="colab-novo" data-prf-salvar><i data-lucide="save"></i>Salvar perfil</button>
      </div>`;
  }

  function ligar(box, p) {
    box.querySelector('[data-prf-novo]')?.addEventListener('click', () => { editando = 'novo'; desenhar(); setTimeout(() => document.getElementById('prfNome')?.focus(), 30); });
    box.querySelectorAll('[data-prf-abrir]').forEach((b) => b.addEventListener('click', () => { editando = b.dataset.prfAbrir; desenhar(); }));
    if (!p) return;
    const ed = $('.prf-editor', box);
    const contar = () => ARVORE.forEach((g, gi) => {
      const caixas = [...ed.querySelectorAll(`[data-prf-g="${gi}"]`)];
      const n = caixas.filter((c) => c.checked).length;
      const cab = ed.querySelector(`[data-prf-grupo="${gi}"]`);
      cab.checked = n === caixas.length; cab.indeterminate = n > 0 && n < caixas.length;
      ed.querySelector(`[data-prf-conta="${gi}"]`).textContent = `${n}/${caixas.length}`;
    });
    contar();
    ed.addEventListener('change', (e) => {
      const g = e.target.closest('[data-prf-grupo]');
      if (g) ed.querySelectorAll(`[data-prf-g="${g.dataset.prfGrupo}"]`).forEach((c) => { c.checked = g.checked; });
      contar();
    });
    ed.querySelector('[data-prf-tudo]').addEventListener('click', () => { ed.querySelectorAll('[data-prf-perm]').forEach((c) => { c.checked = true; }); contar(); });
    ed.querySelector('[data-prf-nada]').addEventListener('click', () => { ed.querySelectorAll('[data-prf-perm]').forEach((c) => { c.checked = false; }); contar(); });
    const msg = $('[data-prf-msg]', ed);
    ed.querySelector('[data-prf-salvar]').addEventListener('click', async () => {
      const nome = document.getElementById('prfNome').value.trim();
      const descricao = document.getElementById('prfDesc').value.trim() || null;
      const permissoes = [...ed.querySelectorAll('[data-prf-perm]:checked')].map((c) => c.dataset.prfPerm).filter((k) => TODAS.includes(k));
      if (!nome) { msg.textContent = 'Informe o nome do perfil.'; msg.className = 'prf-msg is-erro'; return; }
      if (perfis.some((x) => x.id !== p.id && x.nome.trim().toLowerCase() === nome.toLowerCase())) { msg.textContent = 'Já existe um perfil com esse nome.'; msg.className = 'prf-msg is-erro'; return; }
      msg.textContent = 'Salvando…'; msg.className = 'prf-msg';
      const dados = { nome, descricao, permissoes, updated_at: new Date().toISOString() };
      const r = p.id ? await db().from('perfis').update(dados).eq('id', p.id).select('id').single() : await db().from('perfis').insert(dados).select('id').single();
      if (r.error) { msg.textContent = r.error.code === '23505' ? 'Já existe um perfil com esse nome.' : 'Não foi possível salvar: ' + r.error.message; msg.className = 'prf-msg is-erro'; return; }
      editando = r.data.id;
      await carregar();
      const m2 = document.querySelector('[data-prf-msg]');
      if (m2) { m2.textContent = 'Perfil salvo.'; m2.className = 'prf-msg is-ok'; }
    });
    ed.querySelector('[data-prf-excluir]')?.addEventListener('click', async () => {
      let n = 0; try { n = (authorizedUsers || []).filter((u) => u.perfil_id === p.id).length; } catch (_) {}
      if (!confirm(`Excluir o perfil "${p.nome}"?${n ? `\n\n${n} ${n === 1 ? 'usuário fica' : 'usuários ficam'} sem perfil.` : ''}`)) return;
      const { error } = await db().from('perfis').delete().eq('id', p.id);
      if (error) { msg.textContent = 'Não foi possível excluir: ' + error.message; msg.className = 'prf-msg is-erro'; return; }
      editando = null;
      await carregar();
      try { if (typeof loadAuthorizedUsers === 'function') loadAuthorizedUsers(); } catch (_) {}
    });
  }

  const espera = setInterval(() => { if (montar()) clearInterval(espera); }, 600);
  document.addEventListener('click', (e) => { if (e.target.closest('.nav [data-page="autorizacoes"]')) setTimeout(carregar, 300); });
  window.EPI_PERFIS = { lista: () => perfis, recarregar: carregar, arvore: ARVORE };
})();
