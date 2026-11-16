(() => {
  'use strict';
  // Tela "Depósitos" (botão "Por Unidade" do banner do Dashboard, js/dash-palco.js).
  // Mesmo molde das telas da Economia e do Valor gasto (classes .ecn-*), com a
  // arte e o fundo laranja de Movimentações. Por enquanto só a moldura: os
  // depósitos ainda não existem no banco.
  if (window.__EPI_DEPOSITOS__) return;
  window.__EPI_DEPOSITOS__ = true;

  function montar(el, voltar) {
    el.innerHTML = `
      <div class="ecn dep">
        <div class="ecn-head">
          <span class="ecn-head-ic" aria-hidden="true"><i data-lucide="warehouse"></i></span>
          <h2>Depósitos</h2>
          <p>Entregas, gasto e estoque de cada unidade</p>
        </div>
        <div class="ecn-barra">
          <button type="button" class="btn ecn-btn ecn-btn--csv" data-stage-voltar><i data-lucide="arrow-left"></i>Voltar ao Dashboard</button>
        </div>
        <div class="dep-vazio">
          <span class="dep-vazio__ic" aria-hidden="true"><i data-lucide="map-pin"></i></span>
          <h3>Nenhum depósito cadastrado ainda</h3>
          <p>Quando os depósitos forem criados, cada um aparece aqui com as suas entregas, o valor gasto e o estoque.</p>
        </div>
      </div>`;
    el.querySelector('[data-stage-voltar]').addEventListener('click', voltar);
  }

  window.EPI_PALCO_UNIDADE = { montar, atualizar() {} };
})();
