(() => {
  'use strict';
  // Tela "Depósitos" (botão "Por Unidade" do banner do Dashboard, js/dash-palco.js).
  // Mesmo molde das telas da Economia e do Valor gasto (classes .ecn-*), com a
  // arte e o fundo laranja de Movimentações.
  // Contagem simples de uniformes e calçados: cada depósito (public.depositos)
  // tem peças com tamanho e quantidade (public.deposito_itens), ajustadas com
  // − e +. Não entra no estoque de EPI. Só o administrador altera.
  if (window.__EPI_DEPOSITOS__) return;
  window.__EPI_DEPOSITOS__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const db = () => (typeof sb !== 'undefined' ? sb : null);
  const P = (...k) => { try { return typeof window.epiPode === 'function' ? window.epiPode(...k) : currentIsAdmin === true; } catch (_) { return false; } };
  const admin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  // Tamanhos em ordem de vestir (P, M, G…) e numéricos em ordem de número.
  const ORDEM = ['PP', 'P', 'M', 'G', 'GG', 'EXG', 'EXGG', 'EXGGG'];
  const pesoTam = (t) => { const s = String(t || '').trim().toUpperCase(); const n = parseFloat(s); if (!Number.isNaN(n)) return n; const i = ORDEM.indexOf(s.split(' ')[0]); return i < 0 ? 999 : 1000 + i; };

  let raiz = null, voltarDash = null;
  let depositos = [], itens = [], erroTabela = false;
  let aberto = null, busca = '', pagina = 1;
  const POR_PAGINA = 10;

  function montar(el, voltar) {
    raiz = el; voltarDash = voltar; aberto = null; busca = '';
    el.innerHTML = '<div class="ecn dep" data-dep-raiz></div>';
    desenhar();
    carregar();
  }

  async function carregar() {
    const cli = db();
    if (!cli) return;
    const [d, i] = await Promise.all([
      cli.from('depositos').select('id,nome,cidade,endereco,responsavel,observacao,ativo').order('nome'),
      cli.from('deposito_itens').select('id,deposito_id,peca,tamanho,quantidade,ca')
    ]);
    erroTabela = !!d.error;
    if (d.error) console.error('[Depósitos]', d.error);
    if (i.error) console.error('[Depósitos itens]', i.error);
    depositos = (d.data || []).filter((x) => x.ativo !== false);
    itens = i.data || [];
    if (aberto && !depositos.some((x) => x.id === aberto)) aberto = null;
    desenhar();
  }

  const doDeposito = (id) => itens.filter((x) => x.deposito_id === id);
  const total = (id) => doDeposito(id).reduce((s, x) => s + (Number(x.quantidade) || 0), 0);

  function desenhar() {
    const caixa = raiz && raiz.isConnected && $('[data-dep-raiz]', raiz);
    if (!caixa) return;
    if (aberto) desenharSala(caixa); else desenharLista(caixa);
    icons();
  }

  // ---- Lista: um card por depósito ----
  function desenharLista(caixa) {
    caixa.innerHTML = `
      <div class="ecn-head">
        <span class="ecn-head-ic" aria-hidden="true"><i data-lucide="warehouse"></i></span>
        <h2>Depósitos</h2>
        <p>${depositos.length ? `${num(depositos.length)} ${depositos.length === 1 ? 'depósito' : 'depósitos'} · ${num(itens.reduce((s, x) => s + (Number(x.quantidade) || 0), 0))} peças guardadas` : 'Uniformes e calçados de cada sala'}</p>
      </div>
      <div class="ecn-barra">
        <button type="button" class="colab-novo dep-novo" data-dep-novo${P('uniformes.cadastrar') ? '' : ' hidden'}><i data-lucide="plus" aria-hidden="true"></i>Adicionar depósito</button>
        <button type="button" class="btn ecn-btn ecn-btn--csv" data-stage-voltar><i data-lucide="arrow-left"></i>Voltar ao Dashboard</button>
      </div>
      <div data-dep-lista>${conteudoLista()}</div>`;
    $('[data-stage-voltar]', caixa).addEventListener('click', () => voltarDash?.());
    $('[data-dep-novo]', caixa).addEventListener('click', () => abrirJanela());
    caixa.querySelectorAll('[data-dep-abrir]').forEach((b) => b.addEventListener('click', () => { aberto = b.dataset.depAbrir; busca = ''; pagina = 1; desenhar(); }));
  }
  function conteudoLista() {
    if (erroTabela) return vazio('Não foi possível carregar os depósitos', 'Tente de novo em instantes.');
    if (!depositos.length) return vazio('Nenhum depósito cadastrado ainda', P('uniformes.cadastrar') ? 'Use "Adicionar depósito" para cadastrar o primeiro.' : 'Quando os depósitos forem criados, cada um aparece aqui.');
    return `<div class="dep-grade">${depositos.map((d) => {
      const lista = doDeposito(d.id), pecas = new Set(lista.map((x) => x.peca));
      return `<button type="button" class="dep-card" data-dep-abrir="${esc(d.id)}">
        <span class="dep-card__ic" aria-hidden="true"><i data-lucide="warehouse"></i></span>
        <span class="dep-card__corpo">
          <h3>${esc(d.nome)}</h3>
          <strong class="dep-card__total">${num(total(d.id))}<small> peças</small></strong>
          <p>${num(pecas.size)} ${pecas.size === 1 ? 'tipo de peça' : 'tipos de peça'} · ${num(lista.length)} ${lista.length === 1 ? 'tamanho' : 'tamanhos'}</p>
          ${d.cidade || d.endereco ? `<p><i data-lucide="map-pin" aria-hidden="true"></i>${esc([d.endereco, d.cidade].filter(Boolean).join(' · '))}</p>` : ''}
        </span>
        <i class="dep-card__seta" data-lucide="chevron-right" aria-hidden="true"></i>
      </button>`;
    }).join('')}</div>`;
  }

  // ---- Sala aberta: peças, tamanhos e quantidade com − e + ----
  function desenharSala(caixa) {
    const d = depositos.find((x) => x.id === aberto);
    caixa.innerHTML = `
      <div class="ecn-head">
        <span class="ecn-head-ic" aria-hidden="true"><i data-lucide="warehouse"></i></span>
        <h2>${esc(d.nome)}</h2>
        <p data-dep-resumo></p>
      </div>
      <div class="ecn-barra">
        <label class="colab-busca ecn-busca"><i data-lucide="search" aria-hidden="true"></i><input type="search" data-dep-busca placeholder="Buscar peça ou tamanho" autocomplete="off" aria-label="Buscar peça ou tamanho" value="${esc(busca)}"></label>
        <button type="button" class="colab-novo dep-peca-novo" data-dep-peca${P('uniformes.cadastrar') ? '' : ' hidden'}><i data-lucide="plus" aria-hidden="true"></i>Adicionar peça</button>
        <button type="button" class="btn ecn-btn ecn-btn--csv" data-dep-voltar><i data-lucide="arrow-left"></i>Voltar aos depósitos</button>
      </div>
      <div class="ecn-tabela-wrap">
        <table class="ecn-tabela dep-tabela">
          <colgroup><col><col class="c-tam"><col class="c-qtd"></colgroup>
          <thead><tr><th>Peça</th><th>Tamanho</th><th class="num">Quantidade</th></tr></thead>
          <tbody data-dep-itens></tbody>
        </table>
      </div>
      <footer class="g-employee-footer mov-rodape ecn-rodape dep-rodape" data-dep-rodape></footer>`;
    $('[data-dep-voltar]', caixa).addEventListener('click', () => { aberto = null; desenhar(); });
    $('[data-dep-peca]', caixa).addEventListener('click', () => abrirPeca());
    $('[data-dep-busca]', caixa).addEventListener('input', (e) => { busca = e.target.value; pagina = 1; linhas(); });
    $('[data-dep-rodape]', caixa).addEventListener('click', (e) => {
      const b = e.target.closest('[data-dep-pagina]');
      if (b && !b.disabled) { pagina = Number(b.dataset.depPagina); linhas(); }
    });
    $('[data-dep-itens]', caixa).addEventListener('click', (e) => {
      const b = e.target.closest('[data-dep-somar]');
      if (b && !b.disabled) somar(b.dataset.depId, Number(b.dataset.depSomar), b);
    });
    linhas();
  }

  function linhas() {
    const corpo = raiz && $('[data-dep-itens]', raiz);
    if (!corpo) return;
    const q = semAcento(busca.trim());
    const lista = doDeposito(aberto)
      .filter((x) => !q || semAcento(`${x.peca} ${x.tamanho}`).includes(q))
      .sort((a, b) => a.peca.localeCompare(b.peca, 'pt-BR') || pesoTam(a.tamanho) - pesoTam(b.tamanho) || a.tamanho.localeCompare(b.tamanho, 'pt-BR', { numeric: true }));
    const tot = doDeposito(aberto), pecas = new Set(tot.map((x) => x.peca));
    $('[data-dep-resumo]', raiz).textContent = `${num(total(aberto))} peças · ${num(pecas.size)} ${pecas.size === 1 ? 'tipo de peça' : 'tipos de peça'}`;
    const pode = P('uniformes.ajustar');
    // Páginas de ${POR_PAGINA} linhas; peça que continua na página seguinte repete o nome.
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    if (pagina > paginas) pagina = paginas;
    const daPagina = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    let anterior = '';
    corpo.innerHTML = daPagina.length ? daPagina.map((x) => {
      const nova = x.peca !== anterior; anterior = x.peca;
      const subtotal = nova ? lista.filter((y) => y.peca === x.peca).reduce((s, y) => s + y.quantidade, 0) : 0;
      return `<tr class="${nova ? 'dep-nova-peca' : ''}${x.quantidade === 0 ? ' dep-zerado' : ''}">
        <td>${nova ? `<b>${esc(x.peca)}</b>${x.ca ? `<small>C.A. ${esc(x.ca)}</small>` : ''}<small>${num(subtotal)} no total</small>` : ''}</td>
        <td>${esc(x.tamanho || '—')}</td>
        <td class="num"><span class="dep-qtd">${pode ? `<button type="button" class="dep-qtd__btn" data-dep-somar="-1" data-dep-id="${esc(x.id)}" aria-label="Tirar uma peça"${x.quantidade <= 0 ? ' disabled' : ''}><i data-lucide="minus"></i></button>` : ''}<strong data-dep-valor="${esc(x.id)}">${num(x.quantidade)}</strong>${pode ? `<button type="button" class="dep-qtd__btn" data-dep-somar="1" data-dep-id="${esc(x.id)}" aria-label="Pôr uma peça"><i data-lucide="plus"></i></button>` : ''}</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="3" class="ecn-vazio">${busca ? 'Nenhuma peça encontrada.' : 'Nenhuma peça nesta sala ainda.'}</td></tr>`;
    let ini = Math.max(1, pagina - 2); const fim = Math.min(paginas, ini + 4); ini = Math.max(1, fim - 4);
    let nums = '';
    for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === pagina ? ' is-current' : ''}" data-dep-pagina="${p}"${p === pagina ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
    $('[data-dep-rodape]', raiz).innerHTML = `<span class="g-employee-count">Exibindo ${num(daPagina.length)} de ${num(lista.length)} ${lista.length === 1 ? 'linha' : 'linhas'}</span>` + (paginas > 1 ? `<nav class="g-employee-pagination" aria-label="Páginas">
      <button type="button" class="g-employee-page" data-dep-pagina="${pagina - 1}"${pagina <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${nums}
      <button type="button" class="g-employee-page" data-dep-pagina="${pagina + 1}"${pagina >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button></nav>` : '');
    icons();
  }

  // − e +: mostra na hora e grava no banco (a soma é feita lá).
  async function somar(id, delta, botao) {
    const item = itens.find((x) => x.id === id);
    if (!item || (delta < 0 && item.quantidade <= 0)) return;
    const antes = item.quantidade;
    item.quantidade = Math.max(0, antes + delta);
    linhas();
    const { data, error } = await db().rpc('deposito_item_somar', { p_id: id, p_delta: delta });
    if (error) { item.quantidade = antes; linhas(); alert('Não foi possível salvar: ' + error.message); return; }
    if (typeof data === 'number' && data !== item.quantidade) { item.quantidade = data; linhas(); }
  }

  function vazio(titulo, texto) {
    return `<div class="dep-vazio">
      <span class="dep-vazio__ic" aria-hidden="true"><i data-lucide="map-pin"></i></span>
      <h3>${esc(titulo)}</h3>
      <p>${esc(texto)}</p>
    </div>`;
  }

  // ---- Janelas (identidade aço da Entrada no estoque) ----
  function criarJanela(id, titulo, icone, campos, salvarTxt, aoSalvar) {
    let m = document.getElementById(id);
    if (m) m.remove();
    m = document.createElement('div');
    m.className = 'data-edit-modal hidden dep-modal';
    m.id = id;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', id + 'Titulo');
    m.innerHTML = `
      <div class="data-edit-card dep-janela">
        <button class="data-edit-close" type="button" aria-label="Fechar" data-dep-fechar><i data-lucide="x" aria-hidden="true"></i></button>
        <div class="data-edit-head">
          <div class="data-edit-icon"><i data-lucide="${icone}" aria-hidden="true"></i></div>
          <div><h3 id="${id}Titulo">${esc(titulo)}</h3><p>Campos com * são obrigatórios.</p></div>
        </div>
        <div class="data-edit-body">
          <div class="data-edit-grid">${campos}</div>
          <div class="data-edit-actions">
            <button class="btn" type="button" data-dep-fechar>Cancelar</button>
            <button class="btn primary" type="button" data-dep-salvar><i data-lucide="save" aria-hidden="true"></i>${esc(salvarTxt)}</button>
          </div>
          <div class="msg" data-dep-msg></div>
        </div>
      </div>`;
    document.body.appendChild(m);
    const fechar = () => { m.classList.add('hidden'); setTimeout(() => m.remove(), 50); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-dep-fechar]')) fechar(); });
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); fechar(); }
      if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); aoSalvar(m, fechar); }
    });
    $('[data-dep-salvar]', m).addEventListener('click', () => aoSalvar(m, fechar));
    m.classList.remove('hidden');
    icons();
    setTimeout(() => m.querySelector('input')?.focus(), 30);
    return m;
  }

  function abrirJanela() {
    if (!P('uniformes.cadastrar')) return;
    criarJanela('depositoModal', 'Adicionar depósito', 'warehouse', `
      <div class="field dep-col-cheia"><label for="depNome">Nome do depósito*</label><input id="depNome" maxlength="80" placeholder="Ex.: Matriz" autocomplete="off"></div>
      <div class="field"><label for="depCidade">Cidade</label><input id="depCidade" maxlength="80" placeholder="Opcional" autocomplete="off"></div>
      <div class="field"><label for="depResp">Responsável</label><input id="depResp" maxlength="80" placeholder="Opcional" autocomplete="off"></div>
      <div class="field dep-col-cheia"><label for="depEndereco">Endereço</label><input id="depEndereco" maxlength="160" placeholder="Opcional" autocomplete="off"></div>
      <div class="field dep-col-cheia"><label for="depObs">Observação</label><input id="depObs" maxlength="200" placeholder="Opcional" autocomplete="off"></div>`,
    'Salvar depósito', async (m, fechar) => {
      const msg = $('[data-dep-msg]', m), v = (id) => document.getElementById(id).value.trim();
      const nome = v('depNome');
      if (!nome) { msg.textContent = 'Informe o nome do depósito.'; return; }
      if (depositos.some((d) => d.nome.trim().toLowerCase() === nome.toLowerCase())) { msg.textContent = 'Já existe um depósito com esse nome.'; return; }
      msg.textContent = 'Salvando…';
      const { error } = await db().from('depositos').insert({ nome, cidade: v('depCidade') || null, responsavel: v('depResp') || null, endereco: v('depEndereco') || null, observacao: v('depObs') || null });
      if (error) { msg.textContent = error.code === '23505' ? 'Já existe um depósito com esse nome.' : 'Não foi possível salvar: ' + error.message; return; }
      fechar();
      carregar();
    });
  }

  function abrirPeca() {
    if (!P('uniformes.cadastrar') || !aberto) return;
    const pecas = [...new Set(itens.map((x) => x.peca))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    criarJanela('depPecaModal', 'Adicionar peça', 'shirt', `
      <div class="field dep-col-cheia"><label for="depPecaNome">Peça*</label><input id="depPecaNome" list="depPecaLista" maxlength="120" placeholder="Ex.: Calça Jeans Indigo Leslie" autocomplete="off"><datalist id="depPecaLista">${pecas.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
      <div class="field"><label for="depPecaTam">Tamanho</label><input id="depPecaTam" maxlength="30" placeholder="Ex.: 44, M, GG" autocomplete="off"></div>
      <div class="field"><label for="depPecaQtd">Quantidade*</label><input id="depPecaQtd" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></div>`,
    'Salvar peça', async (m, fechar) => {
      const msg = $('[data-dep-msg]', m);
      const peca = document.getElementById('depPecaNome').value.trim();
      const tamanho = document.getElementById('depPecaTam').value.trim();
      const qtd = Number(document.getElementById('depPecaQtd').value);
      if (!peca) { msg.textContent = 'Informe a peça.'; return; }
      if (!Number.isInteger(qtd) || qtd < 0) { msg.textContent = 'Informe a quantidade (número inteiro).'; return; }
      const igual = doDeposito(aberto).find((x) => x.peca.trim().toLowerCase() === peca.toLowerCase() && x.tamanho.trim().toLowerCase() === tamanho.toLowerCase());
      if (igual) { msg.textContent = `Essa peça e tamanho já estão nesta sala (${num(igual.quantidade)}). Use − e + na tabela.`; return; }
      msg.textContent = 'Salvando…';
      const { error } = await db().from('deposito_itens').insert({ deposito_id: aberto, peca, tamanho, quantidade: qtd });
      if (error) { msg.textContent = error.code === '23505' ? 'Essa peça e tamanho já estão nesta sala.' : 'Não foi possível salvar: ' + error.message; return; }
      fechar();
      carregar();
    });
  }

  window.EPI_PALCO_UNIDADE = { montar, atualizar() { if (raiz?.isConnected) carregar(); } };
})();
