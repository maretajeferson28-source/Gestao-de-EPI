(() => {
  'use strict';
  // Tela "Valor gasto" (card Valor gasto do Dashboard, js/dash-palco.js).
  // Mesmo molde da Economia (classes .ecn-*), em vermelho, com uma tabela por
  // EPI / item: quantidade, preço médio, total e a fatia de cada um no gasto.
  // O custo de cada entrega é o mesmo do card (movementCostInfo do app.js).
  // Filtros: busca, De, Até e colaborador. Só lê dados.
  if (window.__EPI_VALOR_GASTO__) return;
  window.__EPI_VALOR_GASTO__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dinheiro = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const pct = (n) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const iso = (br) => { const p = String(br || '').split('/'); return p[2] ? `${p[2]}-${p[1]}-${p[0]}` : ''; };
  const val = (id) => document.getElementById(id)?.value || '';
  const dataBr = (d) => (d ? d.split('-').reverse().join('/') : '—');
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const entregas = () => (typeof movements !== 'undefined' && Array.isArray(movements) ? movements : []);
  const catalogo = () => (typeof epiCatalog !== 'undefined' && Array.isArray(epiCatalog) ? epiCatalog : []);
  const nomeEpi = (m) => catalogo().find((e) => e.id === m.epi_id)?.nome || m.epi || 'EPI / Item';
  const custo = (m) => { try { const i = movementCostInfo(m); return i.priced ? i.total : null; } catch (_) { return null; } };
  const POR_PAGINA = 10;

  const estado = { de: '', ate: '', colab: '', busca: '', pagina: 1 };
  let raiz = null;

  // Filtros do Dashboard que seguem valendo aqui (EPI, responsável, busca do banner).
  function passaDash(m) {
    const e = val('fEpi'), r = val('fResp');
    if ((e && m.epi !== e) || (r && m.responsavel !== r)) return false;
    const b = window.EPI_BUSCA || {}, q = semAcento(b.texto);
    if (!q) return true;
    const col = semAcento(m.colaborador).includes(q), epi = semAcento(m.epi).includes(q);
    return b.modo === 'colaborador' ? col : b.modo === 'epi' ? epi : (col || epi);
  }
  // Período inicial: o do Dashboard; sem período lá, da primeira à última entrega.
  function padrao() {
    const de = val('fDe'), ate = val('fAte');
    if (de && ate) return { de, ate };
    const datas = entregas().map((m) => iso(m.data)).filter(Boolean).sort();
    return { de: datas[0] || '', ate: datas[datas.length - 1] || '' };
  }

  function doPeriodo() {
    return entregas().filter((m) => {
      const d = iso(m.data);
      return d && (!estado.de || d >= estado.de) && (!estado.ate || d <= estado.ate) && passaDash(m);
    });
  }

  function porItem(lista) {
    const mapa = new Map();
    lista.forEach((m) => {
      if (estado.colab && m.colaborador !== estado.colab) return;
      const k = m.epi_id || m.epi;
      const o = mapa.get(k) || { nome: nomeEpi(m), cas: new Set(), qtd: 0, qtdPreco: 0, total: 0, semPreco: 0, entregas: 0 };
      const q = Number(m.quantidade) || 0, c = custo(m);
      o.qtd += q; o.entregas += 1;
      if (m.ca) o.cas.add(String(m.ca));
      if (c == null) o.semPreco += q; else { o.qtdPreco += q; o.total += c; }
      mapa.set(k, o);
    });
    const itens = [...mapa.values()];
    const total = itens.reduce((s, o) => s + o.total, 0);
    itens.forEach((o) => { o.medio = o.qtdPreco ? o.total / o.qtdPreco : null; o.fatia = total ? o.total / total : 0; });
    itens.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { itens, total };
  }

  function opcoesColab(lista) {
    const nomes = [...new Set(lista.map((m) => m.colaborador).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (estado.colab && !nomes.includes(estado.colab)) nomes.unshift(estado.colab);
    return '<option value="">Colaborador</option>' + nomes.map((n) => `<option value="${esc(n)}"${n === estado.colab ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  function montar(el, voltar) {
    raiz = el;
    Object.assign(estado, padrao(), { colab: val('fColab'), busca: '', pagina: 1 });
    el.innerHTML = `
      <div class="ecn vgs">
        <div class="ecn-head">
          <span class="ecn-head-ic" aria-hidden="true"><i data-lucide="banknote"></i></span>
          <h2>Valor gasto</h2>
          <p data-vgs-resumo></p>
        </div>
        <div class="ecn-barra">
          <label class="colab-busca ecn-busca"><i data-lucide="search" aria-hidden="true"></i><input type="search" data-vgs-busca placeholder="Buscar EPI ou C.A." autocomplete="off" aria-label="Buscar EPI ou C.A."></label>
          <div class="ecn-filtros">
            <div class="stg-mes ecn-mes" data-vgs-de></div>
            <div class="stg-mes ecn-mes" data-vgs-ate></div>
            <label class="colab-filtro ecn-filtro"><select data-vgs-colab aria-label="Filtrar por colaborador"></select><i data-lucide="chevron-down" aria-hidden="true"></i></label>
          </div>
          <button type="button" class="btn ecn-btn ecn-btn--csv" data-vgs-csv><i data-lucide="file-down"></i>Exportar CSV</button>
          <button type="button" class="btn ecn-btn" data-stage-voltar><i data-lucide="arrow-left"></i>Voltar ao Dashboard</button>
        </div>

        <div class="ecn-bloco">
          <div class="ecn-bloco__titulo"><h3 data-vgs-titulo>Gasto por item</h3><p data-vgs-sub></p></div>
          <div class="ecn-tabela-wrap">
            <table class="ecn-tabela vgs-tabela">
              <colgroup><col><col class="c-cas"><col class="c-qtd"><col class="c-num"><col class="c-num"><col class="c-fatia"></colgroup>
              <thead><tr><th>EPI / Item</th><th>C.A</th><th class="num">Qtd</th><th class="num" title="Custo médio por unidade das entregas com preço">Preço médio</th><th class="num">Total</th><th>% do gasto</th></tr></thead>
              <tbody data-vgs-lista></tbody>
            </table>
          </div>
          <footer class="g-employee-footer mov-rodape ecn-rodape" data-vgs-rodape></footer>
        </div>
      </div>`;
    el.querySelector('[data-stage-voltar]').addEventListener('click', voltar);
    const sel = window.EPI_ECONOMIA?.seletorData;
    if (sel) {
      const selDe = sel($('[data-vgs-de]', el), estado.de, 'De', (d) => {
        estado.de = d;
        if (estado.ate && d > estado.ate) { estado.ate = d; selAte.definir(d); }
        estado.pagina = 1; atualizar();
      });
      const selAte = sel($('[data-vgs-ate]', el), estado.ate, 'Até', (d) => {
        estado.ate = d;
        if (estado.de && d < estado.de) { estado.de = d; selDe.definir(d); }
        estado.pagina = 1; atualizar();
      });
    }
    $('[data-vgs-colab]', el).addEventListener('change', (e) => { estado.colab = e.target.value; estado.pagina = 1; atualizar(); });
    $('[data-vgs-busca]', el).addEventListener('input', (e) => { estado.busca = e.target.value; estado.pagina = 1; atualizar(); });
    $('[data-vgs-rodape]', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-vgs-pagina]');
      if (b && !b.disabled) { estado.pagina = Number(b.dataset.vgsPagina); atualizar(); }
    });
    $('[data-vgs-csv]', el).addEventListener('click', exportarCsv);
    atualizar();
  }

  function filtrados() {
    const lista = doPeriodo();
    const { itens, total } = porItem(lista);
    const q = semAcento(estado.busca.trim());
    const visiveis = q ? itens.filter((o) => semAcento(o.nome).includes(q) || [...o.cas].some((c) => c.includes(q))) : itens;
    return { lista, itens: visiveis, total };
  }

  function atualizar() {
    if (!raiz || !raiz.isConnected || !$('[data-vgs-lista]', raiz)) return;
    const { lista, itens, total } = filtrados();
    const colabSel = $('[data-vgs-colab]', raiz);
    colabSel.innerHTML = opcoesColab(lista);
    colabSel.classList.toggle('tem-valor', !!estado.colab);
    const periodo = `${dataBr(estado.de)} até ${dataBr(estado.ate)}`;
    const quem = estado.colab ? ` com ${esc(estado.colab)}` : '';
    $('[data-vgs-resumo]', raiz).innerHTML = `<strong>${dinheiro(total)}</strong> gastos${quem} de ${periodo}`;

    const qtd = itens.reduce((s, o) => s + o.qtd, 0), semPreco = itens.reduce((s, o) => s + o.semPreco, 0);
    const soma = itens.reduce((s, o) => s + o.total, 0);
    $('[data-vgs-titulo]', raiz).textContent = `Gasto por item de ${periodo}`;
    $('[data-vgs-sub]', raiz).textContent = `${num(itens.length)} ${itens.length === 1 ? 'item' : 'itens'} · ${num(qtd)} un entregues · ${dinheiro(soma)}${semPreco ? ` · ${num(semPreco)} un sem preço` : ''}`;

    const paginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
    if (estado.pagina > paginas) estado.pagina = paginas;
    const daPagina = itens.slice((estado.pagina - 1) * POR_PAGINA, estado.pagina * POR_PAGINA);
    const maior = itens[0]?.fatia || 1;
    $('[data-vgs-lista]', raiz).innerHTML = daPagina.length ? daPagina.map((o) => {
      const cas = [...o.cas];
      return `<tr>
        <td><b>${esc(o.nome)}</b></td>
        <td title="${esc(cas.join(', '))}">${cas.length ? esc(cas.length > 2 ? `${cas.slice(0, 2).join(', ')} +${cas.length - 2}` : cas.join(', ')) : '<span class="ecn-traco">—</span>'}</td>
        <td class="num">${num(o.qtd)}</td>
        <td class="num">${o.medio == null ? '<span class="ecn-traco" title="C.A. sem preço cadastrado">sem preço</span>' : dinheiro(o.medio)}</td>
        <td class="num"${o.semPreco ? ` title="${num(o.semPreco)} un sem preço cadastrado ficaram fora do total"` : ''}><b class="vgs-total">${dinheiro(o.total)}</b>${o.semPreco && o.qtdPreco ? '<sup class="vgs-aviso">*</sup>' : ''}</td>
        <td><span class="vgs-fatia"><span class="vgs-fatia__barra"><i style="width:${Math.max(o.total ? 2 : 0, (o.fatia / maior) * 100).toFixed(1)}%"></i></span><em>${pct(o.fatia)}</em></span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="ecn-vazio">Nenhuma entrega encontrada.</td></tr>';

    let ini = Math.max(1, estado.pagina - 2); const fim = Math.min(paginas, ini + 4); ini = Math.max(1, fim - 4);
    let nums = '';
    for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === estado.pagina ? ' is-current' : ''}" data-vgs-pagina="${p}"${p === estado.pagina ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
    $('[data-vgs-rodape]', raiz).innerHTML = `<span class="g-employee-count">Exibindo ${num(daPagina.length)} de ${num(itens.length)} ${itens.length === 1 ? 'item' : 'itens'}</span>` + (paginas > 1 ? `<nav class="g-employee-pagination" aria-label="Páginas">
      <button type="button" class="g-employee-page" data-vgs-pagina="${estado.pagina - 1}"${estado.pagina <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${nums}
      <button type="button" class="g-employee-page" data-vgs-pagina="${estado.pagina + 1}"${estado.pagina >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button></nav>` : '');
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  function exportarCsv() {
    const { itens } = filtrados();
    const br = (n) => (n == null ? '' : n.toFixed(2).replace('.', ','));
    const linhas = [['EPI / Item', 'C.A.', 'Quantidade', 'Sem preço (un)', 'Preço médio', 'Total', '% do gasto']];
    itens.forEach((o) => linhas.push([o.nome, [...o.cas].join(', '), o.qtd, o.semPreco, br(o.medio), br(o.total), (o.fatia * 100).toFixed(1).replace('.', ',')]));
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `valor_gasto_${estado.de || ''}_a_${estado.ate || ''}${estado.colab ? `_${estado.colab.replace(/\s+/g, '_')}` : ''}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  window.EPI_PALCO_VALOR = { montar, atualizar };
})();
