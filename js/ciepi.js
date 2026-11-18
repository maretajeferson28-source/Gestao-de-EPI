(() => {
  'use strict';

  // Página "Base CIEPI": cadastro dos códigos internos (CI-0001…) com o boletim
  // técnico em PDF. O prontuário consulta essa tabela em lookupEpiVariantCi (app.js).
  if (window.__EPI_CIEPI__) return;
  window.__EPI_CIEPI__ = true;

  const $ = (id) => document.getElementById(id);
  const BUCKET = 'ciepi-boletins';
  const FIELDS = {
    nome: 'ciepiNome', fabricante: 'ciepiFabricante', cnpj: 'ciepiCnpj', marca: 'ciepiMarca',
    referencia: 'ciepiReferencia', data_validade: 'ciepiValidade', situacao: 'ciepiSituacao',
    norma: 'ciepiNorma', descricao: 'ciepiDescricao'
  };

  let rows = [];
  let editing = null;
  let pendingFile = null;
  let removeFile = false;

  function db() { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } }
  const P = (...k) => { try { return typeof window.epiPode === 'function' ? window.epiPode(...k) : currentIsAdmin === true; } catch (_) { return false; } };
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

  // Tabela no padrão de EPIs / Itens: 10 por página, rodapé com páginas.
  const POR_PAGINA = 10;
  let pagina = 1;
  function vencida(iso) { return !!iso && String(iso).slice(0, 10) < new Date().toISOString().slice(0, 10); }
  function render() {
    const body = $('ciepiBody');
    if (!body) return;
    const rod = $('ciepiRodape');
    const q = norm($('ciepiSearch').value.trim());
    const list = q ? rows.filter((r) => norm(`${r.ci} ${r.nome} ${r.fabricante || ''} ${r.referencia || ''}`).includes(q)) : rows;
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="7" class="epi-tab-nada">${rows.length ? 'Nada encontrado para essa busca.' : 'Nenhum C.I. cadastrado ainda. Clique em "Novo C.I.".'}</td></tr>`;
      if (rod) rod.hidden = true;
      return;
    }
    const paginas = Math.max(1, Math.ceil(list.length / POR_PAGINA));
    pagina = Math.min(Math.max(1, pagina), paginas);
    const daPagina = list.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    body.innerHTML = daPagina.map((r) => `
      <tr>
        <td><strong class="ciepi-code">${escHtml(r.ci)}</strong></td>
        <td title="${escHtml(r.nome)}"><span class="epi-tab-nome">${escHtml(r.nome)}</span></td>
        <td title="${escHtml(r.fabricante || '')}">${escHtml(r.fabricante || '—')}</td>
        <td title="${escHtml(r.referencia || '')}">${escHtml(r.referencia || '—')}</td>
        <td${vencida(r.data_validade) ? ' class="ciepi-vencida" title="Validade vencida"' : ''}>${brDate(r.data_validade)}</td>
        <td class="acao">${r.boletim_path ? `<button class="btn movement-action-btn ciepi-pdf" type="button" data-ciepi-pdf="${escHtml(r.id)}" title="Abrir boletim" aria-label="Abrir boletim de ${escHtml(r.ci)}"><i data-lucide="file-text" aria-hidden="true"></i></button>` : '<span class="epi-tab-vazio">—</span>'}</td>
        <td class="acao"><div class="table-action-group">
          <button class="btn movement-action-btn movement-edit-btn" type="button"${P('ciepi.editar') ? '' : ' disabled aria-disabled="true" data-sem-perm'} data-ciepi-edit="${escHtml(r.id)}" title="Editar" aria-label="Editar ${escHtml(r.ci)}"><i data-lucide="pencil" aria-hidden="true"></i></button>
          <button class="btn movement-action-btn movement-delete-btn" type="button"${P('ciepi.excluir') ? '' : ' disabled aria-disabled="true" data-sem-perm'} data-ciepi-del="${escHtml(r.id)}" title="Excluir" aria-label="Excluir ${escHtml(r.ci)}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
        </div></td>
      </tr>`).join('');
    if (rod) {
      rod.hidden = false;
      let ini = Math.max(1, pagina - 2); const fim = Math.min(paginas, ini + 4); ini = Math.max(1, fim - 4);
      let nums = ''; for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === pagina ? ' is-current' : ''}" data-ciepi-pagina="${p}"${p === pagina ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
      rod.innerHTML = `<span class="g-employee-count">Exibindo ${daPagina.length} de ${list.length} ${list.length === 1 ? 'C.I.' : 'C.I.s'}</span>` + (paginas > 1 ? `<nav class="g-employee-pagination" aria-label="Páginas">
        <button type="button" class="g-employee-page" data-ciepi-pagina="${pagina - 1}"${pagina <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${nums}
        <button type="button" class="g-employee-page" data-ciepi-pagina="${pagina + 1}"${pagina >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button></nav>` : '');
    }
    icons();
  }

  async function load() {
    const client = db();
    if (!client || !P('ciepi.consultar')) return;
    const { data, error } = await client.from('ciepi_registros').select('*').order('ci');
    if (error) {
      $('ciepiBody').innerHTML = `<tr><td colspan="7" class="epi-tab-nada">Não foi possível carregar: ${escHtml(error.message)}</td></tr>`;
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
    if (!P(row ? 'ciepi.editar' : 'ciepi.cadastrar')) return;
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
    if (!P(editing ? 'ciepi.editar' : 'ciepi.cadastrar')) return;
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
    if (!P('ciepi.excluir')) return;
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
    $('ciepiSearch').addEventListener('input', () => { pagina = 1; render(); });
    $('ciepiRodape')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ciepi-pagina]'); if (!b || b.disabled) return;
      pagina = Number(b.dataset.ciepiPagina) || 1; render();
    });
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
