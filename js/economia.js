(() => {
  'use strict';
  // Tela "Economia" do Dashboard (abre pelo card Economia, js/dash-palco.js).
  // Cada C.A. Atual é comparado com um C.A. Antigo do mesmo item, pelas
  // entregas do período. Só lê dados.
  if (window.__EPI_ECONOMIA__) return;
  window.__EPI_ECONOMIA__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dinheiro = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const semRs = (n) => dinheiro(n).replace(/^-?R\$\s*/, (m) => (m.startsWith('-') ? '-' : ''));
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const iso = (br) => { const p = String(br || '').split('/'); return p[2] ? `${p[2]}-${p[1]}-${p[0]}` : ''; };
  const val = (id) => document.getElementById(id)?.value || '';
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

  // Mesmos filtros do card Economia (colaborador, EPI, responsável, busca do
  // banner); o período é o da própria tela, que começa igual ao do Dashboard.
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function entregasFiltradas() {
    const { de, ate } = estado;
    const c = val('fColab'), e = val('fEpi'), r = val('fResp');
    const b = window.EPI_BUSCA || {}, q = semAcento(b.texto);
    return entregas().filter((x) => {
      const d = iso(x.data);
      if ((de && d < de) || (ate && d > ate) || (c && x.colaborador !== c) || (e && x.epi !== e) || (r && x.responsavel !== r)) return false;
      if (!q) return true;
      const col = semAcento(x.colaborador).includes(q), epi = semAcento(x.epi).includes(q);
      return b.modo === 'colaborador' ? col : b.modo === 'epi' ? epi : (col || epi);
    });
  }

  let raiz = null;
  const estado = { de: '', ate: '', epi: '' };

  function calcular() {
    const lista = entregasFiltradas();
    const linhas = [];
    // Cada C.A. Atual do item é comparado com o Antigo mais barato entre os que custavam mais que ele.
    atuais().filter((v) => !estado.epi || v.epi_id === estado.epi).forEach((atual) => {
      const preco = Number(atual.preco);
      const antigos = antigosDe(atual.epi_id);
      const base = antigos.find((v) => Number(v.preco) > preco);
      if (!base) return;
      const ca = chave(atual.ca);
      const qtd = lista.filter((m) => m.epi_id === atual.epi_id && chave(m.ca) === ca).reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
      const unit = Number(base.preco) - preco;
      linhas.push({ atual, base, qtd, unit, total: unit * qtd });
    });
    return linhas.sort((a, b) => b.total - a.total || b.unit - a.unit);
  }

  // Itens que têm pelo menos um C.A. Atual e um Antigo com preço.
  function opcoesEpi() {
    const ids = [...new Set(atuais().map((v) => v.epi_id))].filter((id) => antigosDe(id).length);
    return '<option value="">Todos os itens</option>' + ids
      .map((id) => [id, nomeEpi(id)]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([id, nome]) => `<option value="${esc(id)}"${id === estado.epi ? ' selected' : ''}>${esc(nome)}</option>`).join('');
  }

  function montar(el, voltar) {
    raiz = el;
    estado.de = val('fDe');
    estado.ate = val('fAte');
    el.innerHTML = `
      <div class="stg-hero stg-hero--green">
        <span class="stg-hero__slash" aria-hidden="true"></span>
        <div class="stg-hero__arte" aria-hidden="true">
          <span class="stg-moeda stg-moeda--1">R$</span><span class="stg-moeda stg-moeda--2">R$</span><span class="stg-moeda stg-moeda--3">R$</span>
          <span class="stg-hero__icone"><i data-lucide="piggy-bank"></i></span>
          <span class="stg-hero__seta"><i data-lucide="trending-down"></i></span>
        </div>
        <div class="stg-hero__copy">
          <button type="button" class="stg-voltar" data-stage-voltar><i data-lucide="arrow-left"></i>Voltar ao Dashboard</button>
          <h2 class="stg-hero__title">Cada troca de C.A.<br><strong>vira economia</strong>.</h2>
          <p class="stg-hero__total"><strong data-econ-total>R$ 0,00</strong><span data-econ-periodo>economizados</span></p>
        </div>
        <div class="stg-hero__bottom">
          <label class="stg-filtro stg-filtro--data"><span>De</span><input type="date" data-econ-de></label>
          <label class="stg-filtro stg-filtro--data"><span>Até</span><input type="date" data-econ-ate></label>
          <label class="stg-filtro"><span>EPI / Item</span><select data-econ-epi></select></label>
        </div>
      </div>
      <div class="stg-painel">
        <div class="stg-painel__head"><h3>Comparações</h3><p>Entram os C.A.s marcados como <b>Atual</b> ou <b>Antigo</b> no prontuário do EPI, com preço cadastrado.</p></div>
        <div class="stg-tabela-wrap">
          <table class="stg-tabela">
            <thead><tr><th>EPI / Item</th><th>C.A. atual</th><th>Comparado com</th><th class="num">Entregues</th><th class="num">Por unidade</th><th class="num">Economia</th></tr></thead>
            <tbody data-econ-corpo></tbody>
          </table>
        </div>
      </div>`;
    $('[data-stage-voltar]', el).addEventListener('click', voltar);
    $('[data-econ-de]', el).value = estado.de;
    $('[data-econ-ate]', el).value = estado.ate;
    $('[data-econ-de]', el).addEventListener('change', (e) => { estado.de = e.target.value; atualizar(); });
    $('[data-econ-ate]', el).addEventListener('change', (e) => { estado.ate = e.target.value; atualizar(); });
    $('[data-econ-epi]', el).addEventListener('change', (e) => { estado.epi = e.target.value; atualizar(); });
    atualizar();
  }

  function atualizar() {
    if (!raiz || !raiz.isConnected || !$('[data-econ-corpo]', raiz)) return;
    if (estado.epi && !atuais().some((v) => v.epi_id === estado.epi)) estado.epi = '';
    $('[data-econ-epi]', raiz).innerHTML = opcoesEpi();

    const linhas = calcular();
    const total = linhas.reduce((s, l) => s + l.total, 0);
    // Total grande no banner, no lugar dos cards.
    const tot = $('[data-econ-total]', raiz);
    tot.innerHTML = `<small>R$</small>${semRs(total)}`;
    tot.classList.toggle('is-neg', total < 0);
    $('[data-econ-periodo]', raiz).textContent = `${total < 0 ? 'gastos a mais' : 'economizados'} ${!estado.de && !estado.ate ? 'em todo o período' : 'no período escolhido'}`;

    $('[data-econ-corpo]', raiz).innerHTML = linhas.length ? linhas.map((l) => `
      <tr>
        <td>${esc(nomeEpi(l.atual.epi_id))}${l.atual.apelido ? `<small>${esc(l.atual.apelido)}</small>` : ''}</td>
        <td><b>${esc(titulo(l.atual.ca))}</b><small>${dinheiro(l.atual.preco)}</small></td>
        <td><b>${esc(titulo(l.base.ca))}</b><small>${dinheiro(l.base.preco)}</small></td>
        <td class="num">${num(l.qtd)}</td>
        <td class="num${l.unit < 0 ? ' is-neg' : ''}">${dinheiro(l.unit)}</td>
        <td class="num stg-total${l.total < 0 ? ' is-neg' : ''}">${dinheiro(l.total)}</td>
      </tr>`).join('')
      : '<tr><td colspan="6" class="stg-vazio">Nenhuma comparação possível com esses filtros.</td></tr>';
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  window.EPI_PALCO_ECONOMIA = { montar, atualizar };
})();
