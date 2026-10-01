(() => {
  'use strict';

  if (window.__EPI_NFE_MODULE__) return;
  window.__EPI_NFE_MODULE__ = true;

  const state = { notes: [], selected: -1 };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fiscalNumber = (value, digits = 2) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
      <div class="section-title nfe-page-title">
        <div>
          <h2>Notas Fiscais</h2>
          <p>Leitura e conferência de XML de NF-e para compras, estoque e histórico de preços.</p>
        </div>
        <span class="ca-visual-badge"><i data-lucide="file-check-2"></i> LEITURA XML</span>
      </div>

      <div class="nfe-layout">
        <aside class="nfe-panel nfe-import-panel">
          <div class="nfe-import-head">
            <span class="nfe-kicker">IMPORTAÇÃO</span>
            <h3>Importar NF-e</h3>
            <p>Selecione um ou mais XMLs. Nesta fase, nada é lançado no estoque automaticamente.</p>
          </div>

          <div class="nfe-dropzone" id="nfeDropzone" tabindex="0" role="button" aria-label="Selecionar XML de nota fiscal">
            <div>
              <div class="nfe-drop-icon"><i data-lucide="file-up"></i></div>
              <strong>Arraste o XML aqui</strong>
              <span>ou escolha o arquivo no computador</span>
              <div class="nfe-drop-actions">
                <button class="btn compact" id="nfeSelectBtn" type="button"><i data-lucide="folder-open"></i>Selecionar XML</button>
              </div>
            </div>
          </div>
          <input id="nfeFileInput" type="file" accept=".xml,text/xml,application/xml" multiple hidden>

          <div class="nfe-help">
            <i data-lucide="shield-check"></i>
            <span>Leitura local no navegador. Use a tela para conferência antes de qualquer integração futura.</span>
          </div>

          <div class="nfe-msg" id="nfeMsg"></div>
          <div class="nfe-file-list" id="nfeFileList"></div>
        </aside>

        <section class="nfe-stage" id="nfeStage">
          <div class="nfe-empty" id="nfeEmpty">
            <div class="nfe-empty-inner">
              <div class="nfe-empty-icon"><i data-lucide="scan-line"></i></div>
              <strong>Aguardando XML</strong>
              <span>Importe uma NF-e para visualizar o documento.</span>
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
    if (!files.length) {
      setMessage('Selecione um arquivo XML válido.', true);
      return;
    }

    setMessage(`Lendo ${files.length} arquivo(s)...`);
    let imported = 0;
    const errors = [];

    for (const file of files) {
      try {
        const xmlText = await file.text();
        const note = parseNfeXml(xmlText, file.name);
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

  function formatDocument(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return value || '—';
  }

  function dateOnly(value) {
    if (!value) return '—';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
  }

  function dateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return dateOnly(value);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  }

  function timeOnly(value) {
    if (!value || !String(value).includes('T')) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function readAddress(node) {
    const cep = text(node, 'CEP');
    return {
      street: text(node, 'xLgr'),
      number: text(node, 'nro'),
      district: text(node, 'xBairro'),
      city: text(node, 'xMun'),
      uf: text(node, 'UF'),
      cep: cep ? cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '',
      phone: text(node, 'fone')
    };
  }

  function addressLine(address) {
    if (!address) return '—';
    return [address.street && `${address.street}${address.number ? `, ${address.number}` : ''}`, address.district, [address.city, address.uf].filter(Boolean).join(' / '), address.cep && `CEP ${address.cep}`].filter(Boolean).join(' • ') || '—';
  }

  function parseNfeXml(xmlText, fileName) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('XML inválido ou corrompido.');

    const inf = first(xml, 'infNFe');
    if (!inf) throw new Error('O arquivo não contém uma NF-e reconhecível (infNFe).');

    const ide = first(inf, 'ide');
    const emit = first(inf, 'emit');
    const dest = first(inf, 'dest');
    const emitAddressNode = first(emit, 'enderEmit');
    const destAddressNode = first(dest, 'enderDest');
    const total = first(inf, 'ICMSTot');
    const transp = first(inf, 'transp');
    const transporta = first(transp, 'transporta');
    const volume = first(transp, 'vol');
    const cobr = first(inf, 'cobr');
    const infAdic = first(inf, 'infAdic');
    const prot = first(xml, 'protNFe');
    const infProt = first(prot, 'infProt');
    const id = String(inf.getAttribute('Id') || '').replace(/^NFe/i, '');
    const key = id || text(xml, 'chNFe');

    const products = nodeList(inf, 'det').map((det, index) => {
      const prod = first(det, 'prod') || det;
      const imposto = first(det, 'imposto');
      const icmsWrap = first(imposto, 'ICMS');
      const icmsNode = icmsWrap?.firstElementChild || icmsWrap;
      const ipiWrap = first(imposto, 'IPI');
      const ipiTrib = first(ipiWrap, 'IPITrib') || ipiWrap;
      const description = text(prod, 'xProd');
      const unitQty = decimal(prod, 'qCom');
      const unitPrice = decimal(prod, 'vUnCom');
      const totalPrice = decimal(prod, 'vProd');
      const caMatch = description.match(/(?:\bC\.?\s*A\.?\b|\bCA\b)\s*[:#-]?\s*(\d{3,8})/i);

      return {
        index: index + 1,
        code: text(prod, 'cProd'),
        description,
        ncm: text(prod, 'NCM'),
        cest: text(prod, 'CEST'),
        cst: text(icmsNode, 'CST') || text(icmsNode, 'CSOSN'),
        cfop: text(prod, 'CFOP'),
        unit: text(prod, 'uCom'),
        quantity: unitQty,
        unitPrice,
        total: totalPrice || (unitQty * unitPrice),
        discount: decimal(prod, 'vDesc'),
        icmsBase: decimal(icmsNode, 'vBC'),
        icms: decimal(icmsNode, 'vICMS'),
        ipi: decimal(ipiTrib, 'vIPI'),
        icmsRate: decimal(icmsNode, 'pICMS'),
        ipiRate: decimal(ipiTrib, 'pIPI'),
        detectedCa: caMatch ? caMatch[1] : '',
        match: findCatalogMatch(description)
      };
    });

    const installments = nodeList(cobr, 'dup').map((dup) => ({
      number: text(dup, 'nDup'),
      due: text(dup, 'dVenc'),
      value: decimal(dup, 'vDup')
    }));

    return {
      fileName,
      key,
      number: text(ide, 'nNF'),
      series: text(ide, 'serie'),
      model: text(ide, 'mod'),
      type: text(ide, 'tpNF'),
      issueDate: text(ide, 'dhEmi') || text(ide, 'dEmi'),
      exitDate: text(ide, 'dhSaiEnt') || text(ide, 'dSaiEnt'),
      operation: text(ide, 'natOp'),

      supplierName: text(emit, 'xNome'),
      supplierTradeName: text(emit, 'xFant'),
      supplierDocument: text(emit, 'CNPJ') || text(emit, 'CPF'),
      supplierIe: text(emit, 'IE'),
      supplierIm: text(emit, 'IM'),
      supplierAddress: readAddress(emitAddressNode),

      recipientName: text(dest, 'xNome'),
      recipientDocument: text(dest, 'CNPJ') || text(dest, 'CPF'),
      recipientIe: text(dest, 'IE'),
      recipientAddress: readAddress(destAddressNode),

      totalProducts: decimal(total, 'vProd'),
      totalDiscount: decimal(total, 'vDesc'),
      totalNote: decimal(total, 'vNF'),
      freight: decimal(total, 'vFrete'),
      insurance: decimal(total, 'vSeg'),
      otherExpenses: decimal(total, 'vOutro'),
      importTax: decimal(total, 'vII'),
      icmsBase: decimal(total, 'vBC'),
      icms: decimal(total, 'vICMS'),
      icmsStBase: decimal(total, 'vBCST'),
      icmsSt: decimal(total, 'vST'),
      ipi: decimal(total, 'vIPI'),
      taxes: decimal(total, 'vTotTrib'),

      transporter: text(transporta, 'xNome'),
      transporterDocument: text(transporta, 'CNPJ') || text(transporta, 'CPF'),
      transporterIe: text(transporta, 'IE'),
      transporterAddress: text(transporta, 'xEnder'),
      transporterCity: text(transporta, 'xMun'),
      transporterUf: text(transporta, 'UF'),
      freightMode: text(transp, 'modFrete'),
      volumeQuantity: text(volume, 'qVol'),
      volumeSpecies: text(volume, 'esp'),
      volumeBrand: text(volume, 'marca'),
      volumeNumber: text(volume, 'nVol'),
      grossWeight: decimal(volume, 'pesoB'),
      netWeight: decimal(volume, 'pesoL'),

      invoiceNumber: text(cobr, 'nFat'),
      invoiceOriginal: decimal(cobr, 'vOrig'),
      invoiceDiscount: decimal(cobr, 'vDesc'),
      invoiceNet: decimal(cobr, 'vLiq'),
      installments,

      protocol: text(infProt, 'nProt'),
      authorizationDate: text(infProt, 'dhRecbto'),
      additionalInfo: text(infAdic, 'infCpl'),
      products
    };
  }

  function normalizeMatch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
      const name = normalizeMatch(item.nome || '');
      const target = normalizeMatch(`${item.nome || ''} ${item.categoria || ''}`);
      const targetTokens = new Set(target.split(/\s+/).filter((token) => token.length > 2));
      if (!targetTokens.size) continue;
      let common = 0;
      targetTokens.forEach((token) => { if (sourceTokens.has(token)) common += 1; });
      let score = common / targetTokens.size;
      if (name.length > 4 && source.includes(name)) score += 0.45;
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

  function cell(label, value, cls = '') {
    return `<div class="danfe-cell ${cls}"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
  }

  function moneyCell(label, value, cls = '') {
    return cell(label, fiscalNumber(value), cls);
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
    const supplierAddress = addressLine(note.supplierAddress);
    const recipientAddress = note.recipientAddress || {};
    const receiptText = `RECEBEMOS DE ${note.supplierName || '—'} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO. EMISSÃO: ${dateOnly(note.issueDate)} VALOR TOTAL: ${money(note.totalNote)} DESTINATÁRIO: ${note.recipientName || '—'} - ${addressLine(note.recipientAddress)}`;
    const typeLabel = note.type === '0' ? '0 - ENTRADA' : '1 - SAÍDA';
    const freightLabels = {'0':'0-Emitente','1':'1-Destinatário','2':'2-Terceiros','3':'3-Próprio por conta do Rem','4':'4-Próprio por conta do Dest','9':'9-Sem frete'};
    const invoiceRows = note.installments.length
      ? note.installments.map((item) => `<div class="danfe-dup">${cell('Num.', item.number)}${cell('Venc.', dateOnly(item.due))}${moneyCell('Valor', item.value)}</div>`).join('')
      : `<div class="danfe-dup">${cell('Fatura', note.invoiceNumber || '—')}${moneyCell('Valor', note.invoiceNet || note.totalNote)}</div>`;

    result.innerHTML = `
      <div class="nfe-doc-toolbar">
        <span><strong>NF-e lida</strong> • ${note.products.length} item(ns) • ${matchCount} vínculo(s) sugerido(s)</span>
        <span>${esc(note.fileName)}</span>
      </div>

      <article class="danfe-sheet">
        <section class="danfe-receipt">
          <div class="danfe-receipt-copy">${esc(receiptText)}</div>
          <div class="danfe-receipt-nfe"><b>NF-e</b><strong>Nº ${esc(note.number || '—')}</strong><span>Série ${esc(note.series || '—')}</span></div>
          <div class="danfe-receipt-sign">DATA DE RECEBIMENTO</div>
          <div class="danfe-receipt-sign wide">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</div>
        </section>

        <section class="danfe-top">
          <div class="danfe-issuer">
            <em>IDENTIFICAÇÃO DO EMITENTE</em>
            <strong>${esc(note.supplierName || '—')}</strong>
            <span>${esc(supplierAddress)}</span>
            ${note.supplierAddress?.phone ? `<span>Fone/Fax: ${esc(note.supplierAddress.phone)}</span>` : ''}
          </div>
          <div class="danfe-title-box">
            <b>DANFE</b>
            <span>Documento Auxiliar da Nota<br>Fiscal Eletrônica</span>
            <div class="danfe-entry"><span>0 - ENTRADA<br>1 - SAÍDA</span><strong>${esc(note.type || '1')}</strong></div>
            <strong>Nº ${esc(note.number || '—')}</strong>
            <strong>Série ${esc(note.series || '—')}</strong>
            <span>Folha 1/1</span>
          </div>
          <div class="danfe-key-box">
            <div class="danfe-barcode" aria-hidden="true"></div>
            <span>CHAVE DE ACESSO</span>
            <strong>${esc(String(note.key || '').replace(/(.{4})/g, '$1 ').trim() || '—')}</strong>
            <small>Consulta de autenticidade no portal nacional da NF-e</small>
          </div>
        </section>

        <section class="danfe-row two-wide">
          ${cell('NATUREZA DA OPERAÇÃO', note.operation, 'grow')}
          ${cell('PROTOCOLO DE AUTORIZAÇÃO DE USO', [note.protocol, dateTime(note.authorizationDate)].filter(Boolean).join(' - '), 'grow')}
        </section>
        <section class="danfe-row four">
          ${cell('INSCRIÇÃO ESTADUAL', note.supplierIe)}
          ${cell('INSCRIÇÃO MUNICIPAL', note.supplierIm)}
          ${cell('INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.', '—')}
          ${cell('CNPJ / CPF', formatDocument(note.supplierDocument))}
        </section>

        <h4 class="danfe-section-title">DESTINATÁRIO / REMETENTE</h4>
        <section class="danfe-row recipient-top">
          ${cell('NOME / RAZÃO SOCIAL', note.recipientName, 'recipient-name')}
          ${cell('CNPJ / CPF', formatDocument(note.recipientDocument))}
          ${cell('DATA DA EMISSÃO', dateOnly(note.issueDate))}
        </section>
        <section class="danfe-row recipient-address">
          ${cell('ENDEREÇO', [recipientAddress.street, recipientAddress.number].filter(Boolean).join(', '), 'recipient-street')}
          ${cell('BAIRRO / DISTRITO', recipientAddress.district)}
          ${cell('CEP', recipientAddress.cep)}
          ${cell('DATA DA SAÍDA/ENTRADA', dateOnly(note.exitDate))}
        </section>
        <section class="danfe-row recipient-bottom">
          ${cell('MUNICÍPIO', recipientAddress.city, 'recipient-city')}
          ${cell('UF', recipientAddress.uf)}
          ${cell('FONE / FAX', recipientAddress.phone)}
          ${cell('INSCRIÇÃO ESTADUAL', note.recipientIe)}
          ${cell('HORA DA SAÍDA/ENTRADA', timeOnly(note.exitDate))}
        </section>

        <h4 class="danfe-section-title">FATURA / DUPLICATA</h4>
        <section class="danfe-invoice">${invoiceRows}</section>

        <h4 class="danfe-section-title">CÁLCULO DO IMPOSTO</h4>
        <section class="danfe-tax-grid">
          ${moneyCell('BASE DE CÁLC. DO ICMS', note.icmsBase)}
          ${moneyCell('VALOR DO ICMS', note.icms)}
          ${moneyCell('BASE DE CÁLC. ICMS S.T.', note.icmsStBase)}
          ${moneyCell('VALOR DO ICMS SUBST.', note.icmsSt)}
          ${moneyCell('V. IMP. IMPORTAÇÃO', note.importTax)}
          ${moneyCell('V. TOTAL PRODUTOS', note.totalProducts)}
          ${moneyCell('VALOR DO FRETE', note.freight)}
          ${moneyCell('VALOR DO SEGURO', note.insurance)}
          ${moneyCell('DESCONTO', note.totalDiscount)}
          ${moneyCell('OUTRAS DESPESAS', note.otherExpenses)}
          ${moneyCell('VALOR TOTAL IPI', note.ipi)}
          ${moneyCell('V. TOT. TRIB.', note.taxes)}
          ${moneyCell('V. TOTAL DA NOTA', note.totalNote, 'danfe-total')}
        </section>

        <h4 class="danfe-section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</h4>
        <section class="danfe-row transport-top">
          ${cell('NOME / RAZÃO SOCIAL', note.transporter)}
          ${cell('FRETE', freightLabels[note.freightMode] || note.freightMode || '—')}
          ${cell('CNPJ / CPF', formatDocument(note.transporterDocument))}
        </section>
        <section class="danfe-row transport-mid">
          ${cell('ENDEREÇO', note.transporterAddress)}
          ${cell('MUNICÍPIO', note.transporterCity)}
          ${cell('UF', note.transporterUf)}
          ${cell('INSCRIÇÃO ESTADUAL', note.transporterIe)}
        </section>
        <section class="danfe-row transport-volumes">
          ${cell('QUANTIDADE', note.volumeQuantity)}
          ${cell('ESPÉCIE', note.volumeSpecies)}
          ${cell('MARCA', note.volumeBrand)}
          ${cell('NUMERAÇÃO', note.volumeNumber)}
          ${cell('PESO BRUTO', note.grossWeight ? fiscalNumber(note.grossWeight, 3) : '—')}
          ${cell('PESO LÍQUIDO', note.netWeight ? fiscalNumber(note.netWeight, 3) : '—')}
        </section>

        <h4 class="danfe-section-title">DADOS DOS PRODUTOS / SERVIÇOS</h4>
        <section class="danfe-products-wrap">
          <table class="danfe-products">
            <colgroup>
              <col class="c-code"><col class="c-desc"><col class="c-ncm"><col class="c-cst"><col class="c-cfop"><col class="c-un"><col class="c-qtd"><col class="c-unit"><col class="c-total"><col class="c-descval"><col class="c-base"><col class="c-icms"><col class="c-ipi"><col class="c-picms"><col class="c-pipi">
            </colgroup>
            <thead><tr>
              <th>CÓDIGO<br>PRODUTO</th><th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th><th>O/CST</th><th>CFOP</th><th>UN</th><th>QUANT</th><th>VALOR<br>UNIT</th><th>VALOR<br>TOTAL</th><th>VALOR<br>DESC</th><th>B.CÁLC<br>ICMS</th><th>VALOR<br>ICMS</th><th>VALOR<br>IPI</th><th>ALÍQ.<br>ICMS</th><th>ALÍQ.<br>IPI</th>
            </tr></thead>
            <tbody>${note.products.map((item) => `<tr>
              <td>${esc(item.code || '')}</td>
              <td class="desc">${esc(item.description || '')}${item.detectedCa ? `<small>C.A. ${esc(item.detectedCa)}</small>` : ''}</td>
              <td>${esc(item.ncm || '')}</td><td>${esc(item.cst || '')}</td><td>${esc(item.cfop || '')}</td><td>${esc(item.unit || '')}</td>
              <td>${numberBR(item.quantity)}</td><td>${fiscalNumber(item.unitPrice, 4)}</td><td>${fiscalNumber(item.total)}</td><td>${fiscalNumber(item.discount)}</td>
              <td>${fiscalNumber(item.icmsBase)}</td><td>${fiscalNumber(item.icms)}</td><td>${fiscalNumber(item.ipi)}</td><td>${fiscalNumber(item.icmsRate)}</td><td>${fiscalNumber(item.ipiRate)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </section>

        <h4 class="danfe-section-title">DADOS ADICIONAIS</h4>
        <section class="danfe-additional-grid">
          <div class="danfe-additional-box"><span>INFORMAÇÕES COMPLEMENTARES</span><p>${esc(note.additionalInfo || '—')}</p></div>
          <div class="danfe-additional-box fiscal"><span>RESERVADO AO FISCO</span></div>
        </section>
      </article>`;

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