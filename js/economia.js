(() => {
  'use strict';
  // Conteúdo do palco "Economia" do Dashboard (js/dash-palco.js).
  // Cada C.A. Atual é comparado com um C.A. Antigo do mesmo item, pelas
  // entregas do período e dos filtros do Dashboard. Só lê dados.
  if (window.__EPI_ECONOMIA__) return;
  window.__EPI_ECONOMIA__ = true;

  const $ = (sel, r = document) => r.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dinheiro = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

  // Mesmos filtros do card Economia (dash-kpis.js): período, colaborador,
  // EPI, responsável e a busca do banner.
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function doDashboard() {
    const de = val('fDe'), ate = val('fAte'), c = val('fColab'), e = val('fEpi'), r = val('fResp');
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
  const estado = { atual: '', base: '' };

  function calcular() {
    const lista = doDashboard();
    const linhas = [];
    atuais().filter((v) => !estado.atual || v.id === estado.atual).forEach((atual) => {
      const preco = Number(atual.preco);
      const antigos = antigosDe(atual.epi_id);
      const base = estado.base ? antigos.find((v) => v.id === estado.base) : antigos.find((v) => Number(v.preco) > preco);
      if (!base) return;
      const ca = chave(atual.ca);
      const qtd = lista.filter((m) => m.epi_id === atual.epi_id && chave(m.ca) === ca).reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
      const unit = Number(base.preco) - preco;
      linhas.push({ atual, base, qtd, unit, total: unit * qtd });
    });
    return linhas.sort((a, b) => b.total - a.total || b.unit - a.unit);
  }

  function opcoesAtual() {
    return '<option value="">Todos os C.A.s atuais</option>' + atuais()
      .map((v) => `<option value="${esc(v.id)}"${v.id === estado.atual ? ' selected' : ''}>${esc(nomeEpi(v.epi_id))} · ${esc(titulo(v.ca))} (${dinheiro(v.preco)})</option>`).join('');
  }
  function opcoesBase() {
    const atual = variantes().find((v) => v.id === estado.atual);
    if (!atual) return '<option value="">Automático</option>';
    return '<option value="">Automático (antigo mais barato acima do atual)</option>' + antigosDe(atual.epi_id)
      .map((v) => `<option value="${esc(v.id)}"${v.id === estado.base ? ' selected' : ''}>${esc(titulo(v.ca))}${v.apelido ? ` · ${esc(v.apelido)}` : ''} (${dinheiro(v.preco)})</option>`).join('');
  }

  function montar(el) {
    raiz = el;
    el.innerHTML = `
      <div class="palco-econ">
        <div class="palco-lado">
          <span class="palco-kicker">ECONOMIA POR SUBSTITUIÇÃO</span>
          <strong class="palco-grande" data-econ-total>R$ 0,00</strong>
          <p class="palco-sub" data-econ-sub></p>
          <label class="palco-campo"><span>C.A. atual</span><select data-econ-atual></select></label>
          <label class="palco-campo"><span>Comparar com</span><select data-econ-base disabled></select></label>
          <p class="palco-nota">Entram os C.A.s marcados como <b>Atual</b> ou <b>Antigo</b> no prontuário, com preço cadastrado.</p>
        </div>
        <div class="palco-tabela-wrap">
          <table class="palco-tabela">
            <thead><tr><th>EPI / Item</th><th>C.A. atual</th><th>Comparado com</th><th class="num">Entregues</th><th class="num">Por unidade</th><th class="num">Economia</th></tr></thead>
            <tbody data-econ-corpo></tbody>
          </table>
        </div>
      </div>`;
    $('[data-econ-atual]', el).addEventListener('change', (e) => { estado.atual = e.target.value; estado.base = ''; atualizar(); });
    $('[data-econ-base]', el).addEventListener('change', (e) => { estado.base = e.target.value; atualizar(); });
    atualizar();
  }

  function atualizar() {
    if (!raiz || !raiz.isConnected) return;
    if (estado.atual && !atuais().some((v) => v.id === estado.atual)) { estado.atual = ''; estado.base = ''; }
    const sa = $('[data-econ-atual]', raiz), sb = $('[data-econ-base]', raiz);
    sa.innerHTML = opcoesAtual();
    sb.innerHTML = opcoesBase();
    sb.disabled = !estado.atual;
    const linhas = calcular();
    const total = linhas.reduce((s, l) => s + l.total, 0);
    const qtd = linhas.reduce((s, l) => s + l.qtd, 0);
    const tot = $('[data-econ-total]', raiz);
    tot.textContent = dinheiro(total);
    tot.classList.toggle('is-neg', total < 0);
    const mes = document.querySelector('[data-hero-periodo]')?.textContent.trim() || '';
    const periodo = !val('fDe') && !val('fAte') ? 'em todo o período' : mes && !/todo/i.test(mes) ? `em ${mes}` : 'no período escolhido';
    $('[data-econ-sub]', raiz).textContent = `${periodo} · ${num(qtd)} ${qtd === 1 ? 'item comparado' : 'itens comparados'} · ${num(linhas.length)} ${linhas.length === 1 ? 'comparação' : 'comparações'}`;
    $('[data-econ-corpo]', raiz).innerHTML = linhas.length ? linhas.map((l) => `
      <tr>
        <td>${esc(nomeEpi(l.atual.epi_id))}${l.atual.apelido ? `<small>${esc(l.atual.apelido)}</small>` : ''}</td>
        <td><b>${esc(titulo(l.atual.ca))}</b><small>${dinheiro(l.atual.preco)}</small></td>
        <td><b>${esc(titulo(l.base.ca))}</b><small>${dinheiro(l.base.preco)}</small></td>
        <td class="num">${num(l.qtd)}</td>
        <td class="num${l.unit < 0 ? ' is-neg' : ''}">${dinheiro(l.unit)}</td>
        <td class="num palco-total${l.total < 0 ? ' is-neg' : ''}">${dinheiro(l.total)}</td>
      </tr>`).join('')
      : '<tr><td colspan="6" class="palco-vazio">Nenhuma comparação possível com esses filtros.</td></tr>';
  }

  window.EPI_PALCO_ECONOMIA = { montar, atualizar };
})();
