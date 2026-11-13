(() => {
  'use strict';
  // Economia por período (tela aberta pelo card Economia, js/dash-palco.js,
  // e o próprio card do Dashboard, js/dash-kpis.js).
  // Para cada EPI / item: custo médio por unidade no período de referência
  // menos o custo médio no período escolhido, vezes a quantidade entregue no
  // período escolhido. O custo de cada entrega é o preço cadastrado do C.A.
  // entregue (C.A. desativado também vale). Entrega sem preço fica de fora.
  // Só lê dados.
  if (window.__EPI_ECONOMIA__) return;
  window.__EPI_ECONOMIA__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dinheiro = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const semRs = (n) => dinheiro(n).replace(/^-?R\$\s*/, (m) => (m.startsWith('-') ? '-' : ''));
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const iso = (br) => { const p = String(br || '').split('/'); return p[2] ? `${p[2]}-${p[1]}-${p[0]}` : ''; };
  const val = (id) => document.getElementById(id)?.value || '';
  const pad = (n) => String(n).padStart(2, '0');
  const dataIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // Globais do app.js (declaradas com let, visíveis entre scripts).
  const variantes = () => (typeof epiVariants !== 'undefined' && Array.isArray(epiVariants) ? epiVariants : []);
  const catalogo = () => (typeof epiCatalog !== 'undefined' && Array.isArray(epiCatalog) ? epiCatalog : []);
  const entregas = () => (typeof movements !== 'undefined' && Array.isArray(movements) ? movements : []);
  const chave = (ca) => { try { return caKey(ca); } catch (_) { return String(ca || '').replace(/\D+/g, ''); } };
  const temPreco = (v) => v.preco !== null && v.preco !== undefined && v.preco !== '' && Number.isFinite(Number(v.preco)) && Number(v.preco) > 0;
  const nomeEpi = (id, m) => catalogo().find((e) => e.id === id)?.nome || m?.epi || 'EPI / Item';

  function precoDe(m) {
    const k = chave(m.ca);
    if (!m.epi_id || !k) return null;
    const v = variantes().find((x) => x.epi_id === m.epi_id && chave(x.ca) === k && temPreco(x));
    return v ? Number(v.preco) : null;
  }

  // Filtros do Dashboard que não são de data (colaborador, EPI, responsável, busca).
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function passaFiltrosDash(x) {
    const c = val('fColab'), e = val('fEpi'), r = val('fResp');
    if ((c && x.colaborador !== c) || (e && x.epi !== e) || (r && x.responsavel !== r)) return false;
    const b = window.EPI_BUSCA || {}, q = semAcento(b.texto);
    if (!q) return true;
    const col = semAcento(x.colaborador).includes(q), epi = semAcento(x.epi).includes(q);
    return b.modo === 'colaborador' ? col : b.modo === 'epi' ? epi : (col || epi);
  }

  // Período de comparação: mês inteiro → mês anterior; senão, o mesmo número de dias logo antes.
  function anterior(de, ate) {
    if (!de || !ate) return null;
    const ini = new Date(`${de}T00:00:00`), fim = new Date(`${ate}T00:00:00`);
    const mesInteiro = ini.getDate() === 1 && fim.getMonth() === ini.getMonth() && new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1).getDate() === 1;
    if (mesInteiro) return { de: dataIso(new Date(ini.getFullYear(), ini.getMonth() - 1, 1)), ate: dataIso(new Date(ini.getFullYear(), ini.getMonth(), 0)) };
    const dias = Math.round((fim - ini) / 86400000) + 1;
    return { de: dataIso(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - dias)), ate: dataIso(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - 1)) };
  }
  // Sem período no Dashboard: último mês com entregas, comparado com o mês anterior.
  function padrao() {
    const de = val('fDe'), ate = val('fAte');
    if (de && ate) { const ref = anterior(de, ate); return { de, ate, refDe: ref.de, refAte: ref.ate }; }
    const ultima = entregas().map((m) => iso(m.data)).filter(Boolean).sort().pop();
    const base = ultima ? new Date(`${ultima}T00:00:00`) : new Date();
    const de2 = dataIso(new Date(base.getFullYear(), base.getMonth(), 1));
    const ate2 = dataIso(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    const ref = anterior(de2, ate2);
    return { de: de2, ate: ate2, refDe: ref.de, refAte: ref.ate };
  }
  // "out/2026" para mês inteiro; "01/10 a 15/10" para outros intervalos.
  function rotulo(de, ate) {
    if (!de || !ate) return 'todo o período';
    const i = new Date(`${de}T00:00:00`);
    const mesInteiro = i.getDate() === 1 && ate === dataIso(new Date(i.getFullYear(), i.getMonth() + 1, 0));
    if (mesInteiro) return `${MES[i.getMonth()]}/${i.getFullYear()}`;
    const br = (s) => s.split('-').reverse().slice(0, 2).join('/');
    return `${br(de)} a ${br(ate)}`;
  }

  // Custo médio por unidade de cada item num intervalo.
  function resumoPorItem(de, ate, epi) {
    const mapa = new Map();
    entregas().forEach((m) => {
      const d = iso(m.data);
      if (!d || (de && d < de) || (ate && d > ate) || (epi && m.epi_id !== epi) || !passaFiltrosDash(m)) return;
      const k = m.epi_id || m.epi;
      const o = mapa.get(k) || { id: m.epi_id, nome: nomeEpi(m.epi_id, m), qtd: 0, qtdPreco: 0, valor: 0, semPreco: 0 };
      const q = Number(m.quantidade) || 0, p = precoDe(m);
      o.qtd += q;
      if (p == null) o.semPreco += q; else { o.qtdPreco += q; o.valor += p * q; }
      mapa.set(k, o);
    });
    mapa.forEach((o) => { o.medio = o.qtdPreco ? o.valor / o.qtdPreco : null; });
    return mapa;
  }

  // Intervalo inteiro, do mês "De" (refDe) ao mês "Até" (ate). Para cada item,
  // a partida é o primeiro mês do intervalo em que ele teve entrega com preço;
  // tudo o que foi entregue nos meses seguintes é comparado com o custo médio
  // dessa partida, mês a mês (cada mês com o seu custo médio).
  function calcular({ ate, refDe, epi }) {
    const porItem = new Map();
    const lista = [];
    entregas().forEach((m) => {
      const d = iso(m.data);
      if (!d || (refDe && d < refDe) || (ate && d > ate) || (epi && m.epi_id !== epi) || !passaFiltrosDash(m)) return;
      lista.push(m);
      const k = m.epi_id || m.epi, mes = d.slice(0, 7);
      const item = porItem.get(k) || { nome: nomeEpi(m.epi_id, m), meses: new Map() };
      const o = item.meses.get(mes) || { qtdPreco: 0, valor: 0, semPreco: 0 };
      const q = Number(m.quantidade) || 0, p = precoDe(m);
      if (p == null) o.semPreco += q; else { o.qtdPreco += q; o.valor += p * q; }
      item.meses.set(mes, o);
      porItem.set(k, item);
    });
    const linhas = [];
    porItem.forEach((item) => {
      const meses = [...item.meses.entries()].filter(([, o]) => o.qtdPreco).sort((a, b) => a[0].localeCompare(b[0]));
      // Item sem comparação também aparece, com o motivo.
      if (meses.length < 2) {
        const qtd = [...item.meses.values()].reduce((s, o) => s + o.qtdPreco + o.semPreco, 0);
        const r = meses[0];
        linhas.push({
          nome: item.nome, total: 0, unit: null, qtd,
          ref: r ? { medio: r[1].valor / r[1].qtdPreco, qtdPreco: r[1].qtdPreco, semPreco: r[1].semPreco, mes: r[0] } : null,
          motivo: r ? `só teve entrega com preço em ${mesTxt(r[0])}` : 'C.A. sem preço cadastrado'
        });
        return;
      }
      const [mesRef, r] = meses[0];
      const ref = { medio: r.valor / r.qtdPreco, qtdPreco: r.qtdPreco, semPreco: r.semPreco, mes: mesRef };
      const depois = { qtdPreco: 0, valor: 0, semPreco: 0 };
      let total = 0;
      meses.slice(1).forEach(([, o]) => {
        total += (ref.medio - o.valor / o.qtdPreco) * o.qtdPreco;
        depois.qtdPreco += o.qtdPreco; depois.valor += o.valor; depois.semPreco += o.semPreco;
      });
      depois.medio = depois.valor / depois.qtdPreco;
      depois.de = meses[1][0]; depois.ate = meses[meses.length - 1][0];
      linhas.push({ nome: item.nome, ref, atual: depois, unit: ref.medio - depois.medio, total });
    });
    // Com comparação primeiro (maior economia no topo); sem comparação depois, por nome.
    linhas.sort((x, y) => (x.motivo ? 1 : 0) - (y.motivo ? 1 : 0) || y.total - x.total || x.nome.localeCompare(y.nome, 'pt-BR'));
    lista.sort((a, b) => iso(b.data).localeCompare(iso(a.data)));
    return { linhas, lista, total: linhas.reduce((s, l) => s + l.total, 0) };
  }

  // ---------------------------------------------------------------------
  // Tela no estilo de Movimentações (cabeçalho com ícone, barra de filtros
  // em pílulas, tabelas fechadas e rodapé com páginas), em verde.
  // ---------------------------------------------------------------------
  let raiz = null;
  const estado = { de: '', ate: '', refDe: '', refAte: '', epi: '', busca: '', pagina: 1 };
  const POR_PAGINA = 10;

  function opcoesEpi() {
    const ids = new Map();
    entregas().forEach((m) => { if (m.epi_id && !ids.has(m.epi_id)) ids.set(m.epi_id, nomeEpi(m.epi_id, m)); });
    return '<option value="">EPI</option>' + [...ids].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([id, nome]) => `<option value="${esc(id)}"${id === estado.epi ? ' selected' : ''}>${esc(nome)}</option>`).join('');
  }

  const mesTxt = (ym) => `${MES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
  const celula = (o) => {
    const quando = o.mes ? mesTxt(o.mes) : o.de === o.ate ? mesTxt(o.de) : `${mesTxt(o.de)} a ${mesTxt(o.ate)}`;
    return `<b>${dinheiro(o.medio)}/un</b><small>${quando} · ${num(o.qtdPreco)} un${o.semPreco ? ` · ${num(o.semPreco)} sem preço` : ''}</small>`;
  };

  function montar(el, voltar) {
    raiz = el;
    Object.assign(estado, padrao(), { epi: '', busca: '', pagina: 1 });
    el.innerHTML = `
      <div class="ecn">
        <div class="ecn-head">
          <span class="ecn-head-ic" aria-hidden="true"><i data-lucide="piggy-bank"></i></span>
          <h2>Economia</h2>
          <p data-econ-resumo></p>
        </div>
        <div class="ecn-barra">
          <label class="colab-busca ecn-busca"><i data-lucide="search" aria-hidden="true"></i><input type="search" data-econ-busca placeholder="Buscar colaborador, EPI ou C.A." autocomplete="off" aria-label="Buscar entrega"></label>
          <div class="ecn-filtros">
            <div class="stg-mes ecn-mes" data-econ-mes="ref"></div>
            <div class="stg-mes ecn-mes" data-econ-mes="atual"></div>
            <label class="colab-filtro ecn-filtro"><select data-econ-epi aria-label="Filtrar por EPI"></select><i data-lucide="chevron-down" aria-hidden="true"></i></label>
          </div>
          <button type="button" class="btn ecn-btn ecn-btn--csv" data-econ-csv><i data-lucide="file-down"></i>Exportar CSV</button>
          <button type="button" class="btn ecn-btn" data-stage-voltar><i data-lucide="arrow-left"></i>Voltar ao Dashboard</button>
        </div>

        <div class="ecn-bloco">
          <div class="ecn-bloco__titulo"><h3>Economia por item</h3><p>Cada item é comparado com o quanto custava no primeiro mês em que foi entregue no período. O custo vem do preço cadastrado no C.A. entregue.</p></div>
          <div class="ecn-tabela-wrap ecn-tabela-wrap--solta">
            <table class="ecn-tabela">
              <colgroup><col><col class="c-med"><col class="c-med"><col class="c-num"><col class="c-num"></colgroup>
              <thead><tr><th>EPI / Item</th><th class="num">Primeiro mês</th><th class="num">Meses seguintes</th><th class="num">Diferença por un.</th><th class="num">Economia</th></tr></thead>
              <tbody data-econ-corpo></tbody>
            </table>
          </div>
        </div>

        <div class="ecn-bloco">
          <div class="ecn-bloco__titulo"><h3 data-econ-lista-titulo>Entregas do período</h3><p data-econ-lista-resumo></p></div>
          <div class="ecn-tabela-wrap">
            <table class="ecn-tabela">
              <colgroup><col class="c-data"><col><col><col class="c-ca"><col class="c-qtd"><col class="c-num"><col class="c-num"></colgroup>
              <thead><tr><th>Data</th><th>Colaborador</th><th>EPI</th><th>C.A</th><th class="num">Qtd</th><th class="num">Preço un.</th><th class="num">Custo</th></tr></thead>
              <tbody data-econ-lista></tbody>
            </table>
          </div>
          <footer class="g-employee-footer mov-rodape ecn-rodape" data-econ-rodape></footer>
        </div>
      </div>`;
    el.querySelector('[data-stage-voltar]').addEventListener('click', voltar);
    const mesInteiro = (ym) => { const [y, m] = ym.split('-').map(Number); return { de: `${ym}-01`, ate: dataIso(new Date(y, m, 0)) }; };
    seletorMes($('[data-econ-mes="ref"]', el), (estado.refDe || '').slice(0, 7), 'De', (ym) => { const p = mesInteiro(ym); estado.refDe = p.de; estado.refAte = p.ate; estado.pagina = 1; atualizar(); });
    seletorMes($('[data-econ-mes="atual"]', el), (estado.de || '').slice(0, 7), 'Até', (ym) => { const p = mesInteiro(ym); estado.de = p.de; estado.ate = p.ate; estado.pagina = 1; atualizar(); });
    $('[data-econ-epi]', el).addEventListener('change', (e) => { estado.epi = e.target.value; estado.pagina = 1; atualizar(); });
    $('[data-econ-busca]', el).addEventListener('input', (e) => { estado.busca = e.target.value; estado.pagina = 1; atualizar(); });
    $('[data-econ-rodape]', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-econ-pagina]');
      if (b && !b.disabled) { estado.pagina = Number(b.dataset.econPagina); atualizar(); }
    });
    $('[data-econ-csv]', el).addEventListener('click', exportarCsv);
    atualizar();
  }

  // Seletor de mês em pílula (no lugar do calendário do navegador): botão
  // "De: ago/2026" e painel com o ano (‹ ›) e os 12 meses. Meses com entregas
  // ganham um pontinho.
  function seletorMes(caixa, valor, prefixo, aoMudar) {
    let ym = valor || dataIso(new Date()).slice(0, 7);
    let ano = Number(ym.slice(0, 4));
    const comEntrega = new Set(entregas().map((m) => iso(m.data).slice(0, 7)).filter(Boolean));
    caixa.innerHTML = `
      <button type="button" class="stg-mes__botao" aria-haspopup="dialog" aria-expanded="false"><span></span><i data-lucide="chevron-down"></i></button>
      <div class="stg-mes__painel" hidden>
        <div class="stg-mes__ano"><button type="button" data-ano="-1" aria-label="Ano anterior"><i data-lucide="chevron-left"></i></button><strong></strong><button type="button" data-ano="1" aria-label="Próximo ano"><i data-lucide="chevron-right"></i></button></div>
        <div class="stg-mes__grade"></div>
      </div>`;
    const botao = caixa.querySelector('.stg-mes__botao'), painel = caixa.querySelector('.stg-mes__painel');
    const texto = () => { botao.querySelector('span').innerHTML = `<em>${prefixo}:</em> ${mesTxt(ym)}`; };
    const grade = () => {
      painel.querySelector('strong').textContent = ano;
      painel.querySelector('.stg-mes__grade').innerHTML = MES.map((n, i) => {
        const v = `${ano}-${pad(i + 1)}`;
        return `<button type="button" data-mes="${v}" class="${v === ym ? 'is-sel' : ''}${comEntrega.has(v) ? ' tem-entrega' : ''}">${n}</button>`;
      }).join('');
    };
    const abrir = (sim) => {
      painel.hidden = !sim;
      botao.setAttribute('aria-expanded', sim ? 'true' : 'false');
      if (sim) { ano = Number(ym.slice(0, 4)); grade(); window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } }); }
    };
    botao.addEventListener('click', () => {
      document.querySelectorAll('.stg-mes__painel:not([hidden])').forEach((p) => { if (p !== painel) p.hidden = true; });
      abrir(painel.hidden);
    });
    painel.addEventListener('click', (e) => {
      const passo = e.target.closest('[data-ano]');
      if (passo) { ano += Number(passo.dataset.ano); grade(); return; }
      const mes = e.target.closest('[data-mes]');
      if (mes) { ym = mes.dataset.mes; texto(); abrir(false); botao.focus(); aoMudar(ym); }
    });
    const fora = (e) => { if (!caixa.isConnected) { document.removeEventListener('click', fora); return; } if (!caixa.contains(e.target)) abrir(false); };
    document.addEventListener('click', fora);
    caixa.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) { e.stopPropagation(); abrir(false); botao.focus(); } });
    texto();
  }

  // Lista das entregas com a busca da barra.
  function listaFiltrada(lista) {
    const q = semAcento(estado.busca.trim());
    if (!q) return lista;
    return lista.filter((m) => [m.data, m.colaborador, m.epi, m.ca, m.responsavel].some((v) => semAcento(v).includes(q)));
  }

  function atualizar() {
    if (!raiz || !raiz.isConnected || !$('[data-econ-corpo]', raiz)) return;
    $('[data-econ-epi]', raiz).innerHTML = opcoesEpi();
    $('[data-econ-epi]', raiz).classList.toggle('tem-valor', !!estado.epi);
    const { linhas, lista, total } = calcular(estado);
    const periodo = `${rotulo(estado.refDe, estado.refAte)} até ${rotulo(estado.de, estado.ate)}`;

    // Subtítulo: o total do período.
    $('[data-econ-resumo]', raiz).innerHTML = `<strong class="${total < 0 ? 'is-neg' : ''}">${dinheiro(Math.abs(total))}</strong> ${total < 0 ? 'gastos a mais' : 'economizados'} de ${periodo}`;

    // Economia por item (todos os itens; sem comparação aparece com o motivo).
    $('[data-econ-corpo]', raiz).innerHTML = linhas.length ? linhas.map((l) => l.motivo ? `
      <tr class="ecn-sem">
        <td>${esc(l.nome)}</td>
        <td class="num">${l.ref ? celula(l.ref) : '<span class="ecn-traco">—</span>'}</td>
        <td class="num ecn-motivo" colspan="2">${esc(l.motivo)}</td>
        <td class="num"><span class="ecn-traco">—</span></td>
      </tr>` : `
      <tr>
        <td>${esc(l.nome)}</td>
        <td class="num">${celula(l.ref)}</td>
        <td class="num">${celula(l.atual)}</td>
        <td class="num${l.unit < 0 ? ' is-neg' : ''}">${dinheiro(l.unit)}</td>
        <td class="num ecn-total${l.total < 0 ? ' is-neg' : ''}">${dinheiro(l.total)}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="ecn-vazio">Nenhuma entrega nesse período.</td></tr>';

    // Entregas do período, com busca e páginas.
    const filtrada = listaFiltrada(lista);
    const qtdTotal = filtrada.reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
    const custoTotal = filtrada.reduce((s, m) => { const p = precoDe(m); return s + (p == null ? 0 : p * (Number(m.quantidade) || 0)); }, 0);
    $('[data-econ-lista-titulo]', raiz).textContent = `Entregas de ${periodo}`;
    $('[data-econ-lista-resumo]', raiz).textContent = `${num(qtdTotal)} ${qtdTotal === 1 ? 'item entregue' : 'itens entregues'} · ${dinheiro(custoTotal)} em custo`;
    const paginas = Math.max(1, Math.ceil(filtrada.length / POR_PAGINA));
    if (estado.pagina > paginas) estado.pagina = paginas;
    const daPagina = filtrada.slice((estado.pagina - 1) * POR_PAGINA, estado.pagina * POR_PAGINA);
    $('[data-econ-lista]', raiz).innerHTML = daPagina.length ? daPagina.map((m) => {
      const p = precoDe(m), q = Number(m.quantidade) || 0;
      return `<tr>
        <td>${esc(m.data)}</td>
        <td><b>${esc(m.colaborador || '—')}</b></td>
        <td><b>${esc(m.epi || nomeEpi(m.epi_id, m))}</b></td>
        <td>${esc(m.ca || 'N/A')}</td>
        <td class="num">${num(q)}</td>
        <td class="num">${p == null ? '<span class="ecn-traco" title="C.A. sem preço cadastrado">sem preço</span>' : dinheiro(p)}</td>
        <td class="num">${p == null ? '<span class="ecn-traco">—</span>' : dinheiro(p * q)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="ecn-vazio">Nenhuma entrega encontrada.</td></tr>';

    // Rodapé igual ao de Movimentações.
    let ini = Math.max(1, estado.pagina - 2); const fim = Math.min(paginas, ini + 4); ini = Math.max(1, fim - 4);
    let nums = '';
    for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === estado.pagina ? ' is-current' : ''}" data-econ-pagina="${p}"${p === estado.pagina ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
    $('[data-econ-rodape]', raiz).innerHTML = `<span class="g-employee-count">Exibindo ${num(daPagina.length)} de ${num(filtrada.length)} ${filtrada.length === 1 ? 'entrega' : 'entregas'}</span>` + (paginas > 1 ? `<nav class="g-employee-pagination" aria-label="Páginas">
      <button type="button" class="g-employee-page" data-econ-pagina="${estado.pagina - 1}"${estado.pagina <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${nums}
      <button type="button" class="g-employee-page" data-econ-pagina="${estado.pagina + 1}"${estado.pagina >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button></nav>` : '');
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  // CSV das entregas do período (com a busca e o filtro de EPI aplicados).
  function exportarCsv() {
    const { lista } = calcular(estado);
    const linhas = [['Data', 'Colaborador', 'EPI', 'C.A.', 'Quantidade', 'Preço unitário', 'Custo']];
    listaFiltrada(lista).forEach((m) => {
      const p = precoDe(m), q = Number(m.quantidade) || 0;
      linhas.push([m.data, m.colaborador || '', m.epi || '', m.ca || '', q, p == null ? '' : p.toFixed(2).replace('.', ','), p == null ? '' : (p * q).toFixed(2).replace('.', ',')]);
    });
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `economia_${(estado.refDe || '').slice(0, 7)}_a_${(estado.de || '').slice(0, 7)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Card Economia do Dashboard: mesma conta, com o período do Dashboard.
  function doCard() {
    const p = padrao();
    return { total: calcular({ ...p, epi: '' }).total, texto: `de ${rotulo(p.refDe, p.refAte)} até ${rotulo(p.de, p.ate)}` };
  }

  window.EPI_PALCO_ECONOMIA = { montar, atualizar };
  window.EPI_ECONOMIA = { doCard };
  // Este arquivo pode carregar depois do card: pede para ele recalcular.
  window.dispatchEvent(new CustomEvent('epi:busca'));
})();
