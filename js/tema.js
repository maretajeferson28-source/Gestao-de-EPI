// TESTE de tema claro no computador: botão ☀/☾ na barra de cima. O claro é um
// filtro que inverte as cores do app inteiro e gira o tom de volta (o laranja
// continua laranja); fotos, vídeos e a folha da OS são desinvertidos. Fica
// guardado no aparelho. No celular não aparece e não vale.
(() => {
  'use strict';

  const CHAVE = 'epi-tema-v1';
  const raiz = document.documentElement;
  let claro = false;
  try { claro = localStorage.getItem(CHAVE) === 'claro'; } catch (_) {}

  function aplicar() {
    raiz.classList.toggle('tema-claro', claro);
    const b = document.getElementById('temaBtn');
    if (!b) return;
    b.title = claro ? 'Voltar para o tema escuro' : 'Testar o tema claro';
    b.setAttribute('aria-pressed', String(claro));
    b.innerHTML = `<i data-lucide="${claro ? 'moon' : 'sun'}" aria-hidden="true"></i><span>${claro ? 'Escuro' : 'Claro'}</span>`;
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  function montar() {
    const sair = document.getElementById('signOutBtn');
    if (!sair || document.getElementById('temaBtn')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'temaBtn';
    b.className = 'btn compact tema-btn';
    b.addEventListener('click', () => {
      claro = !claro;
      try { localStorage.setItem(CHAVE, claro ? 'claro' : 'escuro'); } catch (_) {}
      aplicar();
    });
    sair.before(b);
  }

  raiz.classList.toggle('tema-claro', claro); // já na carga, para não piscar escuro
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { montar(); aplicar(); });
  else { montar(); aplicar(); }
})();
