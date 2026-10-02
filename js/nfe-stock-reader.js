(() => {
  'use strict';

  if (window.__EPI_NFE_STOCK_READER__) return;
  window.__EPI_NFE_STOCK_READER__ = true;

  const state = {
    notes: [],
    latest: null
  };

  function nodes(root, localName) {
    if (!root) return [];
    const ns = root.getElementsByTagNameNS ? [...root.getElementsByTagNameNS('*', localName)] : [];
    return ns.length ? ns : [...root.getElementsByTagName(localName)];
  }

  function first(root, localName) {
    return nodes(root, localName)[0] || null;
  }

  function text(root, localName) {
    return String(first(root, localName)?.textContent || '').trim();
  }

  function number(root, localName) {
    const value = Number(String(text(root, localName)).replace(',', '.'));
    return Number.isFinite(value) ? value : 0;
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function catalogItems() {
    try {
      if (typeof epiCatalog !== 'undefined' && Array.isArray(epiCatalog)) {
        return epiCatalog.filter((item) => item && item.ativo !== false);
      }
    } catch (_) {}
    return [];
  }

  function matchCatalog(description) {
    const catalog = catalogItems();
    const source = normalize(description);
    if (!catalog.length || !source) return null;

    const sourceTokens = new Set(source.split(/\s+/).filter((token) => token.length > 2));
    let best = null;

    catalog.forEach((item) => {
      const name = normalize(item.nome);
      const target = normalize(`${item.nome || ''} ${item.categoria || ''}`);
      const targetTokens = new Set(target.split(/\s+/).filter((token) => token.length > 2));
      if (!targetTokens.size) return;

      let common = 0;
      targetTokens.forEach((token) => {
        if (sourceTokens.has(token)) common += 1;
      });

      let score = common / targetTokens.size;
      if (name.length > 4 && source.includes(name)) score += 0.45;

      if (!best || score > best.score) {
        best = {
          epiId: item.id || null,
          epiNome: item.nome || '',
          categoria: item.categoria || '',
          score
        };
      }
    });

    return best && best.score >= 0.42 ? best : null;
  }

  function parseXml(xmlText, fileName) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('XML inválido ou corrompido.');

    const inf = first(xml, 'infNFe');
    if (!inf) throw new Error('NF-e sem infNFe.');

    const key = String(inf.getAttribute('Id') || '').replace(/^NFe/i, '') || text(xml, 'chNFe');
    const ide = first(inf, 'ide');
    const emit = first(inf, 'emit');

    const items = nodes(inf, 'det').map((det, index) => {
      const prod = first(det, 'prod') || det;
      const description = text(prod, 'xProd');
      const quantity = number(prod, 'qCom');
      const unitValue = number(prod, 'vUnCom');
      const xmlTotal = number(prod, 'vProd');
      const totalValue = xmlTotal || (quantity * unitValue);
      const detectedCa = (description.match(/(?:\bC\.?\s*A\.?\b|\bCA\b)\s*[:#-]?\s*(\d{3,8})/i) || [])[1] || '';
      const match = matchCatalog(description);

      return {
        line: index + 1,
        supplierCode: text(prod, 'cProd'),
        sourceDescription: description,
        unit: text(prod, 'uCom'),
        quantity,
        unitValue,
        totalValue,
        detectedCa,
        epiId: match?.epiId || null,
        itemName: match?.epiNome || description,
        category: match?.categoria || null,
        confidence: match ? Number(match.score.toFixed(3)) : 0,
        recognized: !!match
      };
    });

    return {
      fileName,
      key,
      number: text(ide, 'nNF'),
      series: text(ide, 'serie'),
      supplierName: text(emit, 'xNome'),
      supplierDocument: text(emit, 'CNPJ') || text(emit, 'CPF'),
      itemCount: items.length,
      recognizedCount: items.filter((item) => item.recognized).length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      items
    };
  }

  async function readFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => file && (file.name.toLowerCase().endsWith('.xml') || /xml/i.test(file.type || '')));
    if (!files.length) return;

    for (const file of files) {
      try {
        const parsed = parseXml(await file.text(), file.name);
        const existing = state.notes.findIndex((note) => note.key && parsed.key && note.key === parsed.key);
        if (existing >= 0) state.notes[existing] = parsed;
        else state.notes.push(parsed);
        state.latest = parsed;
        window.dispatchEvent(new CustomEvent('epi:nfe-stock-reading', { detail: parsed }));
      } catch (error) {
        console.error('[NF-e estoque] Falha ao interpretar', file?.name, error);
      }
    }
  }

  function bind() {
    const input = document.getElementById('nfeFileInput');
    const dropzone = document.getElementById('nfeDropzone');

    if (!input || input.dataset.stockReaderBound === 'true') return false;

    input.dataset.stockReaderBound = 'true';
    input.addEventListener('change', () => readFiles(input.files));
    dropzone?.addEventListener('drop', (event) => readFiles(event.dataTransfer?.files));
    return true;
  }

  function start() {
    if (bind()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (bind() || attempts >= 60) clearInterval(timer);
    }, 250);
  }

  window.EPI_NFE_STOCK_READER = {
    state,
    parseXml,
    readFiles,
    getLatest: () => state.latest,
    getNotes: () => [...state.notes]
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
