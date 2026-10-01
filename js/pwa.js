(() => {
  'use strict';
  // PWA: não intercepta autenticação, banco, uploads nem respostas privadas.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .catch((error) => console.warn('[PWA] Registro indisponível:', error));
    }, { once: true });
  }
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let installPrompt = null;
  const buttons = [];
  const help = document.createElement('div');
  help.className = 'mobile-only mobile-install-dialog';
  help.hidden = true;
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-modal', 'true');
  help.setAttribute('aria-labelledby', 'mobileInstallTitle');
  help.innerHTML = '<div><h2 id="mobileInstallTitle">Instalar Gestão de EPI</h2><p>No iPhone, abra no Safari, toque em <strong>Compartilhar</strong> e em <strong>Adicionar à Tela de Início</strong>.</p><p>No Android, abra o menu do Chrome e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p><button class="btn primary" type="button">Entendi</button></div>';
  document.body.appendChild(help);
  let helpTrigger;
  const closeHelp = () => { help.hidden = true; helpTrigger?.focus(); };
  help.querySelector('button').addEventListener('click', closeHelp);
  help.addEventListener('click', (event) => { if (event.target === help) closeHelp(); });
  help.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeHelp();
    if (event.key === 'Tab') { event.preventDefault(); help.querySelector('button').focus(); }
  });
  ['.auth-card', '.sidebar'].forEach((selector) => {
    const target = document.querySelector(selector);
    if (!target) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-only btn mobile-install';
    button.textContent = 'Instalar aplicativo';
    button.hidden = standalone();
    button.addEventListener('click', async () => {
      if (installPrompt) {
        const prompt = installPrompt;
        installPrompt = null;
        await prompt.prompt();
        await prompt.userChoice;
      } else {
        helpTrigger = button;
        help.hidden = false;
        help.querySelector('button').focus();
      }
    });
    target.appendChild(button);
    buttons.push(button);
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    if (matchMedia('(max-width:720px)').matches) event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => { buttons.forEach((button) => { button.hidden = true; }); });
  matchMedia('(display-mode: standalone)').addEventListener('change', () => { buttons.forEach((button) => { button.hidden = standalone(); }); });
  const banner = document.createElement('div');
  banner.className = 'mobile-only mobile-connection';
  banner.setAttribute('role', 'status');
  banner.textContent = 'Sem conexão. Consultas e alterações precisam de internet.';
  const topbar = document.querySelector('.topbar');
  topbar?.after(banner);
  const connection = () => { banner.hidden = navigator.onLine; };
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);
  connection();
})();
