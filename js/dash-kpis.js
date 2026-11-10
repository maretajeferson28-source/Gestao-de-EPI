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
  const gasto = (arr) => { try { return spendingSummary(arr).total || 0; } catch (_) { return 0; } };

  const CARDS = [
    { k: 'itens', tom: 'orange', icone: 'hard-hat', rotulo: 'Itens entregues' },
    { k: 'entregas', tom: 'blue', icone: 'package', rotulo: 'Entregas realizadas' },
    { k: 'colab', tom: 'purple', icone: 'users-round', rotulo: 'Colaboradores atendidos' },
    { k: 'valor', tom: 'red', icone: 'coins', rotulo: 'Valor gasto', moeda: true }
  ];

  function montar() {
    const hero = $('#dashHero');
    if (!hero || $('#dashKpis')) return !!$('#dashKpis');
    const el = document.createElement('section');
    el.className = 'kpi-grid pv-dash-novo';
    el.id = 'dashKpis';
    el.setAttribute('aria-label', 'Resumo de indicadores');
    el.innerHTML = CARDS.map((c) => `
      <article class="kpi-card kpi-card--${c.tom}" data-kpi="${c.k}">
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
    hero.after(el);
    icons();
    return true;
  }

  // Filtro igual ao do Dashboard, mas com o intervalo de datas informado.
  function filtrar(de, ate) {
    const c = val('fColab'), e = val('fEpi'), r = val('fResp');
    return lista().filter((x) => {
      const d = iso(x.data);
      return (!de || d >= de) && (!ate || d <= ate) && (!c || x.colaborador === c) && (!e || x.epi === e) && (!r || x.responsavel === r);
    });
  }
  function medir(arr) {
    return {
      itens: arr.reduce((s, x) => s + (Number(x.quantidade) || 0), 0),
      entregas: arr.length,
      colab: new Set(arr.map((x) => x.colaborador).filter((n) => n && n !== 'Bolsa Reserva')).size,
      valor: gasto(arr)
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
      $('[data-valor]', card).textContent = c.moeda ? dinheiro(agora[c.k]) : num(agora[c.k]);
      badge($('[data-badge]', card), agora[c.k], antes ? antes[c.k] : null, !!c.moeda);
      $('[data-sub]', card).textContent = !ant ? 'todo o período' : ant.periodo ? 'vs. período anterior' : 'vs. mês anterior';
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
    agendar();
    // O cabeçalho pode chegar depois deste arquivo.
    const espera = setInterval(() => { if ($('#dashHero')) { clearInterval(espera); agendar(); } }, 400);
    setTimeout(() => clearInterval(espera), 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
