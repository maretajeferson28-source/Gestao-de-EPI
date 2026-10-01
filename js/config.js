window.EPI_CONFIG = {
  SUPABASE_URL: "https://aqnrjjllfzirrtwvjjbl.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_zZv85Iuy-nHEkBCFHNoEhw_z9nHEsm3"
};

document.title = "Gestão de EPI";

// Identidade visual do app: logo no menu lateral e favicon da aba.
(() => {
  const APP_LOGO = "data:image/png;base64,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";

  const applyBrand = () => {
    let favicon = document.querySelector('link[data-epi-favicon]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/png';
      favicon.dataset.epiFavicon = 'true';
      document.head.appendChild(favicon);
    }
    favicon.href = APP_LOGO;

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

// Complemento de consulta de C.A. para usuários comuns.
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
}, { once: true });
