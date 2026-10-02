(() => {
  'use strict';

  if (window.__EPI_NFE_STOCK_READER__) return;
  window.__EPI_NFE_STOCK_READER__ = true;

  const state = {
    notes: [],
    latest: null
  };

  function db() {
    try { return typeof sb !== 'undefined' ? sb : null; }
    catch (_) { return null; }
  }

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

  function variants() {
    try {
      if (typeof epiVariants !== 'undefined' && Array.isArray(epiVariants)) {
        return epiVariants.filter((item) => item && item.ativo !== false);
      }
    } catch (_) {}
    return [];
  }

  function matchByCa(ca) {
    const digits = String(ca || '').replace(/\D/g, '');
    if (!digits) return null;

    const variant = variants().find((item) => String(item.ca || '').replace(/\D/g, '') === digits);
    if (!variant?.epi_id) return null;

    const epi = catalogItems().find((item) => item.id === variant.epi_id);
    return {
      epiId: variant.epi_id,
      epiNome: epi?.nome || '',
      categoria: epi?.categoria || '',
      score: 1,
      method: 'ca'
    };
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
          score,
          method: 'descricao'
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
    const total = first(inf, 'ICMSTot');

    const items = nodes(inf, 'det').map((det, index) => {
      const prod = first(det, 'prod') || det;
      const description = text(prod, 'xProd');
      const quantity = number(prod, 'qCom');
      const unitValue = number(prod, 'vUnCom');
      const xmlTotal = number(prod, 'vProd');
      const totalValue = xmlTotal || (quantity * unitValue);
      const detectedCa = (description.match(/(?:\bC\.?\s*A\.?\b|\bCA\b)\s*[:#-]?\s*(\d{3,8})/i) || [])[1] || '';
      const match = matchByCa(detectedCa) || matchCatalog(description);

      return {
        line: index + 1,
        supplierCode: text(prod, 'cProd'),
        sourceDescription: description,
        ncm: text(prod, 'NCM'),
        cfop: text(prod, 'CFOP'),
        unit: text(prod, 'uCom'),
        quantity,
        unitValue,
        totalValue,
        detectedCa,
        epiId: match?.epiId || null,
        itemName: match?.epiNome || description,
        category: match?.categoria || null,
        confidence: match ? Number(match.score.toFixed(3)) : 0,
        matchMethod: match?.method || null,
        recognized: !!match
      };
    });

    return {
      fileName,
      xmlOriginal: xmlText,
      key,
      number: text(ide, 'nNF'),
      series: text(ide, 'serie'),
      issueDate: text(ide, 'dhEmi') || text(ide, 'dEmi') || null,
      supplierName: text(emit, 'xNome'),
      supplierDocument: text(emit, 'CNPJ') || text(emit, 'CPF'),
      totalNote: number(total, 'vNF') || items.reduce((sum, item) => sum + item.totalValue, 0),
      itemCount: items.length,
      recognizedCount: items.filter((item) => item.recognized).length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      recognizedQuantity: items.filter((item) => item.recognized).reduce((sum, item) => sum + item.quantity, 0),
      items
    };
  }

  function currentNote() {
    const active = document.querySelector('#nfeFileList [data-nfe-index].active');
    const index = Number(active?.dataset?.nfeIndex);
    if (Number.isInteger(index) && state.notes[index]) return state.notes[index];
    return state.latest;
  }

  function setNfeMessage(textValue, error = false, ok = false) {
    const msg = document.getElementById('nfeMsg');
    if (!msg) return;
    msg.className = `nfe-msg${error ? ' error' : ''}${ok ? ' ok' : ''}`;
    msg.textContent = textValue;
  }

  async function saveNote(note, button) {
    const client = db();
    if (!client) throw new Error('Supabase ainda não está disponível.');
    if (!note?.key) throw new Error('A NF-e não possui chave de acesso válida.');
    if (!note.items?.length) throw new Error('A NF-e não possui itens para salvar.');

    if (button) {
      button.disabled = true;
      button.dataset.originalHtml = button.innerHTML;
      button.innerHTML = '<i data-lucide="loader-circle"></i><span>Salvando...</span>';
      window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
    }

    const entryPayload = {
      chave_acesso: note.key,
      numero: note.number || null,
      serie: note.series || null,
      emitente_nome: note.supplierName || null,
      emitente_documento: note.supplierDocument || null,
      data_emissao: note.issueDate || null,
      valor_total: Number(note.totalNote) || 0,
      arquivo_nome: note.fileName || null,
      xml_original: note.xmlOriginal || null,
      status: 'entrada',
      dados: {
        item_count: note.itemCount,
        recognized_count: note.recognizedCount,
        total_quantity: note.totalQuantity,
        recognized_quantity: note.recognizedQuantity
      },
      updated_at: new Date().toISOString()
    };

    const { data: existing, error: existingError } = await client
      .from('nfe_entradas')
      .select('id')
      .eq('chave_acesso', note.key)
      .maybeSingle();
    if (existingError) throw existingError;

    let entryId = existing?.id || null;

    if (entryId) {
      const { error: updateError } = await client.from('nfe_entradas').update(entryPayload).eq('id', entryId);
      if (updateError) throw updateError;

      const { error: deleteItemsError } = await client.from('nfe_entrada_itens').delete().eq('nfe_entrada_id', entryId);
      if (deleteItemsError) throw deleteItemsError;
    } else {
      const { data: inserted, error: insertError } = await client
        .from('nfe_entradas')
        .insert(entryPayload)
        .select('id')
        .single();
      if (insertError) throw insertError;
      entryId = inserted.id;
    }

    const itemRows = note.items.map((item) => ({
      nfe_entrada_id: entryId,
      indice: item.line,
      codigo_produto: item.supplierCode || null,
      descricao: item.sourceDescription || null,
      ncm: item.ncm || null,
      cfop: item.cfop || null,
      unidade: item.unit || null,
      quantidade: Number(item.quantity) || 0,
      valor_unitario: Number(item.unitValue) || 0,
      valor_total: Number(item.totalValue) || 0,
      ca_detectado: item.detectedCa || null,
      epi_id: item.epiId || null,
      match_score: item.confidence || null,
      dados: {
        item_name: item.itemName || null,
        category: item.category || null,
        recognized: item.recognized === true,
        match_method: item.matchMethod || null
      }
    }));

    const { error: itemError } = await client.from('nfe_entrada_itens').insert(itemRows);
    if (itemError) throw itemError;

    note.savedId = entryId;
    window.dispatchEvent(new CustomEvent('epi:stock-changed', {
      detail: {
        source: 'nfe',
        entryId,
        key: note.key,
        quantity: note.recognizedQuantity,
        recognizedCount: note.recognizedCount
      }
    }));

    setNfeMessage(`Entrada salva • ${note.recognizedCount} item(ns) identificado(s) • ${note.recognizedQuantity} unidade(s) para estoque.`, false, true);

    if (button) {
      button.disabled = false;
      button.innerHTML = '<i data-lucide="check"></i><span>Entrada salva</span>';
      window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
    }

    return entryId;
  }

  function ensureSaveButton() {
    const result = document.getElementById('nfeResult');
    const toolbar = result?.querySelector('.nfe-doc-toolbar');
    if (!toolbar || toolbar.querySelector('#nfeSaveEntryBtn')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'nfeSaveEntryBtn';
    button.className = 'btn primary compact';
    button.innerHTML = '<i data-lucide="database-zap"></i><span>Salvar entrada</span>';
    button.addEventListener('click', async () => {
      try {
        const note = currentNote();
        if (!note) throw new Error('Importe uma NF-e antes de salvar.');
        await saveNote(note, button);
      } catch (error) {
        console.error('[NF-e estoque] Falha ao salvar entrada', error);
        setNfeMessage(`Erro ao salvar entrada: ${error.message || error}`, true);
        if (button) {
          button.disabled = false;
          button.innerHTML = button.dataset.originalHtml || '<i data-lucide="database-zap"></i><span>Salvar entrada</span>';
          window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
        }
      }
    });

    toolbar.appendChild(button);
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  async function readFiles(fileList) {
    const files = [...(fileList || [])].filter((file) => file && (file.name.toLowerCase().endsWith('.xml') || /xml/i.test(file.type || '')));
    if (!files.length) return;

    for (const file of files) {
      try {
        const parsed = parseXml(await file.text(), file.name);
        const existing = state.notes.findIndex((note) => note.key && parsed.key && note.key === parsed.key);
        if (existing >= 0) {
          parsed.savedId = state.notes[existing].savedId || null;
          state.notes[existing] = parsed;
        } else {
          state.notes.push(parsed);
        }
        state.latest = parsed;
        window.dispatchEvent(new CustomEvent('epi:nfe-stock-reading', { detail: parsed }));
      } catch (error) {
        console.error('[NF-e estoque] Falha ao interpretar', file?.name, error);
      }
    }

    setTimeout(ensureSaveButton, 0);
  }

  function bind() {
    const input = document.getElementById('nfeFileInput');
    const dropzone = document.getElementById('nfeDropzone');
    const result = document.getElementById('nfeResult');

    if (!input || input.dataset.stockReaderBound === 'true') return false;

    input.dataset.stockReaderBound = 'true';
    input.addEventListener('change', () => readFiles(input.files));
    dropzone?.addEventListener('drop', (event) => readFiles(event.dataTransfer?.files));

    if (result) {
      const observer = new MutationObserver(() => ensureSaveButton());
      observer.observe(result, { childList: true, subtree: true });
    }

    document.getElementById('nfeFileList')?.addEventListener('click', () => setTimeout(ensureSaveButton, 0));
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
    saveNote,
    getLatest: () => state.latest,
    getNotes: () => [...state.notes],
    getCurrent: currentNote
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
