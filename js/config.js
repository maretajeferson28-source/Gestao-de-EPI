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

  if (!document.querySelector('script[data-nfe-module]')) {
    const script = document.createElement('script');
    script.src = 'js/nfe.js';
    script.dataset.nfeModule = 'true';
    document.body.appendChild(script);
  }
})();
