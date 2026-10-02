window.EPI_CONFIG = {
  SUPABASE_URL: "https://aqnrjjllfzirrtwvjjbl.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_zZv85Iuy-nHEkBCFHNoEhw_z9nHEsm3"
};

document.title = "Gestão de EPI";

// Hover contextual dos botões do anexador de imagem.
(() => {
  if (!document.querySelector('link[data-variant-image-actions]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/variant-image-actions.css?v=20261002-2';
    link.dataset.variantImageActions = 'true';
    document.head.appendChild(link);
  }
})();

// Identidade visual do app: logo no menu lateral e favicon da aba.
(() => {
  const APP_LOGO = "/assets/app-brand/logo.png?v=20261001";

  const applyBrand = () => {
    let favicon = document.querySelector('link[data-epi-favicon]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/png';
      favicon.dataset.epiFavicon = 'true';
      document.head.appendChild(favicon);
    }
    favicon.href = '/assets/app-brand/favicon-32.png?v=20261001';

    if (!document.getElementById('epiBrandStyle')) {
      const style = document.createElement('style');
      style.id = 'epiBrandStyle';
      style.textContent = `
        .brand-badge .shield.app-brand-logo{
          width:38px!important;
          height:38px!important;
          border:0!important;
          border-radius:0!important;
          background:transparent!important;
          color:inherit!important;
          overflow:visible!important;
          display:grid!important;
          place-items:center!important;
        }
        .brand-badge .shield.app-brand-logo img{
          display:block!important;
          width:38px!important;
          height:38px!important;
          object-fit:contain!important;
        }
      `;
      document.head.appendChild(style);
    }

    const shield = document.querySelector('.brand-badge .shield');
    if (shield && !shield.classList.contains('app-brand-logo')) {
      shield.classList.add('app-brand-logo');
      shield.innerHTML = `<img src="${APP_LOGO}" alt="Logo Gestão de EPI">`;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBrand, { once: true });
  } else {
    applyBrand();
  }
})();

// Módulo experimental de leitura de XML de NF-e.
(() => {
  if (!document.querySelector('link[data-nfe-module]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/nfe.css';
    link.dataset.nfeModule = 'true';
    document.head.appendChild(link);
  }

  if (!document.querySelector('link[data-nfe-icon-style]')) {
    const iconLink = document.createElement('link');
    iconLink.rel = 'stylesheet';
    iconLink.href = 'css/nfe-icon.css';
    iconLink.dataset.nfeIconStyle = 'true';
    document.head.appendChild(iconLink);
  }

  if (!document.querySelector('script[data-nfe-module]')) {
    const script = document.createElement('script');
    script.src = 'js/nfe.js';
    script.dataset.nfeModule = 'true';
    document.body.appendChild(script);
  }

  if (!document.querySelector('script[data-nfe-barcode]')) {
    const barcodeScript = document.createElement('script');
    barcodeScript.src = 'js/nfe-barcode.js';
    barcodeScript.dataset.nfeBarcode = 'true';
    document.body.appendChild(barcodeScript);
  }
})();

// Complementos visuais e de consulta.
window.addEventListener('load', () => {
  if (!document.querySelector('script[data-ca-user-tools]')) {
    const script = document.createElement('script');
    script.src = 'js/ca-user-tools.js';
    script.dataset.caUserTools = 'true';
    document.body.appendChild(script);
  }

  if (!document.querySelector('script[data-dashboard-admin-colors]')) {
    const chartScript = document.createElement('script');
    chartScript.src = 'js/dashboard-admin-colors.js';
    chartScript.dataset.dashboardAdminColors = 'true';
    document.body.appendChild(chartScript);
  }

  if (!document.querySelector('script[data-dashboard-spend-order]')) {
    const spendOrderScript = document.createElement('script');
    spendOrderScript.src = 'js/dashboard-spend-order.js?v=20261001-2';
    spendOrderScript.dataset.dashboardSpendOrder = 'true';
    document.body.appendChild(spendOrderScript);
  }

  if (!document.querySelector('script[data-item-safety-dossier]')) {
    const itemDossierScript = document.createElement('script');
    itemDossierScript.src = 'js/item-safety-dossier.js?v=20261002-4';
    itemDossierScript.dataset.itemSafetyDossier = 'true';
    document.body.appendChild(itemDossierScript);
  }

  if (!document.querySelector('script[data-stock-nav]')) {
    const stockNavScript = document.createElement('script');
    stockNavScript.src = 'js/stock-nav.js?v=20261002-2';
    stockNavScript.dataset.stockNav = 'true';
    document.body.appendChild(stockNavScript);
  }
}, { once: true });
