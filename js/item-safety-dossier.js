(() => {
  'use strict';

  if (window.__EPI_ITEM_SAFETY_DOSSIER__) return;
  window.__EPI_ITEM_SAFETY_DOSSIER__ = true;

  const $ = (id) => document.getElementById(id);

  const TECHNICAL_ITEM_IDS = new Set([
    'd840cd3e-c5a2-4c61-9940-9142343cabbe', // Calço de Borracha
    '9ecf96b8-0812-444a-b831-6dd83064411f'  // Cones de Sinalização
  ]);

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

  const normalPlaceholders = {
    epiVarCa: 'Ex.: 39707',
    epiVarFabricante: 'Fabricante',
    epiVarCnpj: 'CNPJ',
    epiVarMarca: 'Marca',
    epiVarReferencia: 'Referência',
    epiVarSituacao: 'Válido / Vencido',
    epiVarNorma: 'Norma aplicável',
    epiVarDescricao: 'Descrição do registro CAEPI',
    epiVarCaracteristicas: 'Material, cor, tamanho, proteção, aplicação, diferenciais...',
    epiVarPreco: '0,00',
    epiVarFornecedor: 'Fornecedor / distribuidor',
    epiVarObservacao: 'Observações de compra, uso ou substituição'
  };

  // Mesma estrutura do cadastro de C.A.; somente os campos mudam de significado.
  const technicalLabels = {
    epiVarCa: 'Código / identificação',
    epiVarFabricante: 'Fabricante',
    epiVarCnpj: 'Peso',
    epiVarMarca: 'Material',
    epiVarReferencia: 'Referência / Modelo',
    epiVarValidade: 'Validade',
    epiVarSituacao: 'Vida útil',
    epiVarNorma: 'Norma(s) / requisito(s)',
    epiVarDescricao: 'Descrição técnica',
    epiVarCaracteristicas: 'Dimensões / especificações técnicas / classificação fiscal',
    epiVarPreco: 'Preço (R$)',
    epiVarFornecedor: 'Fornecedor',
    epiVarObservacao: 'Utilização / manutenção / armazenagem / embalagem'
  };

  const technicalPlaceholders = {
    epiVarCa: 'Ex.: CONE-75',
    epiVarFabricante: 'Ex.: Plastcor',
    epiVarCnpj: 'Ex.: 3,4 kg',
    epiVarMarca: 'Ex.: PVC flexível',
    epiVarReferencia: 'Ex.: Cone NBR 15.071',
    epiVarSituacao: 'Ex.: 3 anos',
    epiVarNorma: 'Ex.: ABNT NBR 15071:2022',
    epiVarDescricao: 'Descreva o item conforme a ficha técnica',
    epiVarCaracteristicas: 'Ex.: 700 mm de altura; base 400 x 400 mm; NCM 39269090',
    epiVarPreco: '0,00',
    epiVarFornecedor: 'Fornecedor / distribuidor',
    epiVarObservacao: 'Informe utilização, manutenção, armazenagem e embalagem'
  };

  function fieldWrap(id) {
    return $(id)?.closest('.field') || null;
  }

  function setLabel(id, text) {
    const label = fieldWrap(id)?.querySelector('label');
    if (label) label.textContent = text;
  }

  function applyLabels(labels) {
    Object.entries(labels).forEach(([id, text]) => setLabel(id, text));
  }

  function applyPlaceholders(placeholders) {
    Object.entries(placeholders).forEach(([id, text]) => {
      const field = $(id);
      if (field) field.placeholder = text;
    });
  }

  function currentEpi() {
    try {
      return typeof selectedEpi !== 'undefined' ? selectedEpi : null;
    } catch (_) {
      return null;
    }
  }

  function isTechnicalItem(epi) {
    if (!epi) return false;
    if (TECHNICAL_ITEM_IDS.has(epi.id)) return true;

    const name = String(epi.nome || '').toLocaleLowerCase('pt-BR');
    return name.includes('cone') || name.includes('calço') || name.includes('calco');
  }

  function syncLabels() {
    const modal = $('epiDetailModal');
    if (!modal || modal.classList.contains('hidden')) {
      applyLabels(normalLabels);
      applyPlaceholders(normalPlaceholders);
      return;
    }

    const epi = currentEpi();
    const technical = isTechnicalItem(epi);
    applyLabels(technical ? technicalLabels : normalLabels);
    applyPlaceholders(technical ? technicalPlaceholders : normalPlaceholders);

    // Intencionalmente não altera nada além dos campos:
    // botões, seletor, comparativo, anexador de imagem, layout e ações continuam iguais.
  }

  function start() {
    const modal = $('epiDetailModal');
    if (!modal) return;

    new MutationObserver(() => {
      setTimeout(syncLabels, 0);
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });

    const title = $('epiDetailTitle');
    if (title) {
      new MutationObserver(() => {
        if (!modal.classList.contains('hidden')) setTimeout(syncLabels, 0);
      }).observe(title, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
