(() => {
  'use strict';

  // "Histórico" ao clicar no cartão do colaborador: tudo que ele recebeu
  // (resumo por item e cada entrega com data, quantidade, C.A., tamanho e
  // responsável), mais a situação do cadastro e do termo.
  if (window.__EPI_HISTORICO__) return;
  window.__EPI_HISTORICO__ = true;

  const $ = (id) => document.getElementById(id);
  const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
  function movs() { try { return Array.isArray(movements) ? movements : []; } catch (_) { return []; } }
  function icons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); }
  // "dd/mm/aaaa" -> número para ordenar
  const chave = (br) => { const [d, m, a] = String(br || '').split('/'); return Number(`${a || 0}${m || '00'}${d || '00'}`); };
  const isoBR = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : ''; };

  function montar() {
    if ($('historicoModal')) return;
    const modal = document.createElement('div');
    modal.className = 'data-edit-modal hidden';
    modal.id = 'historicoModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'historicoTitle');
    modal.innerHTML = `
      <div class="data-edit-card historico-card">
        <button class="data-edit-close" id="historicoClose" type="button" aria-label="Fechar"><i data-lucide="x" aria-hidden="true"></i></button>
        <div class="data-edit-head">
          <div class="data-edit-icon"><i data-lucide="history" aria-hidden="true"></i></div>
          <div><span>HISTÓRICO DO COLABORADOR</span><h3 id="historicoTitle"></h3><p id="historicoSub"></p></div>
        </div>
        <div class="data-edit-body" id="historicoBody"></div>
      </div>`;
    document.body.appendChild(modal);
    const fechar = () => modal.classList.add('hidden');
    $('historicoClose').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) fechar(); });
  }

  function abrir(c) {
    if (!c) return;
    montar();
    const lista = movs().filter((m) => m.colaborador_id === c.id)
      .sort((a, b) => chave(b.data) - chave(a.data) || (b._order ?? 0) - (a._order ?? 0));
    const total = lista.reduce((s, m) => s + (Number(m.quantidade) || 0), 0);

    const porItem = new Map();
    for (const m of lista) {
      const k = m.epi || '—';
      const it = porItem.get(k) || { epi: k, qtd: 0, vezes: 0, ultima: '' };
      it.qtd += Number(m.quantidade) || 0;
      it.vezes += 1;
      if (!it.ultima || chave(m.data) > chave(it.ultima)) it.ultima = m.data;
      porItem.set(k, it);
    }
    const itens = [...porItem.values()].sort((a, b) => b.qtd - a.qtd || a.epi.localeCompare(b.epi, 'pt-BR'));

    const termo = window.EPI_TERMO?.temAssinatura?.(c.id);
    const situacao = [
      c.ativo === false ? `<span class="collab-leave-tag is-off"><i data-lucide="user-x"></i>Desativado${c.desativado_desde ? ' ' + escHtml(isoBR(c.desativado_desde)) : ''}</span>` : '',
      c.afastado === true ? `<span class="collab-leave-tag"><i data-lucide="heart-pulse"></i>Afastado${c.afastado_desde ? ' ' + escHtml(isoBR(c.afastado_desde)) : ''}</span>` : '',
      termo ? '<span class="historico-tag is-ok"><i data-lucide="badge-check"></i>Termo assinado</span>' : '<span class="historico-tag"><i data-lucide="file-x"></i>Sem termo assinado</span>'
    ].join('');

    $('historicoTitle').textContent = c.nome;
    $('historicoSub').textContent = [c.cargo, c.setor].filter(Boolean).join(' • ') || 'Sem cargo informado';
    $('historicoBody').innerHTML = `
      <div class="historico-situacao">${situacao}</div>
      <div class="historico-kpis">
        <div><span>Itens recebidos</span><strong>${fmtNum(total)}</strong></div>
        <div><span>Entregas</span><strong>${fmtNum(lista.length)}</strong></div>
        <div><span>Primeira entrega</span><strong>${escHtml(lista.at(-1)?.data || '—')}</strong></div>
        <div><span>Última entrega</span><strong>${escHtml(lista[0]?.data || '—')}</strong></div>
      </div>
      ${lista.length ? `
      <h4 class="historico-titulo">Por item</h4>
      <div class="table-wrap"><table class="historico-tabela"><thead><tr><th>EPI / Item</th><th>Quantidade</th><th>Entregas</th><th>Última</th></tr></thead>
        <tbody>${itens.map((i) => `<tr><td>${escHtml(i.epi)}</td><td>${fmtNum(i.qtd)}</td><td>${fmtNum(i.vezes)}</td><td>${escHtml(i.ultima)}</td></tr>`).join('')}</tbody></table></div>
      <h4 class="historico-titulo">Todas as entregas</h4>
      <div class="table-wrap"><table class="historico-tabela"><thead><tr><th>Data</th><th>EPI / Item</th><th>Qtd</th><th>C.A.</th><th>Tamanho</th><th>Responsável</th><th>Observação</th></tr></thead>
        <tbody>${lista.map((m) => `<tr><td>${escHtml(m.data)}</td><td>${escHtml(m.epi)}</td><td>${fmtNum(m.quantidade)}</td><td>${escHtml(m.ca || 'N/A')}</td><td>${escHtml(m.tamanho || 'N/A')}</td><td>${escHtml(m.responsavel || '—')}</td><td>${escHtml(m.observacao || '')}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="historico-vazio">Nenhuma entrega registrada para este colaborador.</p>'}`;
    $('historicoModal').classList.remove('hidden');
    icons();
  }

  window.EPI_HISTORICO = { abrir };
})();
