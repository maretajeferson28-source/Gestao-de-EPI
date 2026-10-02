(() => {
  'use strict';

  if (window.__EPI_ITEM_SAFETY_DOSSIER__) return;
  window.__EPI_ITEM_SAFETY_DOSSIER__ = true;

  const $ = (id) => document.getElementById(id);
  const cache = new Map();
  let technicalMode = false;
  let activeSheet = null;
  let activeEpiId = null;
  let syncToken = 0;

  const normalLabels = {
    epiVarCa: 'C.A.',
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

  const technicalLabels = {
    epiVarCa: 'Código / identificação',
    epiVarFabricante: 'Fabricante',
    epiVarCnpj: 'Material',
    epiVarMarca: 'Peso',
    epiVarReferencia: 'Referência / Modelo',
    epiVarValidade: 'Validade',
    epiVarSituacao: 'Vida útil',
    epiVarNorma: 'Norma(s) aplicável(is)',
    epiVarDescricao: 'Descrição técnica',
    epiVarCaracteristicas: 'Dimensões / especificações técnicas',
    epiVarPreco: 'Preço (R$)',
    epiVarFornecedor: 'Fornecedor',
    epiVarObservacao: 'Utilização / manutenção / armazenagem'
  };

  function fieldWrap(id) {
    return $(id)?.closest('.field') || null;
  }

  function setLabel(id, text) {
    const label = fieldWrap(id)?.querySelector('label');
    if (label) label.textContent = text;
  }

  function applyLabels(map) {
    Object.entries(map).forEach(([id, label]) => setLabel(id, label));
  }

  function currentEpi() {
    try { return typeof selectedEpi !== 'undefined' ? selectedEpi : null; }
    catch (_) { return null; }
  }

  function isAdmin() {
    try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; }
    catch (_) { return false; }
  }

  function clearTechnicalFields() {
    [
      'epiVarCa','epiVarFabricante','epiVarCnpj','epiVarMarca','epiVarReferencia',
      'epiVarValidade','epiVarSituacao','epiVarNorma','epiVarDescricao',
      'epiVarCaracteristicas','epiVarPreco','epiVarFornecedor','epiVarObservacao'
    ].forEach((id) => { if ($(id)) $(id).value = ''; });

    if ($('epiVarComparativoPassada')) $('epiVarComparativoPassada').checked = false;
    if ($('epiVarComparativoAtual')) $('epiVarComparativoAtual').checked = false;
    if ($('epiVariantMsg')) $('epiVariantMsg').textContent = '';
  }

  function restoreCaMode() {
    technicalMode = false;
    activeSheet = null;
    activeEpiId = null;
    applyLabels(normalLabels);
  }

  function normsFromText(value) {
    return String(value || '')
      .split(/\r?\n|;|•/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function specsFromText(value) {
    const text = String(value || '').trim();
    return text ? { texto: text } : {};
  }

  async function fetchSheet(epiId, force = false) {
    if (!force && cache.has(epiId)) return cache.get(epiId);

    try {
      const { data, error } = await sb
        .from('item_fichas_tecnicas')
        .select('id,epi_id,tipo,titulo,fabricante,descricao,material,peso,dimensoes,normas,utilizacao,validade,vida_util,manutencao,armazenagem,embalagem,classificacao_fiscal,especificacoes,fonte,preco,fornecedor,observacao,comparativo_status,imagem_path,imagem_nome,imagem_updated_at,ativo')
        .eq('epi_id', epiId)
        .eq('ativo', true)
        .maybeSingle();

      if (error) throw error;
      cache.set(epiId, data || null);
      return data || null;
    } catch (error) {
      console.error('[ITEM TECHNICAL MODE]', error);
      return null;
    }
  }

  async function syncMode() {
    const modal = $('epiDetailModal');
    const epi = currentEpi();
    const token = ++syncToken;

    if (!modal || modal.classList.contains('hidden') || !epi?.id) {
      restoreCaMode();
      return;
    }

    const sheet = await fetchSheet(epi.id);
    if (token !== syncToken) return;

    if (!sheet) {
      restoreCaMode();
      return;
    }

    technicalMode = true;
    activeSheet = sheet;
    activeEpiId = epi.id;

    // Mantém exatamente a estrutura, os controles e os botões já existentes.
    // Para itens sem C.A. mudamos somente o significado dos campos.
    applyLabels(technicalLabels);

    // A ficha começa vazia: nenhum dado da ficha do fabricante é injetado automaticamente.
    clearTechnicalFields();
  }

  async function uploadImageIfSelected(epiId, current) {
    const input = $('epiVariantImageInput');
    const file = input?.files?.[0];
    if (!file) return {
      imagem_path: current?.imagem_path || null,
      imagem_nome: current?.imagem_nome || null,
      imagem_updated_at: current?.imagem_updated_at || null
    };

    const allowed = ['image/jpeg','image/png','image/webp'];
    if (!allowed.includes(file.type)) throw new Error('Imagem inválida. Use JPG, PNG ou WEBP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem ultrapassa 5 MB.');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `item-fichas/${epiId}/modelo-${Date.now()}.${ext}`;

    const { error: uploadError } = await sb.storage.from('epi-imagens').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });
    if (uploadError) throw uploadError;

    if (current?.imagem_path && current.imagem_path !== path) {
      const { error: removeError } = await sb.storage.from('epi-imagens').remove([current.imagem_path]);
      if (removeError) console.warn('[ITEM TECH IMAGE REMOVE]', removeError);
    }

    return {
      imagem_path: path,
      imagem_nome: file.name,
      imagem_updated_at: new Date().toISOString()
    };
  }

  async function saveTechnicalSheet(event) {
    if (!technicalMode || !activeEpiId || !isAdmin()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const epi = currentEpi();
    if (!epi) return;

    const msg = $('epiVariantMsg');
    if (msg) msg.textContent = 'Salvando...';

    try {
      const image = await uploadImageIfSelected(epi.id, activeSheet);
      const payload = {
        epi_id: epi.id,
        tipo: epi.categoria || activeSheet?.tipo || 'ITEM',
        titulo: $('epiVarReferencia')?.value.trim() || epi.nome,
        fabricante: $('epiVarFabricante')?.value.trim() || null,
        descricao: $('epiVarDescricao')?.value.trim() || null,
        material: $('epiVarCnpj')?.value.trim() || null,
        peso: $('epiVarMarca')?.value.trim() || null,
        dimensoes: {},
        normas: normsFromText($('epiVarNorma')?.value),
        utilizacao: null,
        validade: $('epiVarValidade')?.value || null,
        vida_util: $('epiVarSituacao')?.value.trim() || null,
        manutencao: null,
        armazenagem: null,
        embalagem: null,
        classificacao_fiscal: null,
        especificacoes: specsFromText($('epiVarCaracteristicas')?.value),
        fonte: null,
        preco: $('epiVarPreco')?.value === '' ? null : Number($('epiVarPreco')?.value),
        fornecedor: $('epiVarFornecedor')?.value.trim() || null,
        observacao: $('epiVarObservacao')?.value.trim() || null,
        comparativo_status: $('epiVarComparativoAtual')?.checked ? 'atual' : ($('epiVarComparativoPassada')?.checked ? 'passada' : null),
        imagem_path: image.imagem_path,
        imagem_nome: image.imagem_nome,
        imagem_updated_at: image.imagem_updated_at,
        ativo: true,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await sb
        .from('item_fichas_tecnicas')
        .upsert(payload, { onConflict: 'epi_id' })
        .select()
        .single();

      if (error) throw error;
      activeSheet = data;
      cache.set(epi.id, data);
      if (msg) msg.textContent = 'Ficha técnica salva.';
    } catch (error) {
      console.error('[ITEM TECH SAVE]', error);
      if (msg) msg.textContent = error.message || String(error);
    }
  }

  function start() {
    const modal = $('epiDetailModal');
    const save = $('epiVariantSave');
    if (!modal || !save) return;

    save.addEventListener('click', saveTechnicalSheet, true);

    new MutationObserver(() => {
      if (modal.classList.contains('hidden')) {
        restoreCaMode();
        return;
      }
      setTimeout(syncMode, 0);
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });

    const title = $('epiDetailTitle');
    if (title) {
      new MutationObserver(() => {
        if (!modal.classList.contains('hidden')) setTimeout(syncMode, 0);
      }).observe(title, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
