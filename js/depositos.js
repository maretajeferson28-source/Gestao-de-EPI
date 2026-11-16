(() => {
  'use strict';
  // Tela "Depósitos" (botão "Por Unidade" do banner do Dashboard, js/dash-palco.js).
  // Mesmo molde das telas da Economia e do Valor gasto (classes .ecn-*), com a
  // arte e o fundo laranja de Movimentações. Lista os depósitos
  // (tabela public.depositos, supabase/depositos.sql) e o administrador
  // adiciona novos pela janela "Adicionar depósito".
  if (window.__EPI_DEPOSITOS__) return;
  window.__EPI_DEPOSITOS__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const db = () => (typeof sb !== 'undefined' ? sb : null);
  const admin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });

  let raiz = null;
  let lista = [];
  let erroTabela = false;

  function montar(el, voltar) {
    raiz = el;
    el.innerHTML = `
      <div class="ecn dep">
        <div class="ecn-head">
          <span class="ecn-head-ic" aria-hidden="true"><i data-lucide="warehouse"></i></span>
          <h2>Depósitos</h2>
          <p data-dep-resumo>Entregas, gasto e estoque de cada unidade</p>
        </div>
        <div class="ecn-barra">
          <button type="button" class="colab-novo dep-novo" data-dep-novo${admin() ? '' : ' hidden'}><i data-lucide="plus" aria-hidden="true"></i>Adicionar depósito</button>
          <button type="button" class="btn ecn-btn ecn-btn--csv" data-stage-voltar><i data-lucide="arrow-left"></i>Voltar ao Dashboard</button>
        </div>
        <div data-dep-lista><p class="dep-carregando">Carregando…</p></div>
      </div>`;
    el.querySelector('[data-stage-voltar]').addEventListener('click', voltar);
    el.querySelector('[data-dep-novo]').addEventListener('click', () => abrirJanela());
    carregar();
  }

  async function carregar() {
    const cli = db();
    if (!cli) return;
    const { data, error } = await cli.from('depositos').select('id,nome,cidade,endereco,responsavel,observacao,ativo').order('nome');
    erroTabela = !!error;
    if (error) console.error('[Depósitos]', error);
    lista = data || [];
    desenhar();
  }

  function desenhar() {
    if (!raiz || !raiz.isConnected) return;
    const alvo = $('[data-dep-lista]', raiz);
    if (!alvo) return;
    const ativos = lista.filter((d) => d.ativo !== false);
    $('[data-dep-resumo]', raiz).textContent = ativos.length
      ? `${ativos.length} ${ativos.length === 1 ? 'depósito cadastrado' : 'depósitos cadastrados'}`
      : 'Entregas, gasto e estoque de cada unidade';
    if (erroTabela) {
      alvo.innerHTML = vazio('Não foi possível carregar os depósitos', 'A tabela de depósitos ainda não existe no banco. Rode o arquivo supabase/depositos.sql e abra esta tela de novo.');
    } else if (!ativos.length) {
      alvo.innerHTML = vazio('Nenhum depósito cadastrado ainda', admin()
        ? 'Use "Adicionar depósito" para cadastrar o primeiro. Depois, cada um aparece aqui com as suas entregas, o valor gasto e o estoque.'
        : 'Quando os depósitos forem criados, cada um aparece aqui com as suas entregas, o valor gasto e o estoque.');
    } else {
      alvo.innerHTML = `<div class="dep-grade">${ativos.map((d) => `
        <article class="dep-card">
          <span class="dep-card__ic" aria-hidden="true"><i data-lucide="warehouse"></i></span>
          <div class="dep-card__corpo">
            <h3>${esc(d.nome)}</h3>
            ${d.cidade || d.endereco ? `<p><i data-lucide="map-pin" aria-hidden="true"></i>${esc([d.endereco, d.cidade].filter(Boolean).join(' · '))}</p>` : ''}
            ${d.responsavel ? `<p><i data-lucide="user-round" aria-hidden="true"></i>${esc(d.responsavel)}</p>` : ''}
            ${d.observacao ? `<small>${esc(d.observacao)}</small>` : ''}
          </div>
        </article>`).join('')}</div>`;
    }
    icons();
  }

  function vazio(titulo, texto) {
    return `<div class="dep-vazio">
      <span class="dep-vazio__ic" aria-hidden="true"><i data-lucide="map-pin"></i></span>
      <h3>${esc(titulo)}</h3>
      <p>${esc(texto)}</p>
    </div>`;
  }

  // ---- Janela "Adicionar depósito" (mesma identidade aço da Entrada no estoque) ----
  function janela() {
    let m = document.getElementById('depositoModal');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'data-edit-modal hidden';
    m.id = 'depositoModal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'depositoTitulo');
    m.innerHTML = `
      <div class="data-edit-card dep-janela">
        <button class="data-edit-close" type="button" aria-label="Fechar" data-dep-fechar><i data-lucide="x" aria-hidden="true"></i></button>
        <div class="data-edit-head">
          <div class="data-edit-icon"><i data-lucide="warehouse" aria-hidden="true"></i></div>
          <div>
            <h3 id="depositoTitulo">Adicionar depósito</h3>
            <p>Campos com * são obrigatórios.</p>
          </div>
        </div>
        <div class="data-edit-body">
          <div class="data-edit-grid">
            <div class="field dep-col-cheia"><label for="depNome">Nome do depósito*</label><input id="depNome" maxlength="80" placeholder="Ex.: Matriz" autocomplete="off"></div>
            <div class="field"><label for="depCidade">Cidade</label><input id="depCidade" maxlength="80" placeholder="Opcional" autocomplete="off"></div>
            <div class="field"><label for="depResp">Responsável</label><input id="depResp" maxlength="80" placeholder="Opcional" autocomplete="off"></div>
            <div class="field dep-col-cheia"><label for="depEndereco">Endereço</label><input id="depEndereco" maxlength="160" placeholder="Opcional" autocomplete="off"></div>
            <div class="field dep-col-cheia"><label for="depObs">Observação</label><input id="depObs" maxlength="200" placeholder="Opcional" autocomplete="off"></div>
          </div>
          <div class="data-edit-actions">
            <button class="btn" type="button" data-dep-fechar>Cancelar</button>
            <button class="btn primary" type="button" id="depSalvar"><i data-lucide="save" aria-hidden="true"></i>Salvar depósito</button>
          </div>
          <div class="msg" id="depMsg"></div>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-dep-fechar]')) fecharJanela(); });
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); fecharJanela(); }
      if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); salvar(); }
    });
    $('#depSalvar', m).addEventListener('click', salvar);
    return m;
  }

  function abrirJanela() {
    if (!admin()) return;
    const m = janela();
    ['depNome', 'depCidade', 'depResp', 'depEndereco', 'depObs'].forEach((id) => { document.getElementById(id).value = ''; });
    $('#depMsg', m).textContent = '';
    m.classList.remove('hidden');
    icons();
    setTimeout(() => document.getElementById('depNome').focus(), 30);
  }
  function fecharJanela() {
    document.getElementById('depositoModal')?.classList.add('hidden');
    $('[data-dep-novo]', raiz || document)?.focus({ preventScroll: true });
  }

  async function salvar() {
    const msg = document.getElementById('depMsg');
    const v = (id) => document.getElementById(id).value.trim();
    const nome = v('depNome');
    if (!nome) { msg.textContent = 'Informe o nome do depósito.'; document.getElementById('depNome').focus(); return; }
    if (lista.some((d) => d.nome.trim().toLowerCase() === nome.toLowerCase())) { msg.textContent = 'Já existe um depósito com esse nome.'; return; }
    const botao = document.getElementById('depSalvar');
    botao.disabled = true;
    msg.textContent = 'Salvando…';
    const { error } = await db().from('depositos').insert({
      nome, cidade: v('depCidade') || null, responsavel: v('depResp') || null,
      endereco: v('depEndereco') || null, observacao: v('depObs') || null
    });
    botao.disabled = false;
    if (error) {
      msg.textContent = error.code === '23505' ? 'Já existe um depósito com esse nome.'
        : error.code === '42P01' || /depositos/.test(error.message || '') && /exist|schema cache/i.test(error.message || '')
          ? 'A tabela de depósitos ainda não existe no banco. Rode o arquivo supabase/depositos.sql.'
          : 'Não foi possível salvar: ' + error.message;
      return;
    }
    fecharJanela();
    await carregar();
  }

  window.EPI_PALCO_UNIDADE = { montar, atualizar() { if (raiz?.isConnected) carregar(); } };
})();
