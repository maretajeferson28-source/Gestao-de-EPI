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
      #caBaseInfo.ca-user-cadastro-slot{
        padding:0!important;
        border:0!important;
        background:transparent!important;
        display:flex!important;
        align-items:center;
        justify-content:center;
        width:100%;
      }
      .ca-view-cadastro-btn{
        width:100%!important;
        min-width:0!important;
        min-height:60px!important;
        margin:0!important;
        padding:10px 12px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:flex-start!important;
        gap:10px!important;
        text-align:left!important;
        border-radius:10px!important;
        background:transparent!important;
        border:0!important;
        color:#d8d8d8!important;
        box-shadow:none!important;
      }
      .ca-view-cadastro-icon{
        width:34px;
        height:34px;
        flex:0 0 34px;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        padding:0!important;
        line-height:0!important;
        border-radius:9px;
        border:1px solid #333!important;
        background:#121212!important;
        color:#8d8d8d!important;
        transition:border-color .16s ease,color .16s ease!important;
      }
      .ca-view-cadastro-icon > svg{
        width:17px!important;
        height:17px!important;
        display:block!important;
        margin:0!important;
        padding:0!important;
        position:static!important;
        transform:none!important;
        stroke:currentColor!important;
      }
      .ca-view-cadastro-copy{
        min-width:0;
        display:grid;
        gap:2px;
        flex:1;
      }
      .ca-view-cadastro-copy strong{
        color:#e5e5e5!important;
        font-size:11px!important;
        font-weight:700!important;
        line-height:1.2;
      }
      .ca-view-cadastro-copy small{
        color:#858585!important;
        font-size:9px!important;
        line-height:1.25;
        font-weight:500!important;
      }
      .ca-view-cadastro-btn:hover{
        background:transparent!important;
        border-color:transparent!important;
        color:#d8d8d8!important;
        box-shadow:none!important;
      }
      .ca-view-cadastro-btn:hover .ca-view-cadastro-icon{
        border-color:#ff6600!important;
        color:#ff8a2a!important;
      }
      .ca-view-cadastro-btn:hover .ca-view-cadastro-copy strong{
        color:#e5e5e5!important;
      }
      .ca-view-cadastro-btn:hover .ca-view-cadastro-copy small{
        color:#858585!important;
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
    return numberText.replace(/\D+/g, '');
  }

  function ensureViewButton() {
    let button = byId('caViewCadastroBtn');
    if (button) return button;

    const baseInfo = byId('caBaseInfo');
    if (!baseInfo) return null;

    button = document.createElement('button');
    button.id = 'caViewCadastroBtn';
    button.type = 'button';
    button.className = 'ca-view-cadastro-btn';
    button.hidden = true;
    button.setAttribute('aria-label', 'Abrir cadastro técnico deste C.A.');
    button.innerHTML = `
      <span class="ca-view-cadastro-icon"><i data-lucide="eye" aria-hidden="true"></i></span>
      <span class="ca-view-cadastro-copy">
        <strong>C.A. cadastrado</strong>
        <small>Ver cadastro técnico</small>
      </span>
    `;

    button.addEventListener('click', () => {
      const variantId = button.dataset.variantId || '';
      const epiId = button.dataset.epiId || '';
      if (!variantId || !epiId) return;

      try {
        if (typeof openEpiDetail !== 'function') return;
        openEpiDetail(epiId);
        if (typeof selectedVariantId !== 'undefined') selectedVariantId = variantId;
        if (typeof renderEpiVariantList === 'function') renderEpiVariantList();
        syncVariantActions();
        refreshLucide();
      } catch (error) {
        console.error('[CA VER CADASTRO]', error);
      }
    });

    baseInfo.appendChild(button);
    refreshLucide();
    return button;
  }

  function setOriginalBaseContentVisible(baseInfo, visible) {
    [...baseInfo.children].forEach((child) => {
      if (child.id === 'caViewCadastroBtn') return;
      if (visible) child.style.removeProperty('display');
      else child.style.display = 'none';
    });
  }

  function syncViewButton() {
    const baseInfo = byId('caBaseInfo');
    const button = ensureViewButton();
    if (!baseInfo || !button) return;

    if (isAdminUser()) {
      baseInfo.hidden = false;
      baseInfo.style.removeProperty('display');
      baseInfo.classList.remove('ca-user-cadastro-slot');
      setOriginalBaseContentVisible(baseInfo, true);
      button.hidden = true;
      button.removeAttribute('data-variant-id');
      button.removeAttribute('data-epi-id');
      return;
    }

    setOriginalBaseContentVisible(baseInfo, false);
    baseInfo.classList.add('ca-user-cadastro-slot');

    const ca = currentResultCa();
    const variant = findRegisteredVariant(ca);
    if (!variant || !variant.id || !variant.epi_id) {
      button.hidden = true;
      button.removeAttribute('data-variant-id');
      button.removeAttribute('data-epi-id');
      baseInfo.hidden = true;
      baseInfo.style.display = 'none';
      return;
    }

    button.dataset.variantId = String(variant.id);
    button.dataset.epiId = String(variant.epi_id);
    button.hidden = false;
    baseInfo.hidden = false;
    baseInfo.style.display = 'flex';
  }

  function syncVariantActions() {
    const admin = isAdminUser();
    document.querySelectorAll('[data-variant-edit],[data-variant-delete]').forEach((button) => {
      if (admin) button.style.removeProperty('display');
      else button.style.display = 'none';
    });
  }

  function syncAll() {
    syncViewButton();
    syncVariantActions();
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

    const detail = byId('epiDetailModal');
    if (detail) {
      new MutationObserver(syncVariantActions).observe(detail, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
      });
    }

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
