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

  function setMsg(text, isError = false) {
    const el = $('stockEntryMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-error', isError);
  }

  function activeEpis() { return catalog().filter((e) => e.ativo !== false); }

  function selectedEpi() {
    const nome = norm($('stockEntryEpi').value);
    return nome ? activeEpis().find((e) => norm(e.nome) === nome) || null : null;
  }

  function fillCaOptions() {
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

  function sairEdicao() {
    editandoId = null;
    $('stockEntrySave').innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Salvar entrada';
    $('stockEntryCancel').textContent = 'Cancelar';
    document.querySelectorAll('.stock-entry-row.is-editando').forEach((r) => r.classList.remove('is-editando'));
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
    document.querySelectorAll('.stock-entry-row').forEach((row) => row.classList.toggle('is-editando', row.dataset.id === id));
    setMsg(`Editando: ${fmtQtd(r.quantidade)} × ${r.epis?.nome || 'EPI'}. Altere e clique em Salvar alteração.`);
    icons();
    document.querySelector('.stock-entry-card')?.scrollTo({ top: 0, behavior: 'smooth' });
    $('stockEntryQtd').focus();
  }

  function resetItemFields() {
    $('stockEntryEpi').value = '';
    $('stockEntryQtd').value = '';
    $('stockEntryObs').value = '';
    fillCaOptions();
  }

  async function loadRecent() {
    const box = $('stockEntryList');
    const client = db();
    if (!box || !client) return;
    const { data, error } = await client.from('estoque_entradas_manuais')
      .select('id,epi_id,variante_id,quantidade,motivo,data,ca,observacao,epis(nome)')
      .order('created_at', { ascending: false })
      .limit(8);
    if (error) {
      box.innerHTML = `<p class="stock-entry-empty">Não foi possível carregar: ${escHtml(error.message)}</p>`;
      return;
    }
    recentes = data || [];
    if (!data.length) {
      box.innerHTML = '<p class="stock-entry-empty">Nenhuma entrada sem nota ainda.</p>';
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

  function open() {
    if (!isAdmin()) return;
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
    setTimeout(() => $('stockEntryEpi').focus(), 50);
  }

  function close() { $('stockEntryModal')?.classList.add('hidden'); }

  async function save() {
    if (!isAdmin()) return;
    const client = db();
    const epi = selectedEpi();
    const qtd = Number(String($('stockEntryQtd').value).replace(',', '.'));
    const data = $('stockEntryData').value;
    if (!epi) return setMsg('Escolha um EPI da lista.', true);
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
    const { error } = alterando
      ? await client.from('estoque_entradas_manuais').update({ ...dados, updated_at: new Date().toISOString() }).eq('id', alterando)
      : await client.from('estoque_entradas_manuais').insert(dados);
    button.disabled = false;
    if (error) return setMsg('Não foi possível salvar: ' + error.message, true);

    sairEdicao();
    setMsg(alterando ? `Entrada alterada: ${fmtQtd(qtd)} × ${epi.nome}.` : `Entrada salva: ${fmtQtd(qtd)} × ${epi.nome}.`);
    resetItemFields();
    $('stockEntryEpi').focus();
    window.dispatchEvent(new CustomEvent('epi:stock-changed'));
    loadRecent();
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
    $('stockEntryCancel').addEventListener('click', () => { if (editandoId) { sairEdicao(); resetItemFields(); setMsg(''); } else close(); });
    $('stockEntrySave').addEventListener('click', save);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    $('stockEntryEpi').addEventListener('input', fillCaOptions);
    $('stockEntryEpi').addEventListener('change', fillCaOptions);
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
