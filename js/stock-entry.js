(() => {
  'use strict';

  // Entrada no estoque sem nota fiscal: abre pelo botão "Cadastro" da página
  // Estoque (stock-nav.js dispara epi:stock-register-request) e grava em
  // estoque_entradas_manuais, que o epi_stock_summary soma junto com as notas.
  if (window.__EPI_STOCK_ENTRY__) return;
  window.__EPI_STOCK_ENTRY__ = true;

  const $ = (id) => document.getElementById(id);
  const MOTIVOS = {
    saldo_inicial: 'Saldo inicial',
    compra_sem_nota: 'Compra sem nota',
    devolucao: 'Devolução ao estoque',
    doacao_transferencia: 'Doação / transferência'
  };

  function db() { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } }
  function isAdmin() { try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; } catch (_) { return false; } }
  function catalog() { try { return Array.isArray(epiCatalog) ? epiCatalog : []; } catch (_) { return []; } }
  function variants() { try { return Array.isArray(epiVariants) ? epiVariants : []; } catch (_) { return []; } }
  function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
  function today() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  function brDate(iso) { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; }
  function fmtQtd(n) { return new Intl.NumberFormat('pt-BR').format(Number(n) || 0); }
  function icons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); }

  let msgTimer = null;
  function setMsg(text, isError = false) {
    const el = $('stockEntryMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', isError);
    clearTimeout(msgTimer);
    if (text && !isError && !/^(Editando|O C\.A\.|Salvando)/.test(text)) {
      msgTimer = setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 6000);
    }
  }

  function activeEpis() { return catalog().filter((e) => e.ativo !== false); }

  function selectedEpi() {
    const nome = norm($('stockEntryEpi').value);
    return nome ? activeEpis().find((e) => norm(e.nome) === nome) || null : null;
  }

  // Estoque mínimo de cada EPI (epis.estoque_minimo); null = sem mínimo.
  let minimos = {};
  async function loadMinimos() {
    const client = db();
    if (!client) return;
    const { data, error } = await client.from('epis').select('id,estoque_minimo');
    if (error) { console.error('[Estoque] Falha ao carregar mínimos', error); return; }
    minimos = Object.fromEntries((data || []).map((e) => [e.id, e.estoque_minimo == null ? null : Number(e.estoque_minimo)]));
    fillMinimo();
  }
  function fillMinimo() {
    const epi = selectedEpi();
    const min = epi ? minimos[epi.id] : null;
    $('stockEntryMin').value = min == null ? '' : String(min);
    $('stockEntryMin').disabled = !epi;
  }

  function fillCaOptions() {
    fillMinimo();
    const select = $('stockEntryCa');
    const epi = selectedEpi();
    const list = epi ? variants().filter((v) => v.epi_id === epi.id && v.ativo !== false) : [];
    select.innerHTML = '<option value="">Sem C.A. definido</option>' +
      list.map((v) => `<option value="${escHtml(v.id)}">C.A. ${escHtml(v.ca)}${v.marca ? ' • ' + escHtml(v.marca) : ''}</option>`).join('');
    select.disabled = !epi || !list.length;
    if (list.length === 1) select.value = list[0].id;
  }

  let recentes = [];
  let editandoId = null; // entrada da lista que está sendo alterada
  let itemFixo = null; // aberto pelo cartão do Estoque: { id, nome } do EPI

  function atualizarFormItem() {
    const travado = !!itemFixo && !caDoItem;
    ['stockEntryQtd', 'stockEntryMenos', 'stockEntryMais', 'stockEntryData', 'stockEntryObs', 'stockEntrySave'].forEach((id) => { if ($(id)) $(id).disabled = travado; });
    $('stockEntryModal').classList.toggle('aguardando-ca', travado);
  }

  function sairEdicao() {
    editandoId = null;
    $('stockEntrySave').innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Salvar entrada';
    $('stockEntryCancel').textContent = 'Cancelar';
    caDoItem = null;
    const sel = $('stockEntryCa');
    if (sel) sel.disabled = !selectedEpi() || sel.options.length <= 1;
    document.querySelectorAll('.stock-entry-row.is-editando, .stock-ca-card.is-editando').forEach((r) => r.classList.remove('is-editando'));
    atualizarFormItem();
    icons();
  }

  function editar(id) {
    const r = recentes.find((x) => x.id === id);
    if (!r) return;
    editandoId = id;
    $('stockEntryEpi').value = r.epis?.nome || '';
    fillCaOptions();
    $('stockEntryCa').value = r.variante_id || '';
    $('stockEntryQtd').value = r.quantidade;
    $('stockEntryMotivo').value = r.motivo;
    $('stockEntryData').value = String(r.data || '').slice(0, 10);
    $('stockEntryObs').value = r.observacao || '';
    $('stockEntrySave').innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Salvar alteração';
    $('stockEntryCancel').textContent = 'Cancelar edição';
    $('stockEntryCa').disabled = !!itemFixo;
    if (itemFixo) { caDoItem = r.variante_id || ''; atualizarFormItem(); }
    document.querySelectorAll('.stock-entry-row').forEach((row) => row.classList.toggle('is-editando', row.dataset.id === id));
    setMsg(itemFixo
      ? `Editando ${r.ca ? 'C.A. ' + r.ca : 'a entrada sem C.A.'}: ${fmtQtd(r.quantidade)} lançado sem nota. Use − e + (ou digite) e salve.`
      : `Editando: ${fmtQtd(r.quantidade)} × ${r.epis?.nome || 'EPI'}. Altere e clique em Salvar alteração.`);
    icons();
    document.querySelector('.stock-entry-card')?.scrollTo({ top: 0, behavior: 'smooth' });
    $('stockEntryQtd').focus();
  }

  // Janela do item: o formulário abre vazio (entrada nova). O lápis de um
  // cartão de C.A. abre a entrada sem nota mais recente desse C.A. para somar
  // ou tirar itens; o total do EPI no topo é a soma dos C.A. e se atualiza ao salvar.
  let caDoItem = null; // id da variante em edição pelo lápis

  function marcarCardCa() {
    document.querySelectorAll('.stock-ca-card').forEach((c) =>
      c.classList.toggle('is-editando', !!itemFixo && !!caDoItem && c.dataset.var === caDoItem));
  }

  function editarCa(varId) {
    if (!itemFixo) return;
    const v = variants().find((x) => x.id === varId);
    const r = recentes.find((x) => x.variante_id === varId);
    if (r) {
      editar(r.id);
    } else {
      sairEdicao();
      fillCaOptions();
      $('stockEntryCa').value = varId;
      $('stockEntryQtd').value = '';
      $('stockEntryObs').value = '';
      $('stockEntryMotivo').value = 'saldo_inicial';
      $('stockEntryData').value = today();
      setMsg(`O C.A. ${v?.ca || ''} ainda não tem entrada sem nota. Informe a quantidade e salve para lançar.`);
      document.querySelector('.stock-entry-card')?.scrollTo({ top: 0, behavior: 'smooth' });
      $('stockEntryQtd').focus();
    }
    caDoItem = varId;
    marcarCardCa();
    atualizarFormItem();
  }

  function resetItemFields() {
    $('stockEntryEpi').value = itemFixo ? itemFixo.nome : '';
    $('stockEntryQtd').value = '';
    $('stockEntryObs').value = '';
    fillCaOptions();
  }

  // Janela do item: um cartãozinho por C.A./C.I. com a foto do prontuário,
  // o nome, o código e o saldo daquele C.A. (epi_stock_por_ca).
  let casPedido = 0;
  async function renderCas() {
    const box = $('stockEntryCas');
    if (!box) return;
    const pedido = ++casPedido;
    if (!itemFixo) { box.hidden = true; box.innerHTML = ''; return; }
    const epi = itemFixo;
    const norm = (c) => { const t = String(c || '').trim(); if (!t) return ''; return /^CI-/i.test(t) ? t.toUpperCase() : t.replace(/\D+/g, ''); };
    // Todos os C.A. do EPI, inclusive os desativados (aparecem apagados, no fim).
    const vars = variants().filter((v) => v.epi_id === epi.id);
    const { data, error } = await db().rpc('epi_stock_por_ca', { p_epi: epi.id });
    if (pedido !== casPedido) return;
    if (error) console.error('[Estoque] Falha ao carregar o saldo por C.A.', error);
    const saldos = new Map((data || []).map((r) => [r.ca || '', Number(r.saldo) || 0]));
    // Todos os C.A. ativos do prontuário, mais os que só aparecem nas movimentações.
    const inativo = (c) => { const v = vars.find((x) => norm(x.ca) === c); return !!v && v.ativo === false; };
    const codigos = [...new Set([...vars.map((v) => norm(v.ca)), ...saldos.keys()])]
      .sort((a, b) => inativo(a) - inativo(b));
    const total = [...saldos.values()].reduce((a, b) => a + b, 0);
    const tot = $('stockEntryTotal');
    if (tot) {
      const min = minimos[epi.id];
      tot.hidden = false;
      const editando = document.activeElement?.id === 'stockItemMin';
      if (!editando) tot.innerHTML = `<span class="stock-tot-num"><strong>${fmtQtd(total)}</strong> em estoque</span><span class="stock-tot-sep">·</span><label class="stock-tot-min" for="stockItemMin">mínimo <input id="stockItemMin" type="number" inputmode="decimal" min="0" step="any" placeholder="sem" value="${min == null ? '' : escHtml(min)}"></label><button class="stock-tot-salvar" id="stockItemMinSalvar" type="button" hidden>Salvar mínimo</button>`;
      else tot.querySelector('.stock-tot-num').innerHTML = `<strong>${fmtQtd(total)}</strong> em estoque`;
      tot.classList.toggle('is-critico', total <= 0);
      tot.classList.toggle('is-baixo', total > 0 && min != null && total <= min);
    }
    if (!codigos.length) { box.hidden = true; box.innerHTML = ''; return; }
    const ci = (c) => /^CI-/i.test(c);
    const todosCi = codigos.filter(Boolean).every(ci) && codigos.some(Boolean);
    const cards = codigos.map((c) => {
      const v = vars.find((x) => norm(x.ca) === c && x.ativo !== false) || vars.find((x) => norm(x.ca) === c);
      const off = v?.ativo === false;
      const saldo = saldos.get(c) || 0;
      const codigo = !c ? 'Sem C.A.' : ci(c) ? c : 'C.A. ' + c;
      // Nome do cartão: o fornecedor do prontuário desse C.A. (senão o
      // fabricante e, por último, o nome do EPI). A marca do CAEPI costuma
      // vir como "Na etiqueta", por isso fica de fora.
      const fornecedor = [v?.fornecedor, v?.fabricante].map((x) => String(x || '').trim()).find(Boolean) || '';
      // Apelido do prontuário em destaque; sem apelido, o fornecedor (e por último o nome do EPI).
      const apelido = String(v?.apelido || '').trim();
      const modelo = apelido || fornecedor || epi.nome;
      // Lápis: edita a quantidade lançada sem nota desse C.A. Liga/desliga:
      // desativa ou reativa o C.A. (o prontuário se edita em EPIs / Itens).
      return `<article class="stock-ca-card${saldo <= 0 ? ' is-zerado' : ''}${off ? ' is-inativo' : ''}"${v && !off ? ` data-var="${escHtml(v.id)}"` : ''}>
        ${off ? '<span class="stock-ca-inativo">Inativo</span>' : ''}
        ${v && !off ? `<button class="stock-entry-del stock-entry-edit stock-ca-editar" type="button" data-ca-edit="${escHtml(v.id)}" title="Editar quantidade do ${escHtml(codigo)}" aria-label="Editar quantidade do ${escHtml(codigo)}"><i data-lucide="pencil" aria-hidden="true"></i></button>` : ''}
        <div class="stock-ca-foto"${v?.imagem_path ? ` data-foto="${escHtml(v.imagem_path)}"` : ''}><i data-lucide="image" aria-hidden="true"></i></div>
        <strong class="stock-ca-nome" title="${escHtml(modelo)}">${escHtml(modelo)}</strong>        <span class="stock-ca-codigo">${escHtml(codigo)}</span>
        <span class="stock-ca-saldo">${fmtQtd(saldo)}<small>em estoque</small></span>
        ${v ? `<button class="stock-entry-del stock-ca-ativo${off ? ' is-off' : ''}" type="button" data-ca-ativo="${escHtml(v.id)}" title="${off ? 'Reativar' : 'Desativar'} ${escHtml(codigo)}" aria-label="${off ? 'Reativar' : 'Desativar'} ${escHtml(codigo)}"><i data-lucide="${off ? 'power' : 'power-off'}" aria-hidden="true"></i></button>` : ''}
      </article>`;
    }).join('');
    box.hidden = false;
    box.innerHTML = `<h4>${todosCi ? 'C.I.' : 'C.A.'} deste EPI</h4><div class="stock-ca-grade">${cards}</div>`;
    icons();
    marcarCardCa();
    // Fotos do prontuário (URL assinada, a mesma função do app).
    box.querySelectorAll('[data-foto]').forEach(async (el) => {
      try {
        const url = typeof variantImageUrl === 'function' ? await variantImageUrl(el.dataset.foto) : null;
        if (url && pedido === casPedido) el.innerHTML = `<img src="${escHtml(url)}" alt="" loading="lazy">`;
      } catch (_) { /* fica o ícone */ }
    });
  }

  // Desativa / reativa um C.A. do prontuário (epi_variantes.ativo). Nada é
  // apagado: foto, prontuário e histórico continuam. Sem confirmação, porque
  // o mesmo botão desfaz.
  async function alternarAtivo(id, btn) {
    if (!isAdmin()) return;
    const v = variants().find((x) => x.id === id);
    if (!v) return;
    const desativar = v.ativo !== false;
    const nome = (/^\s*CI-/i.test(String(v.ca || '')) ? '' : 'C.A. ') + v.ca;
    btn.disabled = true;
    const { error } = await db().from('epi_variantes').update({ ativo: !desativar }).eq('id', id);
    btn.disabled = false;
    if (error) return setMsg('Não foi possível ' + (desativar ? 'desativar' : 'reativar') + ': ' + error.message, true);
    v.ativo = !desativar;
    setMsg(`${nome} ${desativar ? 'desativado' : 'reativado'}.`);
    fillCaOptions();
    try { if (typeof renderEpis === 'function') renderEpis(); } catch (_) { /* tela de EPIs fechada */ }
    try { if (typeof renderEpiVariantList === 'function') renderEpiVariantList(); } catch (_) { /* idem */ }
    renderCas();
  }

  async function loadRecent() {
    const box = $('stockEntryList');
    const client = db();
    if (!box || !client) return;
    let query = client.from('estoque_entradas_manuais')
      .select('id,epi_id,variante_id,quantidade,motivo,data,ca,observacao,epis(nome)')
      .order('created_at', { ascending: false });
    query = itemFixo ? query.eq('epi_id', itemFixo.id).limit(30) : query.limit(8);
    const { data, error } = await query;
    recentes = error ? [] : (data || []);
    renderCas();
    if (error) {
      box.innerHTML = `<p class="stock-entry-empty">Não foi possível carregar: ${escHtml(error.message)}</p>`;
      return;
    }
    if (!data.length) {
      box.innerHTML = `<p class="stock-entry-empty">${itemFixo ? 'Nenhuma entrada sem nota deste EPI. As entradas por nota fiscal ficam em Notas Fiscais.' : 'Nenhuma entrada sem nota ainda.'}</p>`;
      return;
    }
    box.innerHTML = data.map((r) => `
      <div class="stock-entry-row${r.id === editandoId ? ' is-editando' : ''}" data-id="${escHtml(r.id)}">
        <div class="stock-entry-row-copy">
          <strong>${fmtQtd(r.quantidade)} × ${escHtml(r.epis?.nome || 'EPI removido')}${r.ca ? ` <span>C.A. ${escHtml(r.ca)}</span>` : ''}</strong>
          <small>${escHtml(MOTIVOS[r.motivo] || r.motivo)} • ${brDate(r.data)}${r.observacao ? ' • ' + escHtml(r.observacao) : ''}</small>
        </div>
        <div class="stock-entry-acoes">
          <button class="stock-entry-del stock-entry-edit" type="button" data-stock-entry-edit="${escHtml(r.id)}" title="Editar entrada" aria-label="Editar entrada"><i data-lucide="pencil" aria-hidden="true"></i></button>
          <button class="stock-entry-del" type="button" data-stock-entry-del="${escHtml(r.id)}" title="Excluir entrada" aria-label="Excluir entrada"><i data-lucide="trash-2" aria-hidden="true"></i></button>
        </div>
      </div>`).join('');
    icons();
  }

  // Sem detalhe: Cadastro geral. Com { epiId, nome }: janela daquele EPI
  // (vinda do clique no cartão do Estoque), com o EPI fixo e só as entradas dele.
  function open(e) {
    if (!isAdmin()) return;
    const det = e?.detail;
    itemFixo = det?.epiId ? { id: det.epiId, nome: det.nome || '' } : null;
    caDoItem = null;
    $('stockEntryTitle').textContent = itemFixo ? itemFixo.nome : 'Entrada no estoque';
    const sub = document.querySelector('#stockEntryModal .data-edit-head p');
    if (sub) sub.textContent = itemFixo
      ? 'Use o lápis de um C.A. para somar ou tirar itens do que já está no depósito.'
      : 'Para itens que entram sem nota fiscal. Campos com * são obrigatórios.';
    const h4 = document.querySelector('#stockEntryModal .stock-entry-recent h4');
    if (h4) h4.textContent = itemFixo ? 'Entradas sem nota deste EPI' : 'Últimas entradas sem nota';
    $('stockEntryEpi').readOnly = !!itemFixo;
    $('stockEntryModal').classList.toggle('is-item', !!itemFixo);
    if (!itemFixo) { $('stockEntryTotal').hidden = true; $('stockEntryTotal').innerHTML = ''; }
    // A janela fica só com o formulário: a lista de entradas sem nota não aparece.
    const lista = $('stockEntryList')?.closest('.stock-entry-recent');
    if (lista) lista.hidden = true;
    $('dlStockEntryEpi').innerHTML = activeEpis()
      .map((e) => `<option value="${escHtml(e.nome)}">`).join('');
    sairEdicao();
    resetItemFields();
    $('stockEntryMotivo').value = 'saldo_inicial';
    $('stockEntryData').value = today();
    setMsg('');
    $('stockEntryModal').classList.remove('hidden');
    icons();
    loadRecent();
    loadMinimos();
    setTimeout(() => $(itemFixo ? 'stockEntryQtd' : 'stockEntryEpi').focus(), 50);
  }

  function close() { $('stockEntryModal')?.classList.add('hidden'); }

  async function save() {
    if (!isAdmin()) return;
    const client = db();
    const epi = selectedEpi();
    const qtdTxt = String($('stockEntryQtd').value).trim();
    const qtd = Number(qtdTxt.replace(',', '.'));
    const data = $('stockEntryData').value;
    if (!epi) return setMsg('Escolha um EPI da lista.', true);
    const minTxt = String($('stockEntryMin').value).trim();
    const minimo = minTxt === '' ? null : Number(minTxt.replace(',', '.'));
    if (minimo !== null && (!Number.isFinite(minimo) || minimo < 0)) return setMsg('O estoque mínimo não pode ser negativo.', true);
    const mudouMinimo = minimo !== (minimos[epi.id] ?? null);
    // Só o mínimo: salva sem lançar entrada.
    if (!qtdTxt && !editandoId && mudouMinimo) return salvarMinimo(epi, minimo);
    if (editandoId && qtdTxt !== '' && qtd === 0) return zerar(editandoId, epi, mudouMinimo ? minimo : undefined);
    if (!Number.isFinite(qtd) || qtd <= 0) return setMsg('Informe uma quantidade maior que zero.', true);
    if (!data) return setMsg('Informe a data.', true);

    const varianteId = $('stockEntryCa').value || null;
    const variante = varianteId ? variants().find((v) => v.id === varianteId) : null;
    const button = $('stockEntrySave');
    button.disabled = true;
    setMsg('Salvando…');
    const dados = {
      epi_id: epi.id,
      variante_id: varianteId,
      ca: variante?.ca || null,
      quantidade: qtd,
      motivo: $('stockEntryMotivo').value,
      data,
      observacao: $('stockEntryObs').value.trim() || null
    };
    const alterando = editandoId;
    const antes = alterando ? Number(recentes.find((x) => x.id === alterando)?.quantidade) || 0 : 0;
    const { error } = alterando
      ? await client.from('estoque_entradas_manuais').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', alterando)
      : await client.from('estoque_entradas_manuais').insert(dados);
    button.disabled = false;
    if (error) return setMsg('Não foi possível salvar: ' + error.message, true);
    if (mudouMinimo && !(await gravarMinimo(epi, minimo))) return;

    sairEdicao();
    const codigoCa = variante?.ca ? 'C.A. ' + variante.ca : epi.nome;
    setMsg(alterando
      ? `${codigoCa}: ${fmtQtd(antes)} → ${fmtQtd(qtd)} (${qtd >= antes ? '+' : '−'}${fmtQtd(Math.abs(qtd - antes))}). Total do EPI atualizado.`
      : `Entrada salva: ${fmtQtd(qtd)} × ${epi.nome}.`);
    resetItemFields();
    $(itemFixo ? 'stockEntryQtd' : 'stockEntryEpi').focus();
    window.dispatchEvent(new CustomEvent('epi:stock-changed'));
    loadRecent();
  }

  async function gravarMinimo(epi, minimo) {
    const { error } = await db().from('epis').update({ estoque_minimo: minimo }).eq('id', epi.id);
    if (error) { setMsg('Não foi possível salvar o mínimo: ' + error.message, true); return false; }
    minimos[epi.id] = minimo;
    fillMinimo();
    if (itemFixo) renderCas();
    return true;
  }

  async function salvarMinimo(epi, minimo) {
    const button = $('stockEntrySave');
    button.disabled = true;
    setMsg('Salvando…');
    const ok = await gravarMinimo(epi, minimo);
    button.disabled = false;
    if (!ok) return;
    setMsg(minimo === null ? `Mínimo removido: ${epi.nome}.` : `Mínimo salvo: ${fmtQtd(minimo)} × ${epi.nome}.`);
    resetItemFields();
    $(itemFixo ? 'stockEntryQtd' : 'stockEntryEpi').focus();
    window.dispatchEvent(new CustomEvent('epi:stock-changed'));
  }

  async function zerar(id, epi, minimo) {
    const r = recentes.find((x) => x.id === id);
    const { error } = await db().from('estoque_entradas_manuais').delete().eq('id', id);
    if (error) return setMsg('Não foi possível zerar: ' + error.message, true);
    if (minimo !== undefined && !(await gravarMinimo(epi, minimo))) return;
    sairEdicao();
    resetItemFields();
    setMsg(`${r?.ca ? 'C.A. ' + r.ca : epi.nome}: ${fmtQtd(r?.quantidade)} → 0. Entrada sem nota removida e total do EPI atualizado.`);
    window.dispatchEvent(new CustomEvent('epi:stock-changed'));
    loadRecent();
  }

  // − e +: soma ou tira 1 da quantidade (nunca abaixo de zero).
  function passo(delta) {
    const atual = Number(String($('stockEntryQtd').value).replace(',', '.')) || 0;
    $('stockEntryQtd').value = String(Math.max(0, atual + delta));
    $('stockEntryQtd').focus();
  }

  async function remove(id) {
    if (!isAdmin() || !confirm('Excluir esta entrada? O saldo do estoque será recalculado.')) return;
    const { error } = await db().from('estoque_entradas_manuais').delete().eq('id', id);
    if (error) return setMsg('Não foi possível excluir: ' + error.message, true);
    if (editandoId === id) { sairEdicao(); resetItemFields(); }
    setMsg('Entrada excluída.');
    window.dispatchEvent(new CustomEvent('epi:stock-changed'));
    loadRecent();
  }

  function start() {
    const modal = $('stockEntryModal');
    if (!modal) return;
    window.addEventListener('epi:stock-register-request', open);
    $('stockEntryClose').addEventListener('click', close);
    // Em edição, "Cancelar edição" só sai da edição; senão fecha a janela.
    $('stockEntryCancel').addEventListener('click', () => { if (editandoId || caDoItem) { sairEdicao(); resetItemFields(); setMsg(''); } else close(); });
    $('stockEntryMenos').addEventListener('click', () => passo(-1));
    $('stockEntryMais').addEventListener('click', () => passo(1));
    $('stockEntrySave').addEventListener('click', save);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    $('stockEntryEpi').addEventListener('input', fillCaOptions);
    $('stockEntryEpi').addEventListener('change', fillCaOptions);
    const minTopo = () => {
      const v = String($('stockItemMin')?.value ?? '').trim();
      return v === '' ? null : Number(v.replace(',', '.'));
    };
    const salvarMinTopo = async () => {
      const epi = selectedEpi();
      const minimo = minTopo();
      if (!epi) return;
      if (minimo !== null && (!Number.isFinite(minimo) || minimo < 0)) return setMsg('O estoque mínimo não pode ser negativo.', true);
      $('stockItemMin').blur();
      if (await gravarMinimo(epi, minimo)) {
        setMsg(minimo === null ? 'Mínimo removido.' : `Mínimo salvo: ${fmtQtd(minimo)}.`);
        window.dispatchEvent(new CustomEvent('epi:stock-changed'));
      }
    };
    $('stockEntryTotal').addEventListener('input', (e) => {
      if (e.target.id !== 'stockItemMin') return;
      const epi = selectedEpi();
      $('stockItemMinSalvar').hidden = !epi || minTopo() === (minimos[epi.id] ?? null);
    });
    $('stockEntryTotal').addEventListener('click', (e) => { if (e.target.closest('#stockItemMinSalvar')) salvarMinTopo(); });
    $('stockEntryTotal').addEventListener('keydown', (e) => {
      if (e.target.id === 'stockItemMin' && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); salvarMinTopo(); }
    });
    $('stockEntryCas').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ca-ativo]');
      if (btn) { alternarAtivo(btn.dataset.caAtivo, btn); return; }
      const edit = e.target.closest('[data-ca-edit]');
      if (edit) editarCa(edit.dataset.caEdit);
    });
    $('stockEntryList').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-stock-entry-edit]');
      if (edit) { editar(edit.dataset.stockEntryEdit); return; }
      const btn = e.target.closest('[data-stock-entry-del]');
      if (btn) remove(btn.dataset.stockEntryDel);
    });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
