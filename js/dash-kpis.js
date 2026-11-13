(() => {
  'use strict';
  // Faixa de 4 KPIs do Dashboard novo (css/padrao.css, "Etapa 5a").
  // Usa os mesmos dados e filtros do Dashboard (movements, filtros De/Até,
  // colaborador, EPI, responsável) e compara com o mês anterior.
  if (window.__EPI_DASH_KPIS__) return;
  window.__EPI_DASH_KPIS__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const val = (id) => document.getElementById(id)?.value || '';
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const dinheiro = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const iso = (br) => { const p = String(br || '').split('/'); return p[2] ? `${p[2]}-${p[1]}-${p[0]}` : ''; };
  const pad = (n) => String(n).padStart(2, '0');
  const dataIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lista = () => { try { return Array.isArray(movements) ? movements : []; } catch (_) { return []; } };
  const resumo = (arr) => { try { const s = spendingSummary(arr); return { total: s.total || 0, economia: s.totalReplacementSavings || 0 }; } catch (_) { return { total: 0, economia: 0 }; } };

  const CARDS = [
    { k: 'itens', tom: 'orange', icone: 'hard-hat', rotulo: 'Itens entregues' },
    { k: 'entregas', tom: 'blue', icone: 'package', rotulo: 'Entregas realizadas' },
    { k: 'colab', tom: 'purple', icone: 'users-round', rotulo: 'Colaboradores atendidos' },
    { k: 'valor', tom: 'red', icone: 'banknote', rotulo: 'Valor gasto', moeda: true },
    { k: 'economia', tom: 'green', icone: 'piggy-bank', rotulo: 'Economia', moeda: true, dica: 'Custo médio por unidade de cada item no período, comparado com o período anterior. Clique para ver os detalhes.' }
  ];

  function montar() {
    const hero = $('#dashHero');
    if (!hero || $('#dashKpis')) return !!$('#dashKpis');
    const el = document.createElement('section');
    el.className = 'kpi-grid pv-dash-novo';
    el.id = 'dashKpis';
    el.setAttribute('aria-label', 'Resumo de indicadores');
    el.innerHTML = CARDS.map((c) => `
      <article class="kpi-card kpi-card--${c.tom}" data-kpi="${c.k}"${c.dica ? ` title="${c.dica}"` : ''}>
        <div class="kpi-card__icon" aria-hidden="true"><i data-lucide="${c.icone}"></i></div>
        <div class="kpi-card__body">
          <p class="kpi-card__label">${c.rotulo}</p>
          <div class="kpi-card__value-row">
            <strong class="kpi-card__value${c.moeda ? ' kpi-card__value--currency' : ''}" data-valor>–</strong>
            <span class="kpi-badge kpi-badge--neutral" data-badge hidden></span>
          </div>
          <p class="kpi-card__sub" data-sub>vs. mês anterior</p>
        </div>
      </article>`).join('');
    // Linha de cima: KPIs à esquerda e, à direita, o espaço da busca (#dashLado).
    const topo = document.createElement('div');
    topo.className = 'pv-dash-topo pv-dash-novo';
    topo.id = 'dashTopo';
    topo.innerHTML = '<aside class="pv-dash-lado" id="dashLado"></aside>';
    topo.prepend(el);
    hero.after(topo);
    icons();
    return true;
  }

  // Filtro igual ao do Dashboard, mas com o intervalo de datas informado.
  // Texto da busca do banner (dash-hero.js): parte do nome, sem ligar para acento.
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function casaBusca(x) {
    const b = window.EPI_BUSCA || {};
    const q = semAcento(b.texto);
    if (!q) return true;
    const colab = semAcento(x.colaborador).includes(q), epi = semAcento(x.epi).includes(q);
    return b.modo === 'colaborador' ? colab : b.modo === 'epi' ? epi : (colab || epi);
  }
  function filtrar(de, ate) {
    const c = val('fColab'), e = val('fEpi'), r = val('fResp');
    return lista().filter((x) => {
      const d = iso(x.data);
      return (!de || d >= de) && (!ate || d <= ate) && (!c || x.colaborador === c) && (!e || x.epi === e) && (!r || x.responsavel === r) && casaBusca(x);
    });
  }
  function medir(arr) {
    return {
      itens: arr.reduce((s, x) => s + (Number(x.quantidade) || 0), 0),
      entregas: arr.length,
      colab: new Set(arr.map((x) => x.colaborador).filter((n) => n && n !== 'Bolsa Reserva')).size,
      ...(() => { const r = resumo(arr); return { valor: r.total, economia: r.economia }; })()
    };
  }
  // Mês anterior ao período escolhido. Sem período ("Todo o período"), não há comparação.
  function periodoAnterior(de, ate) {
    if (!de || !ate) return null;
    const ini = new Date(`${de}T00:00:00`), fim = new Date(`${ate}T00:00:00`);
    const mesInteiro = ini.getDate() === 1 && fim.getMonth() === ini.getMonth() && new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1).getDate() === 1;
    if (mesInteiro) {
      return { de: dataIso(new Date(ini.getFullYear(), ini.getMonth() - 1, 1)), ate: dataIso(new Date(ini.getFullYear(), ini.getMonth(), 0)) };
    }
    const dias = Math.round((fim - ini) / 86400000) + 1;
    return { de: dataIso(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - dias)), ate: dataIso(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - 1)), periodo: true };
  }

  function badge(el, atual, antes, ehGasto) {
    if (antes == null) { el.hidden = true; return; }
    el.hidden = false;
    let classe = 'neutral', texto;
    if (!antes) { texto = atual ? 'novo' : '0%'; }
    else {
      const pct = Math.round(((atual - antes) / antes) * 100);
      if (pct === 0) texto = '0%';
      else {
        texto = Math.abs(pct) >= 1000 ? `${pct > 0 ? "↑" : "↓"} ${Math.round(atual / antes)}x` : `${pct > 0 ? "↑ +" : "↓ "}${pct}%`;
        if (ehGasto) classe = pct > 0 ? 'cost' : 'up';
        else classe = pct > 0 ? 'up' : 'neutral';
      }
    }
    el.className = `kpi-badge kpi-badge--${classe}`;
    el.textContent = texto;
  }

  function atualizar() {
    if (!montar()) return;
    const de = val('fDe'), ate = val('fAte');
    const agora = medir(filtrar(de, ate));
    const ant = periodoAnterior(de, ate);
    const antes = ant ? medir(filtrar(ant.de, ant.ate)) : null;
    CARDS.forEach((c) => {
      const card = $(`#dashKpis [data-kpi="${c.k}"]`);
      // Moeda: "R$" menor ao lado do número, que fica do tamanho das quantidades.
      if (c.moeda) {
        const v = $('[data-valor]', card);
        v.innerHTML = '';
        const rs = document.createElement('small'); rs.className = 'kpi-card__moeda'; rs.textContent = 'R$';
        v.append(rs, document.createTextNode(dinheiro(agora[c.k]).replace(/^R\$\s*/, '')));
      } else $('[data-valor]', card).textContent = num(agora[c.k]);
      // Sem os selos de comparação (poluíam o card): o subtítulo diz o período.
      $('[data-badge]', card).hidden = true;
      const mesTxt = document.querySelector('[data-hero-periodo]')?.textContent.trim() || '';
      $('[data-sub]', card).textContent = !ant ? 'todo o período' : ant.periodo || !mesTxt || /todo/i.test(mesTxt) ? 'no período escolhido' : `em ${mesTxt}`;
      // Economia: conta por período (js/economia.js), custo médio por unidade
      // do período comparado com o período anterior.
      if (c.k === 'economia' && window.EPI_ECONOMIA) {
        const e = window.EPI_ECONOMIA.doCard();
        const v = $('[data-valor]', card);
        v.innerHTML = '';
        // Negativo = gastou mais por unidade que no período anterior: "−R$ 0,84".
        const rs = document.createElement('small'); rs.className = 'kpi-card__moeda'; rs.textContent = e.total < 0 ? '−R$' : 'R$';
        v.append(rs, document.createTextNode(dinheiro(Math.abs(e.total)).replace(/^R\$\s*/, '')));
        $('[data-sub]', card).textContent = e.texto;
      }
    });
  }

  // O Dashboard reescreve #kTotal/#kSpend toda vez que recalcula: seguimos junto.
  let pendente = null;
  const agendar = () => { clearTimeout(pendente); pendente = setTimeout(atualizar, 30); };
  function start() {
    const alvos = ['#kTotal', '#kMov', '#kCol', '#kSpend'].map((s) => $(s)).filter(Boolean);
    const obs = new MutationObserver(agendar);
    alvos.forEach((t) => obs.observe(t, { childList: true, characterData: true, subtree: true }));
    window.addEventListener('epi:data-loaded', agendar);
    window.addEventListener('epi:busca', agendar);
    agendar();
    // O cabeçalho pode chegar depois deste arquivo.
    const espera = setInterval(() => { if ($('#dashHero')) { clearInterval(espera); agendar(); } }, 400);
    setTimeout(() => clearInterval(espera), 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
