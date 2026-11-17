(() => {
  'use strict';
  // Notas Fiscais (PC): a tela principal passa a ser a lista das notas já
  // importadas, no padrão de Estoque / Movimentações (cabeçalho com ícone,
  // 4 cards à esquerda, barra com busca e filtros, tabela com páginas).
  // "Importar XML" mostra a importação de sempre (js/nfe.js), com "Voltar às
  // notas". "Ver nota" abre a DANFE de uma nota já importada (XML guardado).
  // Só lê dados.
  if (window.__EPI_NOTAS_LISTA__) return;
  window.__EPI_NOTAS_LISTA__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
  const dinheiro = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const pagina = () => document.querySelector('.page[data-page-content="notas"]');
  const cnpj = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (v || ''); };
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // Data de emissão no fuso de Brasília.
  const diaBR = (iso) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })); };
  const dataTxt = (iso) => { const d = diaBR(iso); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—'; };
  const mesChave = (iso) => { const d = diaBR(iso); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : ''; };

  let notas = [], carregado = false, pag = 1, vista = 'lista';
  const filtro = { busca: '', mes: '', forn: '', sem: false };

  async function carregar() {
    const cli = db();
    if (!cli) return;
    const { data, error } = await cli.from('nfe_entradas')
      .select('id,numero,serie,emitente_nome,emitente_documento,chave_acesso,data_emissao,valor_total,status,created_at,nfe_entrada_itens(quantidade_estoque,epi_id)')
      .order('data_emissao', { ascending: false });
    if (error) { console.error('[Notas]', error); }
    notas = (data || []).map((n) => {
      const itens = n.nfe_entrada_itens || [];
      return { ...n, linhas: itens.length, noEstoque: itens.reduce((t, i) => t + (Number(i.quantidade_estoque) || 0), 0), pendentes: itens.filter((i) => !i.epi_id).length };
    });
    carregado = true;
    desenhar();
  }

  // ---- Monta a lista em volta da importação que o nfe.js já criou ----
  function montar() {
    const pg = pagina();
    if (!pg || $('.nfl', pg)) return !!pg;
    const antigos = [...pg.children];
    const imp = document.createElement('div');
    imp.className = 'nfl-import';
    imp.hidden = true;
    imp.innerHTML = `<div class="nfl-import-barra">
        <button type="button" class="btn ecn-btn nfl-voltar" data-nfl-voltar><i data-lucide="arrow-left"></i>Voltar às notas</button>
        <span class="nfl-import-tit" data-nfl-import-tit>Importar XML</span>
        <div class="nfl-abas" role="tablist" aria-label="Ver conferência ou nota" hidden>
          <button type="button" role="tab" data-nfl-aba="conf" aria-selected="true"><i data-lucide="list-checks"></i>Conferência</button>
          <button type="button" role="tab" data-nfl-aba="nota" aria-selected="false"><i data-lucide="file-text"></i>Nota (DANFE)</button>
        </div>
        <span class="nfl-import-espaco"></span>
        <div class="nfl-salvar" id="nfeSaveSlot"></div>
      </div>`;
    antigos.forEach((el) => imp.appendChild(el));
    // Coluna da direita: aviso de nota repetida + conferência (aba 1) e a DANFE (aba 2).
    const layout = $('.nfe-layout', imp), stage = $('.nfe-stage', imp);
    if (layout && stage) {
      const dir = document.createElement('div');
      dir.className = 'nfl-imp-dir';
      dir.innerHTML = '<div class="nfl-aviso" id="nfeAvisoSlot" hidden></div><div class="nfl-review" id="nfeReviewSlot"></div>';
      stage.before(dir);
      dir.appendChild(stage);
    }
    imp.querySelectorAll('[data-nfl-aba]').forEach((b) => b.addEventListener('click', () => aba(b.dataset.nflAba)));
    const lista = document.createElement('div');
    lista.className = 'nfl';
    lista.innerHTML = `
      <div class="estq-head nfl-head">
        <span class="estq-head-ic" aria-hidden="true"><i data-lucide="receipt-text"></i></span>
        <h2>Notas Fiscais</h2>
        <p>Notas de compra importadas pelo XML: o que entrou, de quem e quanto custou.</p>
      </div>
      <section class="kpi-grid estq-kpis nfl-kpis" aria-label="Resumo das notas">
        <article class="kpi-card kpi-card--orange"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="receipt-text"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Notas</p><div class="kpi-card__value-row"><strong class="kpi-card__value" data-nfl-kpi="notas">–</strong></div><p class="kpi-card__sub" data-nfl-kpi="notasSub">importadas</p></div></article>
        <article class="kpi-card kpi-card--green"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="banknote"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Valor</p><div class="kpi-card__value-row"><strong class="kpi-card__value nfl-kpi-moeda" data-nfl-kpi="valor">–</strong></div><p class="kpi-card__sub">soma das notas</p></div></article>
        <article class="kpi-card kpi-card--blue"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="package-plus"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Itens</p><div class="kpi-card__value-row"><strong class="kpi-card__value" data-nfl-kpi="itens">–</strong></div><p class="kpi-card__sub">entraram no estoque</p></div></article>
        <article class="kpi-card kpi-card--purple"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="calendar-days"></i></div><div class="kpi-card__body"><p class="kpi-card__label">No mês</p><div class="kpi-card__value-row"><strong class="kpi-card__value nfl-kpi-moeda" data-nfl-kpi="mes">–</strong></div><p class="kpi-card__sub" data-nfl-kpi="mesSub">—</p></div></article>
        <article class="kpi-card kpi-card--yellow nfl-kpi-sem" data-nfl-sem role="button" tabindex="0" title="Mostrar só as notas com linhas fora do estoque"><div class="kpi-card__icon" aria-hidden="true"><i data-lucide="link-2-off"></i></div><div class="kpi-card__body"><p class="kpi-card__label">Sem vínculo</p><div class="kpi-card__value-row"><strong class="kpi-card__value" data-nfl-kpi="sem">–</strong></div><p class="kpi-card__sub" data-nfl-kpi="semSub">linhas fora do estoque</p></div></article>
      </section>
      <div class="epi-barra nfl-barra">
        <label class="colab-busca epi-busca nfl-busca"><i data-lucide="search" aria-hidden="true"></i><input type="search" data-nfl-busca placeholder="Buscar NF, fornecedor ou chave" autocomplete="off" aria-label="Buscar nota"></label>
        <div class="colab-filtros">
          <label class="colab-filtro"><select data-nfl-mes aria-label="Filtrar por período"><option value="">Período</option></select><i data-lucide="chevron-down" aria-hidden="true"></i></label>
          <label class="colab-filtro"><select data-nfl-forn aria-label="Filtrar por fornecedor"><option value="">Fornecedor</option></select><i data-lucide="chevron-down" aria-hidden="true"></i></label>
        </div>
        <button class="colab-novo epi-novo" type="button" data-nfl-importar><i data-lucide="file-up" aria-hidden="true"></i>Importar XML</button>
      </div>
      <div class="epi-tab-wrap nfl-tab-wrap"><table class="epi-tab nfl-tab">
        <colgroup><col class="c-data"><col class="c-nf"><col class="c-serie"><col><col class="c-num"><col class="c-valor"><col class="c-sit"><col class="c-acao"></colgroup>
        <thead><tr><th>Emissão</th><th>NF</th><th>Série</th><th>Fornecedor</th><th class="num">Itens</th><th class="num">Valor</th><th>Status</th><th class="acao">Ação</th></tr></thead>
        <tbody data-nfl-body></tbody>
      </table></div>
      <footer class="g-employee-footer mov-rodape epi-rodape nfl-rodape" data-nfl-rodape></footer>`;
    pg.prepend(lista);
    pg.appendChild(imp);
    pg.classList.add('nfl-pronta');

    $('[data-nfl-busca]', lista).addEventListener('input', (e) => { filtro.busca = e.target.value; pag = 1; desenhar(); });
    $('[data-nfl-mes]', lista).addEventListener('change', (e) => { filtro.mes = e.target.value; pag = 1; desenhar(); });
    $('[data-nfl-forn]', lista).addEventListener('change', (e) => { filtro.forn = e.target.value; pag = 1; desenhar(); });
    $('[data-nfl-importar]', lista).addEventListener('click', () => irPara('importar'));
    // Card "Sem vínculo": liga / desliga o filtro das notas com linhas soltas.
    const semCard = $('[data-nfl-sem]', lista);
    const alternaSem = () => { if (semCard.classList.contains('is-vazio')) return; filtro.sem = !filtro.sem; pag = 1; menos = 0; desenhar(); };
    semCard.addEventListener('click', alternaSem);
    semCard.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternaSem(); } });
    $('[data-nfl-voltar]', imp).addEventListener('click', () => { irPara('lista'); carregar(); });
    $('[data-nfl-rodape]', lista).addEventListener('click', (e) => { const b = e.target.closest('[data-nfl-pagina]'); if (b && !b.disabled) { pag = Number(b.dataset.nflPagina); desenhar(); } });
    $('[data-nfl-body]', lista).addEventListener('click', (e) => {
      const ver = e.target.closest('[data-nfl-ver]');
      if (ver) return verNota(ver.dataset.nflVer);
      const xml = e.target.closest('[data-nfl-xml]');
      if (xml) return baixarXml(xml.dataset.nflXml);
    });
    window.addEventListener('resize', () => { if (vista === 'lista') { menos = 0; desenhar(); } });
    icons();
    return true;
  }

  // Abas da importação: Conferência (tabela para o estoque) ou Nota (DANFE).
  function aba(qual) {
    const imp = $('.nfl-import', pagina());
    if (!imp) return;
    imp.classList.toggle('aba-nota', qual === 'nota');
    imp.querySelectorAll('[data-nfl-aba]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.nflAba === qual)));
  }
  // XML carregado: mostra as abas e avisa se a nota já está na lista.
  function notaCarregada() {
    const imp = $('.nfl-import', pagina());
    if (!imp) return;
    const atual = window.EPI_NFE_VIEWER?.getCurrent?.();
    const tem = !!atual?.xmlOriginal;
    imp.classList.toggle('sem-nota', !tem);
    $('.nfl-abas', imp).hidden = !tem;
    const aviso = $('#nfeAvisoSlot', imp);
    const chave = tem ? (String(atual.xmlOriginal).match(/Id="NFe(\d{44})"/) || [])[1] : '';
    const ja = chave ? notas.find((n) => n.chave_acesso === chave) : null;
    if (aviso) {
      aviso.hidden = !ja || vista === 'ver';
      aviso.innerHTML = ja ? `<i data-lucide="info"></i><span><b>Esta nota já foi importada</b> em ${dataTxt(ja.created_at)} (NF ${esc(ja.numero || '')}, ${dinheiro(ja.valor_total)}). Salvar de novo só atualiza a entrada, não soma o estoque duas vezes.</span>` : '';
    }
    if (tem) aba(vista === 'ver' ? 'nota' : 'conf');
    icons();
  }
  window.addEventListener('epi:nfe-selected', () => setTimeout(notaCarregada, 0));

  function irPara(v, titulo) {
    const pg = pagina();
    if (!pg) return;
    // Importar do zero: limpa a nota que estava aberta (ex.: uma vista antes).
    if (v === 'importar' && vista !== 'importar') window.EPI_NFE_VIEWER?.clear?.();
    vista = v;
    pg.classList.toggle('nfl-vendo', v === 'ver');
    setTimeout(notaCarregada, 0);
    $('.nfl', pg).hidden = v !== 'lista';
    $('.nfl-import', pg).hidden = v === 'lista';
    pg.classList.toggle('nfl-importando', v !== 'lista');
    const t = $('[data-nfl-import-tit]', pg);
    if (t) t.textContent = titulo || 'Importar XML';
    if (v === 'lista') { menos = 0; desenhar(); }
    window.scrollTo({ top: 0 });
    document.querySelector('.content')?.scrollTo?.({ top: 0 });
  }

  // ---- Ver / baixar o XML guardado de uma nota já importada ----
  async function xmlDa(id) {
    const { data, error } = await db().from('nfe_entradas').select('xml_original,arquivo_nome,chave_acesso,numero').eq('id', id).single();
    if (error) throw error;
    return data;
  }
  async function verNota(id) {
    try {
      const n = await xmlDa(id);
      const inp = document.getElementById('nfeFileInput');
      if (!inp || !n?.xml_original) return;
      irPara('ver', `NF ${n.numero || ''} · nota já importada`);
      const dt = new DataTransfer();
      dt.items.add(new File([n.xml_original], n.arquivo_nome || `${n.chave_acesso}.xml`, { type: 'text/xml' }));
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) { console.error(err); alert('Não foi possível abrir a nota: ' + (err.message || err)); }
  }
  async function baixarXml(id) {
    try {
      const n = await xmlDa(id);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([n.xml_original], { type: 'text/xml' }));
      a.download = n.arquivo_nome || `${n.chave_acesso}.xml`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) { console.error(err); alert('Não foi possível baixar o XML: ' + (err.message || err)); }
  }

  // ---- Desenho ----
  let menos = 0;
  function porPagina() {
    const wrap = $('.nfl-tab-wrap', pagina());
    const topo = wrap && wrap.offsetParent ? wrap.getBoundingClientRect().top : 230;
    return Math.max(5, Math.floor((window.innerHeight - topo - 38 - 50 - 16) / 46) - menos);
  }
  function opcoes(sel, valores, rotulo, atual) {
    sel.innerHTML = `<option value="">${rotulo}</option>` + valores.map(([v, t]) => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(t)}</option>`).join('');
    sel.classList.toggle('tem-valor', !!atual);
  }

  function desenhar() {
    const pg = pagina(), raiz = pg && $('.nfl', pg);
    if (!raiz || vista !== 'lista') return;
    const ativas = notas.filter((n) => n.status !== 'cancelada');
    // Cards
    const k = (n, v) => { const el = $(`[data-nfl-kpi="${n}"]`, raiz); if (el) el.innerHTML = v; };
    const moeda = (v) => `<small class="kpi-card__moeda">R$</small>${dinheiro(v).replace(/^R\$\s*/, '')}`;
    k('notas', num(ativas.length));
    const nForn = new Set(ativas.map((n) => n.emitente_documento || n.emitente_nome)).size;
    k('notasSub', `${num(nForn)} ${nForn === 1 ? 'fornecedor' : 'fornecedores'}`);
    k('valor', moeda(ativas.reduce((t, n) => t + (Number(n.valor_total) || 0), 0)));
    k('itens', num(ativas.reduce((t, n) => t + n.noEstoque, 0)));
    const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const chaveHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const doMes = ativas.filter((n) => mesChave(n.data_emissao) === chaveHoje);
    k('mes', moeda(doMes.reduce((t, n) => t + (Number(n.valor_total) || 0), 0)));
    k('mesSub', `${num(doMes.length)} ${doMes.length === 1 ? 'nota' : 'notas'} em ${MES[hoje.getMonth()]}/${hoje.getFullYear()}`);

    // Sem vínculo: linhas de nota sem EPI ligado (ficaram fora do estoque).
    const semLinhas = ativas.reduce((t, n) => t + n.pendentes, 0), semNotas = ativas.filter((n) => n.pendentes).length;
    k('sem', num(semLinhas));
    k('semSub', semLinhas ? `em ${num(semNotas)} ${semNotas === 1 ? 'nota' : 'notas'}${filtro.sem ? ' · filtrando' : ' · clique para ver'}` : 'tudo ligado ao estoque');
    if (!semLinhas && filtro.sem) filtro.sem = false;
    const semCard = $('[data-nfl-sem]', raiz);
    semCard.title = semLinhas ? (filtro.sem ? 'Mostrar todas as notas' : 'Mostrar só as notas com linhas fora do estoque') : 'Todas as linhas das notas estão ligadas a um EPI';
    // Sempre amarelo; sem pendência ele só não reage ao clique.
    semCard.classList.toggle('is-vazio', !semLinhas);
    semCard.classList.toggle('is-ativo', filtro.sem);

    // Filtros
    const meses = [...new Set(notas.map((n) => mesChave(n.data_emissao)).filter(Boolean))].sort().reverse();
    opcoes($('[data-nfl-mes]', raiz), meses.map((m) => [m, `${MES[Number(m.slice(5)) - 1]}/${m.slice(0, 4)}`]), 'Período', filtro.mes);
    const forns = [...new Set(notas.map((n) => n.emitente_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    opcoes($('[data-nfl-forn]', raiz), forns.map((f) => [f, f]), 'Fornecedor', filtro.forn);

    const q = semAcento(filtro.busca.trim());
    const lista = notas.filter((n) => (!q || semAcento(`${n.numero} ${n.serie} ${n.emitente_nome} ${n.emitente_documento} ${n.chave_acesso}`).includes(q))
      && (!filtro.mes || mesChave(n.data_emissao) === filtro.mes) && (!filtro.forn || n.emitente_nome === filtro.forn) && (!filtro.sem || n.pendentes > 0));

    const por = porPagina();
    const paginas = Math.max(1, Math.ceil(lista.length / por));
    if (pag > paginas) pag = paginas;
    const daPagina = lista.slice((pag - 1) * por, pag * por);
    $('[data-nfl-body]', raiz).innerHTML = daPagina.map((n) => {
      const st = n.status === 'cancelada' ? ['critico', 'Cancelada'] : n.pendentes ? ['atencao', `Entrada · ${n.pendentes} sem vínculo`] : ['ok', 'Entrada'];
      return `<tr>
        <td>${dataTxt(n.data_emissao)}</td>
        <td><strong class="epi-tab-nome">${esc(n.numero || '—')}</strong></td>
        <td>${esc(n.serie || '—')}</td>
        <td><strong class="epi-tab-nome" title="${esc([n.emitente_nome, cnpj(n.emitente_documento)].filter(Boolean).join(' · '))}">${esc(n.emitente_nome || '—')}</strong></td>
        <td class="num" title="${num(n.linhas)} ${n.linhas === 1 ? 'linha' : 'linhas'} na nota">${num(n.noEstoque)}</td>
        <td class="num"><b class="epi-tab-saldo">${dinheiro(n.valor_total)}</b></td>
        <td><span class="epi-sit epi-sit--${st[0]}" title="${esc(st[1])}">${esc(st[1])}</span></td>
        <td class="acao"><div class="table-action-group">
          <button class="btn movement-action-btn" type="button" data-nfl-ver="${esc(n.id)}" title="Ver a nota (DANFE)" aria-label="Ver a nota"><i data-lucide="eye"></i></button>
          <button class="btn movement-action-btn" type="button" data-nfl-xml="${esc(n.id)}" title="Baixar o XML" aria-label="Baixar o XML"><i data-lucide="file-code-2"></i></button>
        </div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="epi-tab-nada">${carregado ? (notas.length ? 'Nenhuma nota com esses filtros.' : 'Nenhuma nota importada ainda. Use "Importar XML".') : 'Carregando…'}</td></tr>`;

    let ini = Math.max(1, pag - 2); const fim = Math.min(paginas, ini + 4); ini = Math.max(1, fim - 4);
    let nums = '';
    for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === pag ? ' is-current' : ''}" data-nfl-pagina="${p}"${p === pag ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
    $('[data-nfl-rodape]', raiz).innerHTML = `<span class="g-employee-count">Exibindo ${num(daPagina.length)} de ${num(lista.length)} ${lista.length === 1 ? 'nota' : 'notas'}</span>` + (paginas > 1 ? `<nav class="g-employee-pagination" aria-label="Páginas">
      <button type="button" class="g-employee-page" data-nfl-pagina="${pag - 1}"${pag <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>${nums}
      <button type="button" class="g-employee-page" data-nfl-pagina="${pag + 1}"${pag >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button></nav>` : '');
    icons();
    const c = document.querySelector('.content');
    if (c && c.scrollHeight > c.clientHeight + 1 && por > 5 && menos < 6) { menos++; desenhar(); }
  }

  // A página é criada pelo nfe.js; espera ela existir e recarrega ao abrir.
  setInterval(() => {
    const pg = pagina();
    if (!pg) return;
    if (!$('.nfl', pg)) { if (montar()) carregar(); }
  }, 800);
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.nav button');
    if (nav && /notas/i.test(nav.textContent || '')) setTimeout(() => { if (pagina()?.classList.contains('active')) { if (vista !== 'lista') irPara('lista'); carregar(); } }, 100);
  });
  // Nota salva pela importação: a lista se atualiza.
  window.addEventListener('epi:stock-changed', (e) => { if (e.detail?.source === 'nfe') carregar(); });
  window.EPI_NOTAS_LISTA = { recarregar: carregar };
})();
