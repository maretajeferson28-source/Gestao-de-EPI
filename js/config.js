window.EPI_CONFIG = {
  SUPABASE_URL: "https://jrzviiaywfjaawwkwgze.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_6dGPVd27-e8WkjMYOjaByQ_lXqp7Ool",
  // Sem o serviço realtime no Railway: a tela recarrega após cada gravação.
  REALTIME: false,
  // Cloudflare Turnstile no login (chave pública do widget "Gestão de EPI - Login").
  TURNSTILE_SITE_KEY: "0x4AAAAAAF-suAbxUXKjNMbD"
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

// Leitura de NF-e e conferência antes do salvamento atômico no Supabase.
(() => {
  if (!document.querySelector('link[data-nfe-module]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/nfe.css?v=20261002-stock-1';
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
    script.src = 'js/nfe.js?v=20261019-1';
    script.dataset.nfeModule = 'true';
    document.body.appendChild(script);
  }

  if (!document.querySelector('script[data-nfe-barcode]')) {
    const barcodeScript = document.createElement('script');
    barcodeScript.src = 'js/nfe-barcode.js';
    barcodeScript.dataset.nfeBarcode = 'true';
    document.body.appendChild(barcodeScript);
  }

  if (!document.querySelector('script[data-nfe-stock-reader]')) {
    const stockReaderScript = document.createElement('script');
    stockReaderScript.src = 'js/nfe-stock-reader.js?v=20261019-1';
    stockReaderScript.dataset.nfeStockReader = 'true';
    document.body.appendChild(stockReaderScript);
  }
})();

// Complementos visuais e de consulta.
window.addEventListener('load', () => {
  if (!document.querySelector('script[data-ca-user-tools]')) {
    const script = document.createElement('script');
    script.src = 'js/ca-user-tools.js?v=20261017-ci';
    script.dataset.caUserTools = 'true';
    document.body.appendChild(script);
  }

  if (!document.querySelector('script[data-dashboard-admin-colors]')) {
    const chartScript = document.createElement('script');
    chartScript.src = 'js/dashboard-admin-colors.js';
    chartScript.dataset.dashboardAdminColors = 'true';
    document.body.appendChild(chartScript);
  }

  if (!document.querySelector('script[data-stock-nav]')) {
    const stockNavScript = document.createElement('script');
    stockNavScript.src = 'js/stock-nav.js?v=20261105-1';
    stockNavScript.dataset.stockNav = 'true';
    document.body.appendChild(stockNavScript);
  }

  if (!document.querySelector('script[data-stock-entry]')) {
    const stockEntryScript = document.createElement('script');
    stockEntryScript.src = 'js/stock-entry.js?v=20261023-4';
    stockEntryScript.dataset.stockEntry = 'true';
    document.body.appendChild(stockEntryScript);
  }

  if (!document.querySelector('script[data-autocompletar]')) {
    const autocompletarScript = document.createElement('script');
    autocompletarScript.src = 'js/autocompletar.js?v=20261030-1';
    autocompletarScript.dataset.autocompletar = 'true';
    document.body.appendChild(autocompletarScript);
  }

  if (!document.querySelector('script[data-fila]')) {
    const filaScript = document.createElement('script');
    filaScript.src = 'js/fila.js?v=20261030-2';
    filaScript.dataset.fila = 'true';
    document.body.appendChild(filaScript);
  }

  if (!document.querySelector('script[data-programar]')) {
    const programarScript = document.createElement('script');
    programarScript.src = 'js/programar.js?v=20261111-20';
    programarScript.dataset.programar = 'true';
    document.body.appendChild(programarScript);
  }

  if (!document.querySelector('script[data-os-folha]')) {
    const osFolhaScript = document.createElement('script');
    osFolhaScript.src = 'js/os-folha.js?v=20261106-17';
    osFolhaScript.dataset.osFolha = 'true';
    document.body.appendChild(osFolhaScript);
  }

  if (!document.querySelector('script[data-pendencias]')) {
    const pendenciasScript = document.createElement('script');
    pendenciasScript.src = 'js/pendencias.js?v=20261106-1';
    pendenciasScript.dataset.pendencias = 'true';
    document.body.appendChild(pendenciasScript);
  }

  if (!document.querySelector('script[data-dash-hero]')) {
    const dashHeroScript = document.createElement('script');
    dashHeroScript.src = 'js/dash-hero.js?v=20261110-11';
    dashHeroScript.dataset.dashHero = 'true';
    document.body.appendChild(dashHeroScript);
  }
  if (!document.querySelector('script[data-ca-ficha]')) {
    const caFichaScript = document.createElement('script');
    caFichaScript.src = 'js/ca-ficha.js?v=20261110-12';
    caFichaScript.dataset.caFicha = 'true';
    document.body.appendChild(caFichaScript);
  }
  if (!document.querySelector('script[data-dash-kpis]')) {
    const dashKpisScript = document.createElement('script');
    dashKpisScript.src = 'js/dash-kpis.js?v=20261113-2';
    dashKpisScript.dataset.dashKpis = 'true';
    document.body.appendChild(dashKpisScript);
  }
  if (!document.querySelector('script[data-economia]')) {
    const economiaScript = document.createElement('script');
    economiaScript.src = 'js/economia.js?v=20261113-1';
    economiaScript.dataset.economia = 'true';
    document.body.appendChild(economiaScript);
  }
  if (!document.querySelector('script[data-moldura]')) {
    const molduraScript = document.createElement('script');
    molduraScript.src = 'js/moldura.js?v=20261110-1';
    molduraScript.dataset.moldura = 'true';
    document.body.appendChild(molduraScript);
  }
  if (!document.querySelector('script[data-menu-grupos]')) {
    const menuGruposScript = document.createElement('script');
    menuGruposScript.src = 'js/menu-grupos.js?v=20261110-1';
    menuGruposScript.dataset.menuGrupos = 'true';
    document.body.appendChild(menuGruposScript);
  }

  if (!document.querySelector('script[data-ciepi]')) {
    const ciepiScript = document.createElement('script');
    ciepiScript.src = 'js/ciepi.js?v=20261017-1';
    ciepiScript.dataset.ciepi = 'true';
    document.body.appendChild(ciepiScript);
  }

  if (!document.querySelector('script[data-mobile-preview]')) {
    const mobilePreviewScript = document.createElement('script');
    mobilePreviewScript.src = 'js/mobile-preview.js?v=20261019-4';
    mobilePreviewScript.dataset.mobilePreview = 'true';
    document.body.appendChild(mobilePreviewScript);
  }

  if (!document.querySelector('script[data-termo]')) {
    const termoScript = document.createElement('script');
    termoScript.src = 'js/termo.js?v=20261113-1';
    termoScript.dataset.termo = 'true';
    document.body.appendChild(termoScript);
  }

  if (!document.querySelector('script[data-termo-captura]')) {
    const termoCapturaScript = document.createElement('script');
    termoCapturaScript.src = 'js/termo-captura.js?v=20261112-1';
    termoCapturaScript.dataset.termoCaptura = 'true';
    document.body.appendChild(termoCapturaScript);
  }

  if (!document.querySelector('script[data-colab-painel]')) {
    const colabPainelScript = document.createElement('script');
    colabPainelScript.src = 'js/colab-painel.js?v=20261113-1';
    colabPainelScript.dataset.colabPainel = 'true';
    document.body.appendChild(colabPainelScript);
  }

  if (!document.querySelector('script[data-historico]')) {
    const historicoScript = document.createElement('script');
    historicoScript.src = 'js/historico-colab.js?v=20261112-3';
    historicoScript.dataset.historico = 'true';
    document.body.appendChild(historicoScript);
  }

  if (!document.querySelector('script[data-face]')) {
    const faceScript = document.createElement('script');
    faceScript.src = 'js/face-compare.js?v=20261019-1';
    faceScript.dataset.face = 'true';
    document.body.appendChild(faceScript);
  }
}, { once: true });
