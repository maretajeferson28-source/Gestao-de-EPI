window.EPI_CONFIG = {
  SUPABASE_URL: "https://aqnrjjllfzirrtwvjjbl.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_zZv85Iuy-nHEkBCFHNoEhw_z9nHEsm3"
};

document.title = "Gestão de EPI";

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
