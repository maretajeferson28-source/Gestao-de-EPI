(() => {
  'use strict';

  if (window.__EPI_CA_USER_TOOLS__) return;
  window.__EPI_CA_USER_TOOLS__ = true;

  const byId = (id) => document.getElementById(id);
  const normalizeCa = (value) => String(value || '').replace(/\D+/g, '').replace(/^0+/, '');

  function isAdminUser() {
    try {
      return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true;
    } catch (_) {
      return false;
    }
  }

  function refreshLucide() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
    }
  }

  function ensureStyle() {
    if (document.getElementById('caUserToolsStyle')) return;
    const style = document.createElement('style');
    style.id = 'caUserToolsStyle';
    style.textContent = `
      .ca-view-cadastro-btn{
        margin-top:8px;
        width:max-content;
        background:#181818!important;
        border-color:#3a3a3a!important;
        color:#d8d8d8!important;
        box-shadow:none!important;
      }
      .ca-view-cadastro-btn svg{
        color:#8a8a8a!important;
        stroke:#8a8a8a!important;
      }
      .ca-view-cadastro-btn:hover,
      .ca-view-cadastro-btn:focus-visible{
        background:#181818!important;
        border-color:rgba(255,102,0,.62)!important;
        color:#ff9a3f!important;
        outline:none;
      }
      .ca-view-cadastro-btn:hover svg,
      .ca-view-cadastro-btn:focus-visible svg{
        color:#ff9a3f!important;
        stroke:#ff9a3f!important;
      }
      .ca-view-cadastro-btn[hidden]{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function findRegisteredVariant(ca) {
    const key = normalizeCa(ca);
    if (!key) return null;
    try {
      if (typeof epiVariants === 'undefined' || !Array.isArray(epiVariants)) return null;
      return epiVariants.find((variant) => variant?.ativo !== false && normalizeCa(variant?.ca) === key) || null;
    } catch (_) {
      return null;
    }
  }

  function currentResultCa() {
    const statusText = String(byId('caStageStatus')?.textContent || '').trim();
    if (/aguardando|consultando|não encontrado|erro|indisponível/i.test(statusText)) return '';

    const situation = String(byId('caSituation')?.textContent || '').trim();
    if (!situation || situation === '—') return '';

    const numberText = String(byId('caStageNumber')?.textContent || '');
    const digits = numberText.replace(/\D+/g, '');
    return digits;
  }

  function ensureViewButton() {
    let button = byId('caViewCadastroBtn');
    if (button) return button;

    const copy = document.querySelector('.ca-hero-copy');
    if (!copy) return null;

    button = document.createElement('button');
    button.id = 'caViewCadastroBtn';
    button.type = 'button';
    button.className = 'btn compact ca-view-cadastro-btn';
    button.hidden = true;
    button.innerHTML = '<i data-lucide="folder-open" aria-hidden="true"></i>Ver Cadastro';

    button.addEventListener('click', () => {
      const variantId = button.dataset.variantId || '';
      const epiId = button.dataset.epiId || '';
      if (!variantId || !epiId) return;

      try {
        if (typeof openEpiDetail !== 'function') return;
        openEpiDetail(epiId);
        if (typeof selectedVariantId !== 'undefined') selectedVariantId = variantId;
        if (typeof renderEpiVariantList === 'function') renderEpiVariantList();
        refreshLucide();
      } catch (error) {
        console.error('[CA VER CADASTRO]', error);
      }
    });

    copy.appendChild(button);
    refreshLucide();
    return button;
  }

  function syncBaseTag() {
    const baseInfo = byId('caBaseInfo');
    if (!baseInfo) return;

    const app = byId('epiApp');
    if (!app || app.classList.contains('app-hidden')) return;

    const admin = isAdminUser();
    baseInfo.hidden = !admin;
    if (admin) baseInfo.style.removeProperty('display');
    else baseInfo.style.display = 'none';
  }

  function syncViewButton() {
    const button = ensureViewButton();
    if (!button) return;

    if (isAdminUser()) {
      button.hidden = true;
      button.removeAttribute('data-variant-id');
      button.removeAttribute('data-epi-id');
      return;
    }

    const ca = currentResultCa();
    const variant = findRegisteredVariant(ca);
    if (!variant) {
      button.hidden = true;
      button.removeAttribute('data-variant-id');
      button.removeAttribute('data-epi-id');
      return;
    }

    button.dataset.variantId = String(variant.id || '');
    button.dataset.epiId = String(variant.epi_id || '');
    button.hidden = !(button.dataset.variantId && button.dataset.epiId);
  }

  function syncAll() {
    syncBaseTag();
    syncViewButton();
  }

  function start() {
    ensureStyle();
    ensureViewButton();
    syncAll();

    const app = byId('epiApp');
    if (app) {
      new MutationObserver(syncAll).observe(app, {
        attributes: true,
        attributeFilter: ['class'],
        childList: false,
        subtree: false
      });
    }

    const stage = byId('caStage');
    if (stage) {
      new MutationObserver(syncViewButton).observe(stage, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // Garante sincronização após a carga assíncrona de autorização/dados.
    let checks = 0;
    const timer = setInterval(() => {
      syncAll();
      checks += 1;
      if (checks >= 30) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
