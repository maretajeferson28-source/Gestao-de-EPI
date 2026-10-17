(() => {
  'use strict';

  // Página "Base CIEPI": cadastro dos códigos internos (CI-0001…) com o boletim
  // técnico em PDF. O prontuário consulta essa tabela em lookupEpiVariantCi (app.js).
  if (window.__EPI_CIEPI__) return;
  window.__EPI_CIEPI__ = true;

  const $ = (id) => document.getElementById(id);
  const BUCKET = 'ciepi-boletins';
  const FIELDS = {
    nome: 'ciepiNome', fabricante: 'ciepiFabricante', referencia: 'ciepiReferencia',
    peso: 'ciepiPeso', material: 'ciepiMaterial', data_validade: 'ciepiValidade',
    vida_util: 'ciepiVidaUtil', norma: 'ciepiNorma', descricao: 'ciepiDescricao',
    dimensoes: 'ciepiDimensoes', utilizacao: 'ciepiUtilizacao'
  };

  let rows = [];
  let editing = null;
  let pendingFile = null;
  let removeFile = false;

  function db() { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } }
  function isAdmin() { try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; } catch (_) { return false; } }
  function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function brDate(iso) { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : '—'; }
  function icons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); }
  function safeName(name) { return String(name || 'boletim.pdf').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80); }

  function setMsg(text, isError = false) {
    $('ciepiMsg').textContent = text;
    $('ciepiMsg').classList.toggle('is-error', isError);
  }

  function render() {
    const body = $('ciepiBody');
    if (!body) return;
    const q = norm($('ciepiSearch').value.trim());
    const list = q ? rows.filter((r) => norm(`${r.ci} ${r.nome} ${r.fabricante || ''} ${r.referencia || ''}`).includes(q)) : rows;
    if (!rows.length) { body.innerHTML = '<tr><td colspan="7">Nenhum C.I. cadastrado ainda. Clique em "Novo C.I.".</td></tr>'; return; }
    if (!list.length) { body.innerHTML = '<tr><td colspan="7">Nada encontrado para essa busca.</td></tr>'; return; }
    body.innerHTML = list.map((r) => `
      <tr>
        <td><strong class="ciepi-code">${escHtml(r.ci)}</strong></td>
        <td>${escHtml(r.nome)}</td>
        <td>${escHtml(r.fabricante || '—')}</td>
        <td>${escHtml(r.referencia || '—')}</td>
        <td>${brDate(r.data_validade)}</td>
        <td>${r.boletim_path ? `<button class="btn compact" type="button" data-ciepi-pdf="${escHtml(r.id)}"><i data-lucide="file-text" aria-hidden="true"></i>Abrir</button>` : '<span class="ciepi-muted">—</span>'}</td>
        <td class="ciepi-actions">
          <button class="btn compact" type="button" data-ciepi-edit="${escHtml(r.id)}" title="Editar" aria-label="Editar ${escHtml(r.ci)}"><i data-lucide="pencil" aria-hidden="true"></i></button>
          <button class="btn compact danger" type="button" data-ciepi-del="${escHtml(r.id)}" title="Excluir" aria-label="Excluir ${escHtml(r.ci)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
        </td>
      </tr>`).join('');
    icons();
  }

  async function load() {
    const client = db();
    if (!client || !isAdmin()) return;
    const { data, error } = await client.from('ciepi_registros').select('*').order('ci');
    if (error) {
      $('ciepiBody').innerHTML = `<tr><td colspan="7">Não foi possível carregar: ${escHtml(error.message)}</td></tr>`;
      return;
    }
    rows = data || [];
    render();
  }

  function showFileName() {
    const name = pendingFile ? pendingFile.name : (!removeFile && editing?.boletim_nome) || '';
    $('ciepiBoletimNome').textContent = name || 'Nenhum arquivo.';
    $('ciepiBoletimRemover').hidden = !name;
  }

  function open(row = null) {
    if (!isAdmin()) return;
    editing = row;
    pendingFile = null;
    removeFile = false;
    $('ciepiBoletim').value = '';
    $('ciepiTitle').textContent = row ? `Editar ${row.ci}` : 'Novo C.I.';
    $('ciepiSubtitle').textContent = row ? 'Campos com * são obrigatórios.' : 'O código é gerado sozinho ao salvar. Campos com * são obrigatórios.';
    for (const [col, id] of Object.entries(FIELDS)) $(id).value = row?.[col] ? String(row[col]).slice(0, col === 'data_validade' ? 10 : undefined) : '';
    showFileName();
    setMsg('');
    $('ciepiModal').classList.remove('hidden');
    icons();
    setTimeout(() => $('ciepiNome').focus(), 50);
  }

  function close() { $('ciepiModal').classList.add('hidden'); editing = null; pendingFile = null; }

  async function save() {
    if (!isAdmin()) return;
    const client = db();
    const payload = {};
    for (const [col, id] of Object.entries(FIELDS)) payload[col] = $(id).value.trim() || null;
    if (!payload.nome) return setMsg('Informe o nome do item.', true);
    payload.updated_at = new Date().toISOString();

    const button = $('ciepiSave');
    button.disabled = true;
    setMsg('Salvando…');
    try {
      const result = editing
        ? await client.from('ciepi_registros').update(payload).eq('id', editing.id).select('*').single()
        : await client.from('ciepi_registros').insert(payload).select('*').single();
      if (result.error) throw result.error;
      let saved = result.data;

      const oldPath = editing?.boletim_path || null;
      if (pendingFile) {
        const path = `${saved.ci}/${Date.now()}-${safeName(pendingFile.name)}`;
        const up = await client.storage.from(BUCKET).upload(path, pendingFile, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw new Error(`${saved.ci} salvo, mas o PDF não subiu: ${up.error.message}`);
        const upd = await client.from('ciepi_registros').update({ boletim_path: path, boletim_nome: pendingFile.name }).eq('id', saved.id).select('*').single();
        if (upd.error) throw upd.error;
        saved = upd.data;
        if (oldPath) await client.storage.from(BUCKET).remove([oldPath]);
      } else if (removeFile && oldPath) {
        const upd = await client.from('ciepi_registros').update({ boletim_path: null, boletim_nome: null }).eq('id', saved.id).select('*').single();
        if (upd.error) throw upd.error;
        saved = upd.data;
        await client.storage.from(BUCKET).remove([oldPath]);
      }

      const wasNew = !editing;
      close();
      await load();
      if (wasNew) alert(`Cadastrado com o código ${saved.ci}.`);
    } catch (err) {
      console.error('[CIEPI]', err);
      setMsg('Não foi possível salvar: ' + (err.message || err), true);
      await load();
    } finally {
      button.disabled = false;
    }
  }

  async function openPdf(id) {
    const row = rows.find((r) => r.id === id);
    if (!row?.boletim_path) return;
    // Abre a aba antes do await para o navegador não bloquear como pop-up.
    const win = window.open('', '_blank');
    const { data, error } = await db().storage.from(BUCKET).createSignedUrl(row.boletim_path, 600);
    if (error || !data?.signedUrl) { win?.close(); alert('Não foi possível abrir o boletim: ' + (error?.message || 'link indisponível')); return; }
    if (win) win.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  }

  async function remove(id) {
    const row = rows.find((r) => r.id === id);
    if (!row || !confirm(`Excluir ${row.ci} (${row.nome}) da Base CIEPI?\nOs prontuários que já usaram esse código não mudam.`)) return;
    const { error } = await db().from('ciepi_registros').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir: ' + error.message); return; }
    if (row.boletim_path) await db().storage.from(BUCKET).remove([row.boletim_path]);
    await load();
  }

  function start() {
    if (!$('ciepiModal')) return;
    document.querySelector('.nav [data-page="ciepi"]')?.addEventListener('click', load);
    window.addEventListener('epi:data-loaded', () => {
      if (document.querySelector('[data-page-content="ciepi"]')?.classList.contains('active')) load();
    });
    $('ciepiNew').addEventListener('click', () => open());
    $('ciepiSearch').addEventListener('input', render);
    $('ciepiClose').addEventListener('click', close);
    $('ciepiCancel').addEventListener('click', close);
    $('ciepiSave').addEventListener('click', save);
    $('ciepiModal').addEventListener('click', (e) => { if (e.target === $('ciepiModal')) close(); });
    $('ciepiModal').addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    $('ciepiBoletim').addEventListener('change', () => {
      const file = $('ciepiBoletim').files?.[0] || null;
      if (file && file.type !== 'application/pdf') { setMsg('O boletim precisa ser um PDF.', true); $('ciepiBoletim').value = ''; return; }
      if (file && file.size > 10 * 1024 * 1024) { setMsg('O PDF passa de 10 MB.', true); $('ciepiBoletim').value = ''; return; }
      pendingFile = file;
      removeFile = false;
      setMsg('');
      showFileName();
    });
    $('ciepiBoletimRemover').addEventListener('click', () => { pendingFile = null; removeFile = true; $('ciepiBoletim').value = ''; showFileName(); });
    $('ciepiBody').addEventListener('click', (e) => {
      const pdf = e.target.closest('[data-ciepi-pdf]');
      const edit = e.target.closest('[data-ciepi-edit]');
      const del = e.target.closest('[data-ciepi-del]');
      if (pdf) openPdf(pdf.dataset.ciepiPdf);
      if (edit) open(rows.find((r) => r.id === edit.dataset.ciepiEdit) || null);
      if (del) remove(del.dataset.ciepiDel);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
