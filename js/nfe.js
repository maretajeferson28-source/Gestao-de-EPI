(() => {
  'use strict';

  if (window.__EPI_NFE_MODULE__) return;
  window.__EPI_NFE_MODULE__ = true;

  const state = { notes: [], selected: -1 };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const numberBR = (value, digits = 4) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits });

  function refreshNfeIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
    }
  }

  function currentUserIsAdmin() {
    try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; }
    catch (_) { return false; }
  }

  function injectUi() {
    const nav = document.querySelector('.nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('[data-page="notas"]')) return false;

    const navButton = document.createElement('button');
    navButton.type = 'button';
    navButton.dataset.page = 'notas';
    navButton.setAttribute('data-admin-only', '');
    navButton.hidden = true;
    navButton.innerHTML = '<span class="ico"><i data-lucide="receipt-text"></i></span><span class="text">Notas Fiscais</span>';

    const epiButton = nav.querySelector('[data-page="epis"]');
    if (epiButton) epiButton.insertAdjacentElement('afterend', navButton);
    else nav.appendChild(navButton);

    const page = document.createElement('section');
    page.className = 'page';
    page.dataset.pageContent = 'notas';
    page.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Notas Fiscais</h2>
          <p>Leitura e conferência de XML de NF-e para preparar entrada de estoque e histórico de preços.</p>
        </div>
        <span class="ca-visual-badge"><i data-lucide="file-check-2"></i> Leitura XML</span>
      </div>

      <div class="nfe-layout">
        <aside class="nfe-panel">
          <h3>Importar NF-e</h3>
          <p>Selecione um ou mais arquivos XML. Nenhum dado será gravado no estoque nesta fase de teste.</p>

          <div class="nfe-dropzone" id="nfeDropzone" tabindex="0" role="button" aria-label="Selecionar XML de nota fiscal">
            <div>
              <div class="nfe-drop-icon"><i data-lucide="file-up"></i></div>
              <strong>Arraste o XML aqui</strong>
              <span>ou selecione o arquivo da NF-e no computador</span>
              <div class="nfe-drop-actions">
                <button class="btn compact" id="nfeSelectBtn" type="button"><i data-lucide="folder-open"></i>Selecionar XML</button>
              </div>
            </div>
          </div>
          <input id="nfeFileInput" type="file" accept=".xml,text/xml,application/xml" multiple hidden>

          <div class="nfe-help">
            <i data-lucide="info"></i>
            <span>O XML é lido localmente no navegador. Primeiro vamos validar os campos com notas reais; depois ligamos os itens ao catálogo, estoque e preços.</span>
          </div>

          <div class="nfe-msg" id="nfeMsg"></div>
          <div class="nfe-file-list" id="nfeFileList"></div>
        </aside>

        <section class="nfe-panel" id="nfeStage">
          <div class="nfe-empty" id="nfeEmpty">
            <div class="nfe-empty-inner">
              <div class="nfe-empty-icon"><i data-lucide="scan-line"></i></div>
              <strong>Aguardando XML</strong>
              <span>Importe uma NF-e para visualizar fornecedor, chave, valores e produtos.</span>
            </div>
          </div>
          <div id="nfeResult" hidden></div>
        </section>
      </div>`;

    const caPage = content.querySelector('[data-page-content="caepi"]');
    if (caPage) caPage.insertAdjacentElement('beforebegin', page);
    else content.appendChild(page);

    navButton.addEventListener('click', () => {
      if (!currentUserIsAdmin()) return;
      document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b === navButton));
      document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p === page));
      refreshNfeIcons();
    });

    bindUi();
    syncAdminButton(navButton);
    refreshNfeIcons();
    return true;
  }

  function syncAdminButton(button) {
    const start = Date.now();
    const timer = setInterval(() => {
      button.hidden = !currentUserIsAdmin();
      if (currentUserIsAdmin() || Date.now() - start > 15000) clearInterval(timer);
    }, 350);
  }

  function bindUi() {
    const dropzone = $('nfeDropzone');
    const input = $('nfeFileInput');
    const select = $('nfeSelectBtn');

    select?.addEventListener('click', (event) => {
      event.stopPropagation();
      input?.click();
    });
    dropzone?.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      input?.click();
    });
    dropzone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input?.click();
      }
    });
    input?.addEventListener('change', () => importFiles(input.files));

    ['dragenter', 'dragover'].forEach((name) => dropzone?.addEventListener(name, (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((name) => dropzone?.addEventListener(name, (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
    }));
    dropzone?.addEventListener('drop', (event) => importFiles(event.dataTransfer?.files));
  }

  async function importFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => file && (file.name.toLowerCase().endsWith('.xml') || /xml/i.test(file.type || '')));
    const msg = $('nfeMsg');
    if (!files.length) {
      setMessage('Selecione um arquivo XML válido.', true);
      return;
    }

    msg.className = 'nfe-msg';
    msg.textContent = `Lendo ${files.length} arquivo(s)...`;

    let imported = 0;
    const errors = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const note = parseNfeXml(text, file.name);
        const duplicateIndex = state.notes.findIndex((item) => item.key && note.key && item.key === note.key);
        if (duplicateIndex >= 0) state.notes[duplicateIndex] = note;
        else state.notes.push(note);
        imported += 1;
      } catch (error) {
        console.error('[NF-E XML]', file.name, error);
        errors.push(`${file.name}: ${error.message || error}`);
      }
    }

    if (state.notes.length) state.selected = state.notes.length - 1;
    renderFileList();
    renderSelectedNote();

    if (errors.length) setMessage(`${imported} XML(s) lido(s). ${errors.length} falharam. ${errors[0]}`, true);
    else setMessage(`${imported} XML(s) lido(s) com sucesso.`, false, true);

    if ($('nfeFileInput')) $('nfeFileInput').value = '';
  }

  function setMessage(text, error = false, ok = false) {
    const msg = $('nfeMsg');
    if (!msg) return;
    msg.className = `nfe-msg${error ? ' error' : ''}${ok ? ' ok' : ''}`;
    msg.textContent = text;
  }

  function nodeList(root, localName) {
    if (!root) return [];
    const ns = root.getElementsByTagNameNS ? [...root.getElementsByTagNameNS('*', localName)] : [];
    return ns.length ? ns : [...root.getElementsByTagName(localName)];
  }

  function first(root, localName) {
    return nodeList(root, localName)[0] || null;
  }

  function text(root, localName) {
    return String(first(root, localName)?.textContent || '').trim();
  }

  function decimal(root, localName) {
    const value = Number(String(text(root, localName)).replace(',', '.'));
    return Number.isFinite(value) ? value : 0;
  }

  function formatCnpj(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 14) return value || '—';
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: value.includes('T') ? 'short' : undefined });
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  }

  function parseNfeXml(xmlText, fileName) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('XML inválido ou corrompido.');

    const inf = first(xml, 'infNFe');
    if (!inf) throw new Error('O arquivo não contém uma NF-e reconhecível (infNFe).');

    const ide = first(inf, 'ide');
    const emit = first(inf, 'emit');
    const total = first(inf, 'ICMSTot');
    const id = String(inf.getAttribute('Id') || '').replace(/^NFe/i, '');
    const key = id || text(xml, 'chNFe');

    const products = nodeList(inf, 'det').map((det, index) => {
      const prod = first(det, 'prod') || det;
      const description = text(prod, 'xProd');
      const unitQty = decimal(prod, 'qCom');
      const unitPrice = decimal(prod, 'vUnCom');
      const totalPrice = decimal(prod, 'vProd');
      const caMatch = description.match(/(?:\bC\.?\s*A\.?\b|\bCA\b)\s*[:#-]?\s*(\d{3,8})/i);
      const match = findCatalogMatch(description);

      return {
        index: index + 1,
        code: text(prod, 'cProd'),
        ean: text(prod, 'cEAN'),
        description,
        ncm: text(prod, 'NCM'),
        cfop: text(prod, 'CFOP'),
        unit: text(prod, 'uCom'),
        quantity: unitQty,
        unitPrice,
        total: totalPrice || (unitQty * unitPrice),
        discount: decimal(prod, 'vDesc'),
        detectedCa: caMatch ? caMatch[1] : '',
        match
      };
    });

    return {
      fileName,
      key,
      number: text(ide, 'nNF'),
      series: text(ide, 'serie'),
      issueDate: text(ide, 'dhEmi') || text(ide, 'dEmi'),
      operation: text(ide, 'natOp'),
      model: text(ide, 'mod'),
      supplierName: text(emit, 'xNome'),
      supplierTradeName: text(emit, 'xFant'),
      supplierCnpj: text(emit, 'CNPJ') || text(emit, 'CPF'),
      totalProducts: decimal(total, 'vProd'),
      totalDiscount: decimal(total, 'vDesc'),
      totalNote: decimal(total, 'vNF'),
      freight: decimal(total, 'vFrete'),
      products
    };
  }

  function normalizeMatch(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function findCatalogMatch(description) {
    let catalog = [];
    try { if (typeof epiCatalog !== 'undefined' && Array.isArray(epiCatalog)) catalog = epiCatalog.filter((item) => item.ativo !== false); }
    catch (_) { catalog = []; }
    if (!catalog.length || !description) return null;

    const source = normalizeMatch(description);
    const sourceTokens = new Set(source.split(/\s+/).filter((token) => token.length > 2));
    let best = null;

    for (const item of catalog) {
      const target = normalizeMatch(`${item.nome || ''} ${item.categoria || ''}`);
      const targetTokens = new Set(target.split(/\s+/).filter((token) => token.length > 2));
      if (!targetTokens.size) continue;

      let common = 0;
      targetTokens.forEach((token) => { if (sourceTokens.has(token)) common += 1; });
      let score = common / targetTokens.size;
      if (source.includes(normalizeMatch(item.nome || '')) && normalizeMatch(item.nome || '').length > 4) score += 0.45;

      if (!best || score > best.score) best = { id: item.id, name: item.nome, score };
    }

    return best && best.score >= 0.42 ? best : null;
  }

  function renderFileList() {
    const list = $('nfeFileList');
    if (!list) return;
    list.innerHTML = state.notes.map((note, index) => `
      <button class="nfe-file-row${index === state.selected ? ' active' : ''}" type="button" data-nfe-index="${index}">
        <i data-lucide="receipt-text"></i>
        <span class="nfe-file-row-copy">
          <strong>NF ${esc(note.number || '—')} ${note.series ? `• Série ${esc(note.series)}` : ''}</strong>
          <span>${esc(note.supplierName || note.fileName)}</span>
        </span>
        <span class="nfe-file-row-total">${money(note.totalNote)}</span>
      </button>`).join('');

    list.querySelectorAll('[data-nfe-index]').forEach((button) => button.addEventListener('click', () => {
      state.selected = Number(button.dataset.nfeIndex);
      renderFileList();
      renderSelectedNote();
    }));
    refreshNfeIcons();
  }

  function summaryCard(label, value, wide = false) {
    return `<article class="nfe-summary-card${wide ? ' wide' : ''}"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></article>`;
  }

  function renderSelectedNote() {
    const result = $('nfeResult');
    const empty = $('nfeEmpty');
    const note = state.notes[state.selected];
    if (!result || !empty) return;

    if (!note) {
      result.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    result.hidden = false;

    const matchCount = note.products.filter((item) => item.match).length;
    result.innerHTML = `
      <div class="nfe-note-head">
        <div>
          <span class="eyebrow">NF-e LIDA COM SUCESSO</span>
          <h3>Nota ${esc(note.number || '—')} ${note.series ? `• Série ${esc(note.series)}` : ''}</h3>
          <p>${esc(note.operation || 'Natureza da operação não informada')}</p>
        </div>
        <span class="nfe-status-chip">${note.products.length} item(ns) • ${matchCount} possível(is) vínculo(s)</span>
      </div>

      <div class="nfe-summary-grid">
        ${summaryCard('Fornecedor', note.supplierName || note.supplierTradeName, true)}
        ${summaryCard('CNPJ / CPF', formatCnpj(note.supplierCnpj))}
        ${summaryCard('Emissão', formatDate(note.issueDate))}
        ${summaryCard('Chave de acesso', note.key, true)}
        ${summaryCard('Valor dos produtos', money(note.totalProducts))}
        ${summaryCard('Valor total da NF', money(note.totalNote))}
      </div>

      <div class="nfe-items-head">
        <div><h3>Itens da nota</h3><small>Conferência antes de qualquer integração com estoque</small></div>
        <small>${esc(note.fileName)}</small>
      </div>

      <div class="nfe-items-table-wrap">
        <table class="nfe-items-table">
          <thead><tr><th>Produto</th><th>Cód.</th><th>Qtd.</th><th>Un.</th><th>Valor unit.</th><th>Total</th><th>Leitura do catálogo</th></tr></thead>
          <tbody>
            ${note.products.map((item) => `
              <tr>
                <td><div class="nfe-item-name">${esc(item.description || 'Produto sem descrição')}</div><div class="nfe-item-sub">NCM ${esc(item.ncm || '—')} • CFOP ${esc(item.cfop || '—')}${item.detectedCa ? ` • C.A. ${esc(item.detectedCa)} detectado` : ''}</div></td>
                <td>${esc(item.code || '—')}</td>
                <td>${numberBR(item.quantity)}</td>
                <td>${esc(item.unit || '—')}</td>
                <td>${money(item.unitPrice)}</td>
                <td>${money(item.total)}</td>
                <td>${item.match ? `<span class="nfe-match"><i data-lucide="link-2"></i>${esc(item.match.name)}</span>` : '<span class="nfe-match none"><i data-lucide="circle-help"></i>Sem vínculo sugerido</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    refreshNfeIcons();
  }

  if (!injectUi()) {
    const observer = new MutationObserver(() => {
      if (injectUi()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
