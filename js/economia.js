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

  function calcular({ de, ate, refDe, refAte, epi }) {
    const atual = resumoPorItem(de, ate, epi), ref = resumoPorItem(refDe, refAte, epi);
    const linhas = [];
    atual.forEach((a, k) => {
      const r = ref.get(k);
      if (a.medio == null || !r || r.medio == null) return;
      const unit = r.medio - a.medio;
      linhas.push({ nome: a.nome, ref: r, atual: a, unit, total: unit * a.qtdPreco });
    });
    linhas.sort((x, y) => y.total - x.total);
    return { linhas, total: linhas.reduce((s, l) => s + l.total, 0) };
  }

  let raiz = null;
  const estado = { de: '', ate: '', refDe: '', refAte: '', epi: '' };

  function opcoesEpi() {
    const ids = new Map();
    entregas().forEach((m) => { if (m.epi_id && !ids.has(m.epi_id)) ids.set(m.epi_id, nomeEpi(m.epi_id, m)); });
    return '<option value="">Todos os itens</option>' + [...ids].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([id, nome]) => `<option value="${esc(id)}"${id === estado.epi ? ' selected' : ''}>${esc(nome)}</option>`).join('');
  }

  function montar(el, voltar) {
    raiz = el;
    Object.assign(estado, padrao(), { epi: '' });
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
          <div class="stg-filtro stg-filtro--mes"><span>De</span><div class="stg-mes" data-econ-mes="ref"></div></div>
          <div class="stg-filtro stg-filtro--mes"><span>Até</span><div class="stg-mes" data-econ-mes="atual"></div></div>
          <label class="stg-filtro"><span>EPI / Item</span><select data-econ-epi></select></label>
        </div>
      </div>
      <div class="stg-painel">
        <div class="stg-painel__head"><h3>Custo por unidade em cada período</h3><p>Preço cadastrado do C.A. de cada entrega. Entrega de C.A. sem preço fica de fora da média.</p></div>
        <div class="stg-tabela-wrap">
          <table class="stg-tabela">
            <thead><tr><th>EPI / Item</th><th class="num" data-econ-th-ref>Comparar com</th><th class="num" data-econ-th-atual>Período</th><th class="num">Diferença por un.</th><th class="num">Economia</th></tr></thead>
            <tbody data-econ-corpo></tbody>
          </table>
        </div>
      </div>`;
    $('[data-stage-voltar]', el).addEventListener('click', voltar);
    // "De" = mês de partida (custo médio de antes); "Até" = mês de chegada
    // (custo médio de agora, vezes o que foi entregue nele).
    const mesInteiro = (ym) => { const [y, m] = ym.split('-').map(Number); return { de: `${ym}-01`, ate: dataIso(new Date(y, m, 0)) }; };
    seletorMes($('[data-econ-mes="ref"]', el), (estado.refDe || '').slice(0, 7), (ym) => { const p = mesInteiro(ym); estado.refDe = p.de; estado.refAte = p.ate; atualizar(); });
    seletorMes($('[data-econ-mes="atual"]', el), (estado.de || '').slice(0, 7), (ym) => { const p = mesInteiro(ym); estado.de = p.de; estado.ate = p.ate; atualizar(); });
    $('[data-econ-epi]', el).addEventListener('change', (e) => { estado.epi = e.target.value; atualizar(); });
    atualizar();
  }

  // Seletor de mês no tema (no lugar do calendário do navegador): botão com o
  // mês e, ao clicar, painel com o ano (‹ ›) e os 12 meses. Meses com entregas
  // ganham um pontinho.
  const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function seletorMes(caixa, valor, aoMudar) {
    let ym = valor || dataIso(new Date()).slice(0, 7);
    let ano = Number(ym.slice(0, 4));
    const comEntrega = new Set(entregas().map((m) => iso(m.data).slice(0, 7)).filter(Boolean));
    caixa.innerHTML = `
      <button type="button" class="stg-mes__botao" aria-haspopup="dialog" aria-expanded="false"><i data-lucide="calendar-days"></i><span></span><i data-lucide="chevron-down"></i></button>
      <div class="stg-mes__painel" hidden>
        <div class="stg-mes__ano"><button type="button" data-ano="-1" aria-label="Ano anterior"><i data-lucide="chevron-left"></i></button><strong></strong><button type="button" data-ano="1" aria-label="Próximo ano"><i data-lucide="chevron-right"></i></button></div>
        <div class="stg-mes__grade"></div>
      </div>`;
    const botao = caixa.querySelector('.stg-mes__botao'), painel = caixa.querySelector('.stg-mes__painel');
    const texto = () => { const [y, m] = ym.split('-').map(Number); botao.querySelector('span').textContent = `${MES_LONGO[m - 1]} de ${y}`; };
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

  const celula = (o) => `<b>${dinheiro(o.medio)}/un</b><small>${num(o.qtdPreco)} un${o.semPreco ? ` · ${num(o.semPreco)} sem preço` : ''}</small>`;

  function atualizar() {
    if (!raiz || !raiz.isConnected || !$('[data-econ-corpo]', raiz)) return;
    $('[data-econ-epi]', raiz).innerHTML = opcoesEpi();
    const { linhas, total } = calcular(estado);
    const tot = $('[data-econ-total]', raiz);
    tot.innerHTML = `<small>R$</small>${semRs(Math.abs(total))}`; // o texto ao lado diz se foi economia ou gasto a mais
    tot.classList.toggle('is-neg', total < 0);
    $('[data-econ-periodo]', raiz).textContent = `${total < 0 ? 'gastos a mais' : 'economizados'} de ${rotulo(estado.refDe, estado.refAte)} até ${rotulo(estado.de, estado.ate)}`;
    $('[data-econ-th-ref]', raiz).textContent = rotulo(estado.refDe, estado.refAte);
    $('[data-econ-th-atual]', raiz).textContent = rotulo(estado.de, estado.ate);
    $('[data-econ-corpo]', raiz).innerHTML = linhas.length ? linhas.map((l) => `
      <tr>
        <td>${esc(l.nome)}</td>
        <td class="num">${celula(l.ref)}</td>
        <td class="num">${celula(l.atual)}</td>
        <td class="num${l.unit < 0 ? ' is-neg' : ''}">${dinheiro(l.unit)}</td>
        <td class="num stg-total${l.total < 0 ? ' is-neg' : ''}">${dinheiro(l.total)}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="stg-vazio">Nenhum item com entregas com preço nos dois períodos.</td></tr>';
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
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
