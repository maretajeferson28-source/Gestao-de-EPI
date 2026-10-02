(() => {
  'use strict';

  if (window.__EPI_ITEM_SAFETY_SAVE__) return;
  window.__EPI_ITEM_SAFETY_SAVE__ = true;

  const $ = (id) => document.getElementById(id);
  const FILTER_VOGA_ID = 'bcba3fc9-725d-45c3-a19c-67854a7cca45';
  const TECHNICAL_IDS = new Set([
    'd840cd3e-c5a2-4c61-9940-9142343cabbe',
    '9ecf96b8-0812-444a-b831-6dd83064411f',
    FILTER_VOGA_ID
  ]);

  function currentEpiSafe() {
    try { return typeof selectedEpi !== 'undefined' ? selectedEpi : null; }
    catch (_) { return null; }
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isTechnicalWithoutCa(epi) {
    if (!epi) return false;
    if (TECHNICAL_IDS.has(epi.id)) return true;
    const category = normalize(epi.categoria);
    return category === 'epc' || category.includes('dispositivo de seguranca');
  }

  function isFilterVoga(epi) {
    return !!epi && epi.id === FILTER_VOGA_ID;
  }

  function isAdminSafe() {
    try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; }
    catch (_) { return false; }
  }

  function db() {
    try { return typeof sb !== 'undefined' ? sb : null; }
    catch (_) { return null; }
  }

  function variantsSafe() {
    try { return typeof epiVariants !== 'undefined' && Array.isArray(epiVariants) ? epiVariants : null; }
    catch (_) { return null; }
  }

  function editingIdSafe() {
    try { return typeof editingVariantId !== 'undefined' ? editingVariantId : null; }
    catch (_) { return null; }
  }

  function sanitizeIdentifier(value) {
    return String(value || '')
      .replace(/[^\p{L}\p{N}._\-/ ]/gu, '')
      .replace(/\s+/g, ' ')
      .trimStart()
      .slice(0, 80);
  }

  function value(id) {
    return String($(id)?.value || '').trim();
  }

  function nullable(id) {
    const v = value(id);
    return v || null;
  }

  function setMessage(text, error = false) {
    const msg = $('epiVariantMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.classList.toggle('error', !!error);
  }

  function syncTechnicalUi() {
    const epi = currentEpiSafe();
    if (!isTechnicalWithoutCa(epi)) return;

    const save = $('epiVariantSave');
    if (save) save.innerHTML = '<i data-lucide="save" aria-hidden="true"></i>Salvar registro';

    const selectorValue = $('epiCaSelectorValue');
    const selected = (() => {
      try {
        const rows = variantsSafe()?.filter((v) => v.epi_id === epi.id && v.ativo !== false) || [];
        const selectedId = typeof selectedVariantId !== 'undefined' ? selectedVariantId : null;
        return rows.find((v) => v.id === selectedId) || rows[0] || null;
      } catch (_) { return null; }
    })();

    if (selectorValue) {
      if (selected) {
        const maker = String(selected.fabricante || 'Fabricante não informado').trim();
        selectorValue.innerHTML = `<strong>Código ${String(selected.ca || '—')}</strong><small>${maker}</small>`;
      } else {
        selectorValue.innerHTML = '<strong>Nenhum registro</strong><small>Sem registro técnico vinculado</small>';
      }
    }

    const list = $('epiVariantList');
    if (list) {
      const kicker = list.querySelector('.epi-dossier-kicker');
      if (kicker) kicker.textContent = 'PRONTUÁRIO TÉCNICO';

      const title = list.querySelector('.epi-dossier-head h3');
      if (title && selected) title.textContent = `Código ${selected.ca || '—'}`;

      const state = list.querySelector('.epi-variant-state');
      if (state) {
        state.textContent = 'VÁLIDO';
        state.classList.remove('invalid', 'neutral');
        state.classList.add('valid');
      }

      const source = list.querySelector('.epi-dossier-source span');
      if (source) source.textContent = 'Dados técnicos e comerciais cadastrados para este item.';
    }

    document.querySelectorAll('[data-epi-id]').forEach((card) => {
      if (card.dataset.epiId !== epi.id) return;
      const count = variantsSafe()?.filter((v) => v.epi_id === epi.id && v.ativo !== false).length || 0;
      card.classList.remove('no-ca', 'has-ca', 'has-invalid');
      if (count) card.classList.add('has-valid');
      const textNodes = card.querySelectorAll('*');
      textNodes.forEach((node) => {
        if (node.children.length) return;
        const t = String(node.textContent || '').trim();
        if (/^\d+\s+C\.A\.?s?$/i.test(t)) node.textContent = `${count} ${count === 1 ? 'registro' : 'registros'}`;
      });
    });

    try { if (typeof refreshIcons === 'function') refreshIcons(); } catch (_) {}
  }

  async function saveTechnicalVariant() {
    const epi = currentEpiSafe();
    const client = db();
    if (!isTechnicalWithoutCa(epi) || !client || !isAdminSafe()) return;

    const identifier = sanitizeIdentifier($('epiVarCa')?.value || '');
    if (!identifier) {
      setMessage('Informe o código / identificação.', true);
      $('epiVarCa')?.focus();
      return;
    }
    $('epiVarCa').value = identifier;

    const list = variantsSafe();
    const editId = editingIdSafe();
    const previous = editId && list ? list.find((v) => v.id === editId) || null : null;

    const payload = {
      epi_id: epi.id,
      ca: identifier,
      fabricante: nullable('epiVarFabricante'),
      cnpj: nullable('epiVarCnpj'),
      marca: nullable('epiVarMarca'),
      referencia: nullable('epiVarReferencia'),
      descricao: nullable('epiVarDescricao'),
      data_validade: value('epiVarValidade') || null,
      situacao: nullable('epiVarSituacao'),
      norma: nullable('epiVarNorma'),
      caracteristicas: nullable('epiVarCaracteristicas'),
      preco: value('epiVarPreco') === '' ? null : Number(value('epiVarPreco').replace(',', '.')),
      comparativo_status: $('epiVarComparativoAtual')?.checked ? 'atual' : ($('epiVarComparativoPassada')?.checked ? 'passada' : null),
      fornecedor: nullable('epiVarFornecedor'),
      unidade: 'un',
      observacao: nullable('epiVarObservacao'),
      ativo: true,
      origem: 'Cadastro técnico Gestão EPI',
      updated_at: new Date().toISOString()
    };

    if (payload.preco !== null && !Number.isFinite(payload.preco)) payload.preco = null;

    const saveBtn = $('epiVariantSave');
    if (saveBtn) saveBtn.disabled = true;
    setMessage('Salvando registro técnico...');

    try {
      let result;
      if (editId) {
        result = await client.from('epi_variantes').update(payload).eq('id', editId).select('*').single();
      } else {
        result = await client.from('epi_variantes').insert(payload).select('*').single();
      }
      if (result.error) throw result.error;

      let saved = result.data;
      try {
        if (typeof persistVariantImage === 'function') saved = await persistVariantImage(saved, previous);
      } catch (imageError) {
        console.error('[TECHNICAL ITEM IMAGE SAVE]', imageError);
        setMessage(`Registro salvo, mas a imagem falhou: ${imageError.message || imageError}`, true);
      }

      if (list) {
        const idx = list.findIndex((v) => v.id === saved.id);
        if (idx >= 0) list.splice(idx, 1, saved);
        else list.push(saved);
      }

      try { selectedVariantId = saved.id; } catch (_) {}
      try { if (typeof clearEpiVariantForm === 'function') clearEpiVariantForm(); } catch (_) {}
      try { selectedVariantId = saved.id; } catch (_) {}
      try { if (typeof renderEpiVariantList === 'function') renderEpiVariantList(); } catch (_) {}
      try { if (typeof renderEpis === 'function') renderEpis(); } catch (_) {}

      setMessage('Registro técnico salvo.');
      setTimeout(syncTechnicalUi, 0);
    } catch (error) {
      console.error('[TECHNICAL ITEM SAVE]', error);
      const duplicate = String(error?.code || '') === '23505';
      setMessage(duplicate ? 'Já existe um registro com esse código para este item.' : `Erro ao salvar: ${error.message || error}`, true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      setTimeout(syncTechnicalUi, 0);
    }
  }

  function bindCaptureHandlers() {
    document.addEventListener('input', (event) => {
      if (event.target?.id !== 'epiVarCa') return;
      if (!isTechnicalWithoutCa(currentEpiSafe())) return;
      event.stopImmediatePropagation();
      const cleaned = sanitizeIdentifier(event.target.value);
      if (event.target.value !== cleaned) event.target.value = cleaned;
    }, true);

    document.addEventListener('click', (event) => {
      const save = event.target?.closest?.('#epiVariantSave');
      if (!save || !isTechnicalWithoutCa(currentEpiSafe())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      saveTechnicalVariant();
    }, true);
  }

  function start() {
    bindCaptureHandlers();

    const modal = $('epiDetailModal');
    if (modal) {
      new MutationObserver(() => setTimeout(syncTechnicalUi, 0))
        .observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    const list = $('epiVariantList');
    if (list) {
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          syncTechnicalUi();
        });
      }).observe(list, { childList: true, subtree: true });
    }

    setTimeout(syncTechnicalUi, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
