(() => {
  'use strict';

  if (window.__EPI_ITEM_SAFETY_DOSSIER__) return;
  window.__EPI_ITEM_SAFETY_DOSSIER__ = true;

  const cache = new Map();
  let activeSheet = null;
  let syncToken = 0;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const normalLabels = {
    epiVarFabricante: 'Fabricante',
    epiVarCnpj: 'CNPJ',
    epiVarMarca: 'Marca',
    epiVarReferencia: 'Referência / Modelo',
    epiVarValidade: 'Validade do C.A.',
    epiVarSituacao: 'Situação',
    epiVarNorma: 'Norma',
    epiVarDescricao: 'Descrição oficial',
    epiVarCaracteristicas: 'Características / especificação interna',
    epiVarPreco: 'Preço (R$)',
    epiVarFornecedor: 'Fornecedor',
    epiVarObservacao: 'Observações'
  };

  function fieldWrap(id) {
    return $(id)?.closest('.field') || null;
  }

  function setFieldLabel(id, text) {
    const label = fieldWrap(id)?.querySelector('label');
    if (label) label.textContent = text;
  }

  function setFieldHidden(id, hidden) {
    const wrap = fieldWrap(id);
    if (wrap) wrap.hidden = hidden;
  }

  function currentEpi() {
    try { return typeof selectedEpi !== 'undefined' ? selectedEpi : null; }
    catch (_) { return null; }
  }

  function isAdmin() {
    try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; }
    catch (_) { return false; }
  }

  function mapToText(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    return Object.entries(value).map(([key, val]) => `${key}: ${val ?? ''}`).join('\n');
  }

  function textToMap(value) {
    const out = {};
    String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (match) out[match[1].trim()] = match[2].trim();
    });
    return out;
  }

  function normsToText(value) {
    return Array.isArray(value) ? value.join(' • ') : '';
  }

  function textToNorms(value) {
    return String(value || '')
      .split(/\r?\n|;|•/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function dimensionsInline(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '—';
    const rows = Object.entries(value).filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== '');
    return rows.length ? rows.map(([key, val]) => `${key}: ${val}`).join(' • ') : '—';
  }

  function addExtraFields() {
    if ($('itemSafetyExtraFields')) return;
    const grid = document.querySelector('#epiVariantEditor .epi-var-grid');
    if (!grid) return;

    const host = document.createElement('div');
    host.id = 'itemSafetyExtraFields';
    host.className = 'full';
    host.style.display = 'contents';
    host.innerHTML = `
      <div class="field full"><label>Dimensões</label><textarea id="itemTechDimensoes" rows="3" placeholder="Ex.: Altura: 700 a 760 mm"></textarea></div>
      <div class="field full"><label>Manutenção / higienização</label><textarea id="itemTechManutencao" rows="3"></textarea></div>
      <div class="field full"><label>Armazenagem</label><textarea id="itemTechArmazenagem" rows="2"></textarea></div>
      <div class="field full"><label>Embalagem</label><textarea id="itemTechEmbalagem" rows="2"></textarea></div>
      <div class="field"><label>Classificação fiscal</label><input id="itemTechClassificacao" placeholder="Quando houver"></div>
      <div class="field full"><label>Especificações técnicas adicionais</label><textarea id="itemTechEspecificacoes" rows="4" placeholder="Ex.: Faixas refletivas: 2 faixas brancas"></textarea></div>
      <div class="field full"><label>Fonte da ficha técnica</label><input id="itemTechFonte" placeholder="Boletim técnico / revisão"></div>
    `;

    const imageField = $('epiVariantImageInput')?.closest('.field');
    if (imageField) grid.insertBefore(host, imageField);
    else grid.appendChild(host);
  }

  function removeExtraFields() {
    $('itemSafetyExtraFields')?.remove();
  }

  function restoreNormalUi() {
    activeSheet = null;
    $('itemSafetyDossier')?.remove();
    removeExtraFields();

    Object.entries(normalLabels).forEach(([id, label]) => setFieldLabel(id, label));

    const selector = $('epiCaSelectorWrap');
    const count = $('epiDetailCount');
    const lookupRow = document.querySelector('#epiVariantEditor .epi-ca-lookup-row');
    const lookupStatus = $('epiVarLookupStatus');
    const priceRow = document.querySelector('#epiVariantEditor .epi-price-compare-row');
    const editorHead = document.querySelector('#epiVariantEditor .epi-detail-section-head p');
    const imageField = $('epiVariantImageInput')?.closest('.field');

    if (selector) selector.hidden = false;
    if (count) count.hidden = false;
    if (lookupRow) lookupRow.hidden = false;
    if (lookupStatus) lookupStatus.hidden = false;
    if (priceRow) priceRow.hidden = false;
    if (imageField) imageField.hidden = false;

    setFieldHidden('epiVarValidade', false);
    setFieldHidden('epiVarFornecedor', false);

    if (editorHead) editorHead.textContent = 'Consulte a base CAEPI e complemente com os dados comerciais.';
    if ($('epiVariantEditorTitle')) $('epiVariantEditorTitle').textContent = 'Adicionar C.A.';
    if ($('epiVariantSave')) $('epiVariantSave').innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Salvar C.A.';
    if ($('epiVariantCancelEdit')) $('epiVariantCancelEdit').classList.add('hidden');

    const imageLabel = imageField?.querySelector('label');
    if (imageLabel) imageLabel.textContent = 'Imagem do modelo / C.A.';

    if (window.lucide?.createIcons) window.lucide.createIcons({attrs:{'aria-hidden':'true'}});
  }

  function renderSheet(sheet) {
    const list = $('epiVariantList');
    if (!list) return;

    const field = (label, value, icon = 'file-text') => `
      <div class="epi-dossier-field">
        <span class="epi-dossier-field-label"><i data-lucide="${icon}" aria-hidden="true"></i>${esc(label)}</span>
        <strong title="${esc(value || '—')}">${esc(value || '—')}</strong>
      </div>`;

    const textBlock = (label, value) => `
      <section class="epi-dossier-text">
        <span>${esc(label)}</span>
        <p>${esc(value || 'Não informado.')}</p>
      </section>`;

    const normText = Array.isArray(sheet.normas) && sheet.normas.length ? sheet.normas.join(' • ') : '—';
    const specText = mapToText(sheet.especificacoes) || 'Não informado.';
    const dimensionText = dimensionsInline(sheet.dimensoes);

    list.innerHTML = `
      <article class="epi-ca-dossier neutral">
        <div class="epi-dossier-head">
          <div>
            <span class="epi-dossier-kicker">FICHA TÉCNICA DO ITEM</span>
            <h3>${esc(sheet.titulo || currentEpi()?.nome || 'Item')}</h3>
          </div>
          <span class="epi-variant-state">${esc(sheet.tipo || currentEpi()?.categoria || 'ITEM')}</span>
        </div>

        <div class="epi-dossier-hero">
          <div class="epi-dossier-image">
            <span>
              <i data-lucide="package-check" aria-hidden="true"></i>
              <small>Item de segurança</small>
            </span>
          </div>

          <div class="epi-dossier-identity">
            <span>FABRICANTE</span>
            <strong>${esc(sheet.fabricante || 'Não informado na ficha técnica')}</strong>
            <small>${esc([sheet.material, sheet.peso].filter(Boolean).join(' • ') || 'Material / peso não informados')}</small>
          </div>
        </div>

        <div class="epi-dossier-grid">
          ${field('Material', sheet.material, 'layers-3')}
          ${field('Peso', sheet.peso, 'weight')}
          ${field('Dimensões', dimensionText, 'ruler')}
          ${field('Norma(s)', normText, 'book-open-check')}
          ${field('Validade', sheet.validade, 'calendar-days')}
          ${field('Vida útil', sheet.vida_util, 'history')}
          ${field('Classificação fiscal', sheet.classificacao_fiscal, 'hash')}
        </div>

        <div class="epi-dossier-texts">
          ${textBlock('Descrição técnica', sheet.descricao)}
          ${textBlock('Utilização', sheet.utilizacao)}
          ${textBlock('Manutenção / higienização', sheet.manutencao)}
          ${textBlock('Armazenagem', sheet.armazenagem)}
          ${textBlock('Embalagem', sheet.embalagem)}
          ${textBlock('Especificações técnicas adicionais', specText)}
        </div>

        <div class="epi-dossier-footer">
          <div class="epi-dossier-source">
            <i data-lucide="file-text" aria-hidden="true"></i>
            <span>${esc(sheet.fonte ? `Fonte: ${sheet.fonte}` : 'Dados cadastrados a partir da ficha técnica do fabricante.')}</span>
          </div>
        </div>
      </article>`;

    if (window.lucide?.createIcons) window.lucide.createIcons({attrs:{'aria-hidden':'true'}});
  }

  function configureTechnicalUi(sheet) {
    activeSheet = sheet;
    addExtraFields();

    const selector = $('epiCaSelectorWrap');
    const count = $('epiDetailCount');
    const lookupRow = document.querySelector('#epiVariantEditor .epi-ca-lookup-row');
    const lookupStatus = $('epiVarLookupStatus');
    const priceRow = document.querySelector('#epiVariantEditor .epi-price-compare-row');
    const editorHead = document.querySelector('#epiVariantEditor .epi-detail-section-head p');
    const imageField = $('epiVariantImageInput')?.closest('.field');

    if (selector) selector.hidden = true;
    if (count) {
      count.hidden = false;
      count.textContent = 'Ficha técnica cadastrada';
    }
    if (lookupRow) lookupRow.hidden = true;
    if (lookupStatus) lookupStatus.hidden = true;
    if (priceRow) priceRow.hidden = true;
    if (imageField) imageField.hidden = true;

    setFieldHidden('epiVarValidade', true);
    setFieldHidden('epiVarFornecedor', true);

    setFieldLabel('epiVarFabricante', 'Fabricante');
    setFieldLabel('epiVarCnpj', 'Material');
    setFieldLabel('epiVarMarca', 'Peso');
    setFieldLabel('epiVarReferencia', 'Nome / modelo técnico');
    setFieldLabel('epiVarSituacao', 'Validade');
    setFieldLabel('epiVarNorma', 'Norma(s) aplicável(is)');
    setFieldLabel('epiVarDescricao', 'Descrição técnica');
    setFieldLabel('epiVarCaracteristicas', 'Utilização');
    setFieldLabel('epiVarObservacao', 'Vida útil');

    if (editorHead) editorHead.textContent = 'Edite os dados usando a ficha técnica do fabricante como referência.';
    if ($('epiVariantEditorTitle')) $('epiVariantEditorTitle').textContent = 'Ficha técnica do item';
    if ($('epiVariantSave')) $('epiVariantSave').innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Salvar ficha técnica';
    if ($('epiVariantCancelEdit')) $('epiVariantCancelEdit').classList.add('hidden');

    $('epiVarFabricante').value = sheet.fabricante || '';
    $('epiVarCnpj').value = sheet.material || '';
    $('epiVarMarca').value = sheet.peso || '';
    $('epiVarReferencia').value = sheet.titulo || '';
    $('epiVarSituacao').value = sheet.validade || '';
    $('epiVarNorma').value = normsToText(sheet.normas);
    $('epiVarDescricao').value = sheet.descricao || '';
    $('epiVarCaracteristicas').value = sheet.utilizacao || '';
    $('epiVarObservacao').value = sheet.vida_util || '';

    if ($('itemTechDimensoes')) $('itemTechDimensoes').value = mapToText(sheet.dimensoes);
    if ($('itemTechManutencao')) $('itemTechManutencao').value = sheet.manutencao || '';
    if ($('itemTechArmazenagem')) $('itemTechArmazenagem').value = sheet.armazenagem || '';
    if ($('itemTechEmbalagem')) $('itemTechEmbalagem').value = sheet.embalagem || '';
    if ($('itemTechClassificacao')) $('itemTechClassificacao').value = sheet.classificacao_fiscal || '';
    if ($('itemTechEspecificacoes')) $('itemTechEspecificacoes').value = mapToText(sheet.especificacoes);
    if ($('itemTechFonte')) $('itemTechFonte').value = sheet.fonte || '';

    if ($('epiVariantMsg')) $('epiVariantMsg').textContent = '';

    renderSheet(sheet);
    if (window.lucide?.createIcons) window.lucide.createIcons({attrs:{'aria-hidden':'true'}});
  }

  async function fetchSheet(epiId, force = false) {
    if (!force && cache.has(epiId)) return cache.get(epiId);
    try {
      const {data, error} = await sb
        .from('item_fichas_tecnicas')
        .select('id,epi_id,tipo,titulo,fabricante,descricao,material,peso,dimensoes,normas,utilizacao,validade,vida_util,manutencao,armazenagem,embalagem,classificacao_fiscal,especificacoes,fonte,ativo')
        .eq('epi_id', epiId)
        .eq('ativo', true)
        .maybeSingle();
      if (error) throw error;
      cache.set(epiId, data || null);
      return data || null;
    } catch (error) {
      console.error('[ITEM TECHNICAL SHEET]', error);
      return null;
    }
  }

  async function syncMode() {
    const modal = $('epiDetailModal');
    const epi = currentEpi();
    const token = ++syncToken;

    if (!modal || modal.classList.contains('hidden') || !epi?.id) {
      restoreNormalUi();
      return;
    }

    const sheet = await fetchSheet(epi.id);
    if (token !== syncToken) return;

    if (!sheet) {
      restoreNormalUi();
      return;
    }

    configureTechnicalUi(sheet);
  }

  async function saveTechnicalSheet(event) {
    if (!activeSheet) return;
    const epi = currentEpi();
    if (!epi?.id || activeSheet.epi_id !== epi.id) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (!isAdmin()) return;

    const payload = {
      tipo: activeSheet.tipo || epi.categoria || 'ITEM',
      titulo: $('epiVarReferencia').value.trim() || epi.nome,
      fabricante: $('epiVarFabricante').value.trim() || null,
      material: $('epiVarCnpj').value.trim() || null,
      peso: $('epiVarMarca').value.trim() || null,
      validade: $('epiVarSituacao').value.trim() || null,
      normas: textToNorms($('epiVarNorma').value),
      descricao: $('epiVarDescricao').value.trim() || null,
      utilizacao: $('epiVarCaracteristicas').value.trim() || null,
      vida_util: $('epiVarObservacao').value.trim() || null,
      dimensoes: textToMap($('itemTechDimensoes')?.value),
      manutencao: $('itemTechManutencao')?.value.trim() || null,
      armazenagem: $('itemTechArmazenagem')?.value.trim() || null,
      embalagem: $('itemTechEmbalagem')?.value.trim() || null,
      classificacao_fiscal: $('itemTechClassificacao')?.value.trim() || null,
      especificacoes: textToMap($('itemTechEspecificacoes')?.value),
      fonte: $('itemTechFonte')?.value.trim() || null,
      ativo: true,
      updated_at: new Date().toISOString()
    };

    if ($('epiVariantMsg')) $('epiVariantMsg').textContent = 'Salvando...';

    const {data, error} = await sb
      .from('item_fichas_tecnicas')
      .update(payload)
      .eq('id', activeSheet.id)
      .select()
      .single();

    if (error) {
      if ($('epiVariantMsg')) $('epiVariantMsg').textContent = error.message;
      return;
    }

    activeSheet = data;
    cache.set(epi.id, data);
    renderSheet(data);
    if ($('epiVariantMsg')) $('epiVariantMsg').textContent = 'Ficha técnica salva.';
  }

  function start() {
    $('itemSafetyDossier')?.remove();

    const modal = $('epiDetailModal');
    const save = $('epiVariantSave');
    if (!modal || !save) return;

    save.addEventListener('click', saveTechnicalSheet, true);

    new MutationObserver(() => {
      if (modal.classList.contains('hidden')) {
        syncToken += 1;
        restoreNormalUi();
        return;
      }
      setTimeout(syncMode, 0);
    }).observe(modal, {attributes:true, attributeFilter:['class']});

    const title = $('epiDetailTitle');
    if (title) {
      new MutationObserver(() => {
        if (!modal.classList.contains('hidden')) setTimeout(syncMode, 0);
      }).observe(title, {childList:true, characterData:true, subtree:true});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
