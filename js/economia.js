(() => {
  'use strict';
  // Janela "Economia por substituição": abre ao clicar no card Economia do
  // Dashboard. Filtra por período, por C.A. atual e permite escolher com qual
  // C.A. antigo comparar. Só lê dados (epiVariants, epiCatalog, movements).
  if (window.__EPI_ECONOMIA__) return;
  window.__EPI_ECONOMIA__ = true;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const dinheiro = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const iso = (br) => { const p = String(br || '').split('/'); return p[2] ? `${p[2]}-${p[1]}-${p[0]}` : ''; };
  // Globais do app.js (declaradas com let, visíveis entre scripts).
  const variantes = () => (typeof epiVariants !== 'undefined' && Array.isArray(epiVariants) ? epiVariants : []);
  const catalogo = () => (typeof epiCatalog !== 'undefined' && Array.isArray(epiCatalog) ? epiCatalog : []);
  const entregas = () => (typeof movements !== 'undefined' && Array.isArray(movements) ? movements : []);
  const chave = (ca) => { try { return caKey(ca); } catch (_) { return String(ca || '').replace(/\D+/g, ''); } };
  const titulo = (ca) => { try { return codeTitle(ca); } catch (_) { return `C.A. ${ca}`; } };
  const temPreco = (v) => v.preco !== null && v.preco !== undefined && v.preco !== '' && Number.isFinite(Number(v.preco));
  const nomeEpi = (id) => catalogo().find((e) => e.id === id)?.nome || 'EPI / Item';

  const atuais = () => variantes()
    .filter((v) => v.comparativo_status === 'atual' && v.ativo !== false && temPreco(v))
    .sort((a, b) => nomeEpi(a.epi_id).localeCompare(nomeEpi(b.epi_id), 'pt-BR') || String(a.ca).localeCompare(String(b.ca), 'pt-BR', { numeric: true }));
  const antigosDe = (epiId) => variantes()
    .filter((v) => v.epi_id === epiId && v.comparativo_status === 'passada' && temPreco(v))
    .sort((a, b) => Number(a.preco) - Number(b.preco));

  function montar() {
    if ($('econModal')) return;
    const m = document.createElement('div');
    m.className = 'data-edit-modal hidden';
    m.id = 'econModal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'econTitulo');
    m.innerHTML = `
      <div class="data-edit-card historico-card econ-card">
        <button class="data-edit-close" id="econFechar" type="button" aria-label="Fechar"><i data-lucide="x"></i></button>
        <div class="data-edit-head">
          <div class="data-edit-icon"><i data-lucide="piggy-bank"></i></div>
          <div><span>COMPARATIVO DE PREÇOS</span><h3 id="econTitulo">Economia por substituição</h3>
            <p>Cada C.A. atual comparado com um C.A. antigo, pelas entregas do período.</p></div>
        </div>
        <div class="data-edit-body">
          <div class="econ-filtros">
            <label class="econ-campo"><span>De</span><input type="date" id="econDe"></label>
            <label class="econ-campo"><span>Até</span><input type="date" id="econAte"></label>
            <label class="econ-campo econ-campo--largo"><span>C.A. atual</span><select id="econAtual"></select></label>
            <label class="econ-campo econ-campo--largo"><span>Comparar com</span><select id="econBase" disabled></select></label>
          </div>
          <div class="econ-resumo" id="econResumo"></div>
          <div class="table-wrap"><table class="historico-tabela econ-tabela">
            <thead><tr><th>EPI / Item</th><th>C.A. atual</th><th>Comparado com</th><th class="num">Entregues</th><th class="num">Por unidade</th><th class="num">Economia</th></tr></thead>
            <tbody id="econCorpo"></tbody></table></div>
          <p class="econ-nota">Para entrar aqui, o C.A. precisa estar marcado como <b>Atual</b> ou <b>Antigo</b> no prontuário do EPI e ter preço cadastrado.</p>
        </div>
      </div>`;
    document.body.appendChild(m);
    const fechar = () => m.classList.add('hidden');
    $('econFechar').addEventListener('click', fechar);
    m.addEventListener('click', (e) => { if (e.target === m) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.classList.contains('hidden')) fechar(); });
    ['econDe', 'econAte', 'econBase'].forEach((id) => $(id).addEventListener('change', render));
    $('econAtual').addEventListener('change', () => { preencherBase(); render(); });
  }

  function preencherAtual() {
    const sel = $('econAtual');
    const antes = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + atuais()
      .map((v) => `<option value="${esc(v.id)}">${esc(nomeEpi(v.epi_id))} · ${esc(titulo(v.ca))} (${dinheiro(v.preco)})</option>`).join('');
    if ([...sel.options].some((o) => o.value === antes)) sel.value = antes;
  }
  function preencherBase() {
    const sel = $('econBase');
    const atual = variantes().find((v) => v.id === $('econAtual').value);
    if (!atual) {
      sel.innerHTML = '<option value="">Automático</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Automático (antigo mais barato acima do atual)</option>' + antigosDe(atual.epi_id)
      .map((v) => `<option value="${esc(v.id)}">${esc(titulo(v.ca))}${v.apelido ? ` · ${esc(v.apelido)}` : ''} (${dinheiro(v.preco)})</option>`).join('');
  }

  function calcular() {
    const de = $('econDe').value, ate = $('econAte').value;
    const atualId = $('econAtual').value, baseId = $('econBase').value;
    const lista = entregas().filter((m) => { const d = iso(m.data); return (!de || d >= de) && (!ate || d <= ate); });
    const linhas = [];
    atuais().filter((v) => !atualId || v.id === atualId).forEach((atual) => {
      const preco = Number(atual.preco);
      const antigos = antigosDe(atual.epi_id);
      const base = baseId ? antigos.find((v) => v.id === baseId) : antigos.find((v) => Number(v.preco) > preco);
      if (!base) return;
      const ca = chave(atual.ca);
      const qtd = lista.filter((m) => m.epi_id === atual.epi_id && chave(m.ca) === ca).reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
      const unit = Number(base.preco) - preco;
      linhas.push({ atual, base, qtd, unit, total: unit * qtd });
    });
    return linhas.sort((a, b) => b.total - a.total || b.unit - a.unit);
  }

  function render() {
    const linhas = calcular();
    const total = linhas.reduce((s, l) => s + l.total, 0);
    const qtd = linhas.reduce((s, l) => s + l.qtd, 0);
    $('econResumo').innerHTML = `
      <div class="econ-kpi${total < 0 ? ' is-neg' : ''}"><span><i data-lucide="piggy-bank"></i>Economia no período</span><strong>${dinheiro(total)}</strong></div>
      <div class="econ-kpi"><span><i data-lucide="package"></i>Itens entregues comparados</span><strong>${num(qtd)}</strong></div>
      <div class="econ-kpi"><span><i data-lucide="arrow-left-right"></i>Comparações</span><strong>${num(linhas.length)}</strong></div>`;
    $('econCorpo').innerHTML = linhas.length ? linhas.map((l) => `
      <tr>
        <td>${esc(nomeEpi(l.atual.epi_id))}${l.atual.apelido ? ` <small>· ${esc(l.atual.apelido)}</small>` : ''}</td>
        <td><b>${esc(titulo(l.atual.ca))}</b><small>${dinheiro(l.atual.preco)}</small></td>
        <td><b>${esc(titulo(l.base.ca))}</b><small>${dinheiro(l.base.preco)}</small></td>
        <td class="num">${num(l.qtd)}</td>
        <td class="num${l.unit < 0 ? ' is-neg' : ''}">${dinheiro(l.unit)}</td>
        <td class="num econ-total${l.total < 0 ? ' is-neg' : ''}">${dinheiro(l.total)}</td>
      </tr>`).join('')
      : '<tr><td colspan="6" class="econ-vazio">Nenhuma comparação possível com esses filtros.</td></tr>';
    icons();
  }

  function abrir() {
    montar();
    // Começa com o mesmo período do Dashboard.
    $('econDe').value = $('fDe')?.value || '';
    $('econAte').value = $('fAte')?.value || '';
    preencherAtual();
    preencherBase();
    render();
    $('econModal').classList.remove('hidden');
    icons();
  }
  window.abrirEconomia = abrir;

  document.addEventListener('click', (e) => {
    if (e.target.closest('#dashKpis [data-kpi="economia"]')) abrir();
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('#dashKpis [data-kpi="economia"]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); }
  });
  // O card é recriado pelo dash-kpis.js: deixa ele focável e com a dica certa.
  setInterval(() => {
    const card = document.querySelector('#dashKpis [data-kpi="economia"]');
    if (card && !card.hasAttribute('tabindex')) {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.title = 'Clique para ver o comparativo de economia por C.A.';
    }
  }, 1500);
})();
