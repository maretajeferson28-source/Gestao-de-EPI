(() => {
  'use strict';
  // Faixa do Dashboard embaixo dos KPIs (PC): três cartões da mesma altura,
  // na identidade azul-aço, sem rolagem.
  //  1. Entregas por mês: itens entregues nos 6 meses até o mês escolhido
  //     (ou o atual), com o mês da ponta destacado.
  //  2. Mais entregues: os 5 EPIs que mais saíram no período escolhido.
  //  3. Precisa de atenção: C.A. vencido ou vencendo (30 dias), estoque
  //     crítico ou baixo e entregas esperando na fila. Cada linha leva à tela.
  // Usa os mesmos dados e filtros dos KPIs (movements, De/Até e a busca).
  if (window.__EPI_DASH_FAIXA__) return;
  window.__EPI_DASH_FAIXA__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const val = (id) => document.getElementById(id)?.value || '';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const num = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
  const iso = (br) => { const p = String(br || '').split('/'); return p[2] ? `${p[2]}-${p[1]}-${p[0]}` : ''; };
  const pad = (n) => String(n).padStart(2, '0');
  const lista = () => { try { return Array.isArray(movements) ? movements : []; } catch (_) { return []; } };
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const pode = (k) => { try { return typeof window.epiPode === 'function' ? window.epiPode(k) : currentIsAdmin === true; } catch (_) { return false; } };
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // Mesmo filtro dos KPIs (dash-kpis.js): colaborador/EPI/responsável e busca do banner.
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

  function montar() {
    const topo = $('#dashTopo');
    if (!topo) return false;
    if ($('#dashFaixa')) return true;
    const el = document.createElement('section');
    el.className = 'dash-faixa pv-dash-novo';
    el.id = 'dashFaixa';
    el.setAttribute('aria-label', 'Resumo da operação');
    el.innerHTML = `
      <article class="dfx-card">
        <header class="dfx-cab"><i data-lucide="chart-column"></i><h3>Entregas por mês</h3><small data-dfx-meses></small></header>
        <div class="dfx-barras" data-dfx-barras></div>
      </article>
      <article class="dfx-card">
        <header class="dfx-cab"><i data-lucide="trophy"></i><h3>Mais entregues</h3><small data-dfx-periodo></small></header>
        <ol class="dfx-top" data-dfx-top></ol>
      </article>
      <article class="dfx-card">
        <header class="dfx-cab"><i data-lucide="bell-ring"></i><h3>Precisa de atenção</h3></header>
        <div class="dfx-atencao">
          <button type="button" class="dfx-alerta" data-dfx-ir="epis"><span class="dfx-alerta-ic is-vermelho"><i data-lucide="badge-alert"></i></span><span class="dfx-alerta-txt"><b>C.A. vencido ou vencendo</b><small>nos próximos 30 dias</small></span><strong data-dfx-ca>–</strong><i data-lucide="chevron-right" class="dfx-seta"></i></button>
          <button type="button" class="dfx-alerta" data-dfx-ir="estoque"><span class="dfx-alerta-ic is-amarelo"><i data-lucide="package-x"></i></span><span class="dfx-alerta-txt"><b>Estoque crítico ou baixo</b><small>zerado ou no mínimo</small></span><strong data-dfx-estoque>–</strong><i data-lucide="chevron-right" class="dfx-seta"></i></button>
          <button type="button" class="dfx-alerta" data-dfx-ir="programar"><span class="dfx-alerta-ic is-azul"><i data-lucide="list-checks"></i></span><span class="dfx-alerta-txt"><b>Entregas na fila</b><small>programadas, esperando</small></span><strong data-dfx-fila>–</strong><i data-lucide="chevron-right" class="dfx-seta"></i></button>
        </div>
      </article>`;
    topo.after(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dfx-ir]');
      if (!b || b.disabled) return;
      const p = b.dataset.dfxIr;
      const nav = document.querySelector(`.nav button[data-page="${p}"]`);
      if (nav && !nav.hidden) nav.click(); else if (typeof window.nav === 'function') window.nav(p);
    });
    icons();
    return true;
  }

  // ---- 1. Entregas por mês ----
  function desenharMeses() {
    const ate = val('fAte');
    // Mês da ponta: o fim do período escolhido; sem período, o mês atual.
    const fim = ate ? new Date(+ate.slice(0, 4), +ate.slice(5, 7) - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const meses = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(fim.getFullYear(), fim.getMonth() - i, 1); meses.push({ k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, rot: MESES[d.getMonth()], ano: d.getFullYear() }); }
    const soma = new Map(meses.map((m) => [m.k, 0]));
    filtrar('', '').forEach((x) => { const k = iso(x.data).slice(0, 7); if (soma.has(k)) soma.set(k, soma.get(k) + (Number(x.quantidade) || 0)); });
    const max = Math.max(1, ...soma.values());
    $('[data-dfx-meses]').textContent = `${meses[0].rot}/${String(meses[0].ano).slice(2)} a ${meses[5].rot}/${String(meses[5].ano).slice(2)}`;
    $('[data-dfx-barras]').innerHTML = meses.map((m, i) => {
      const v = soma.get(m.k), h = Math.round((v / max) * 100);
      return `<div class="dfx-barra${i === 5 ? ' is-atual' : ''}" title="${m.rot}/${m.ano}: ${num(v)} ${v === 1 ? 'item' : 'itens'}">
        <span class="dfx-barra-val">${v ? num(v) : ''}</span>
        <span class="dfx-barra-trilho"><span class="dfx-barra-fill" style="height:${v ? Math.max(4, h) : 0}%"></span></span>
        <span class="dfx-barra-mes">${m.rot}</span>
      </div>`;
    }).join('');
  }

  // ---- 2. Mais entregues ----
  function desenharTop() {
    const arr = filtrar(val('fDe'), val('fAte'));
    const soma = new Map();
    arr.forEach((x) => { const n = x.epi || '—'; soma.set(n, (soma.get(n) || 0) + (Number(x.quantidade) || 0)); });
    const top = [...soma.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 5);
    const max = Math.max(1, ...top.map((t) => t[1]));
    const mesTxt = document.querySelector('[data-hero-periodo]')?.textContent.trim() || '';
    $('[data-dfx-periodo]').textContent = !mesTxt || /todo/i.test(mesTxt) ? 'todo o período' : mesTxt;
    $('[data-dfx-top]').innerHTML = top.length ? top.map(([n, q], i) => `
      <li title="${esc(n)}: ${num(q)}">
        <span class="dfx-pos">${i + 1}</span>
        <span class="dfx-nome">${esc(n)}</span>
        <span class="dfx-qtd">${num(q)}</span>
        <span class="dfx-linha"><span style="width:${Math.max(3, Math.round((q / max) * 100))}%"></span></span>
      </li>`).join('') : '<li class="dfx-vazio">Nenhuma entrega no período.</li>';
  }

  // ---- 3. Precisa de atenção ----
  function contarCa() {
    let vars = [], epis = [];
    try { vars = Array.isArray(epiVariants) ? epiVariants : []; epis = Array.isArray(epiCatalog) ? epiCatalog : []; } catch (_) {}
    const ativos = new Set(epis.filter((e) => e.ativo !== false).map((e) => e.id));
    const hoje = new Date(); const lim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30);
    const limIso = `${lim.getFullYear()}-${pad(lim.getMonth() + 1)}-${pad(lim.getDate())}`;
    return vars.filter((v) => v.ativo !== false && ativos.has(v.epi_id) && v.data_validade && String(v.data_validade).slice(0, 10) <= limIso).length;
  }
  // 0 = tudo certo (✓ verde); com pendência, o número na cor da linha; null = não deu para ler.
  function mostrar(el, n, tom) {
    el.className = '';
    if (n == null) { el.textContent = '–'; return; }
    if (!n) { el.className = 'is-ok'; el.title = 'Tudo certo'; el.innerHTML = '<i data-lucide="check"></i>'; icons(); return; }
    el.className = 'is-' + tom; el.title = ''; el.textContent = num(n);
  }
  let pedido = 0;
  async function desenharAtencao() {
    const caEl = $('[data-dfx-ca]'), estEl = $('[data-dfx-estoque]'), filaEl = $('[data-dfx-fila]');
    mostrar(caEl, contarCa(), 'vermelho');
    // Cada linha só leva à tela se a pessoa pode ver a tela.
    document.querySelectorAll('#dashFaixa [data-dfx-ir]').forEach((b) => {
      const k = { epis: 'epis.consultar', estoque: 'estoque.consultar', programar: 'programar.consultar' }[b.dataset.dfxIr];
      b.disabled = !pode(k);
    });
    const cli = db(); if (!cli) return;
    const meu = ++pedido;
    const [est, fila] = await Promise.all([
      cli.rpc('epi_stock_por_item', { p_busca: '' }).then((r) => r, () => ({ error: true })),
      cli.from('entregas_programadas').select('id', { count: 'exact', head: true }).eq('status', 'programada').then((r) => r, () => ({ error: true }))
    ]);
    if (meu !== pedido) return;
    mostrar(estEl, est.error || !Array.isArray(est.data) ? null : est.data.filter((i) => Number(i.saldo) <= 0 || (i.minimo != null && Number(i.saldo) <= Number(i.minimo))).length, 'amarelo');
    mostrar(filaEl, fila.error ? null : (fila.count || 0), 'azul');
  }

  function atualizar(tudo) {
    if (!montar()) return;
    desenharMeses();
    desenharTop();
    if (tudo) desenharAtencao(); else mostrar($('[data-dfx-ca]'), contarCa(), 'vermelho');
  }

  let pendente = null, pendenteTudo = false;
  const agendar = (tudo) => { pendenteTudo = pendenteTudo || tudo === true; clearTimeout(pendente); pendente = setTimeout(() => { const t = pendenteTudo; pendenteTudo = false; atualizar(t); }, 60); };
  function start() {
    // O Dashboard reescreve os totais quando recalcula (período, filtros).
    const alvos = ['#kTotal', '#kMov', '#kCol', '#kSpend'].map((s) => $(s)).filter(Boolean);
    const obs = new MutationObserver(() => agendar(false));
    alvos.forEach((t) => obs.observe(t, { childList: true, characterData: true, subtree: true }));
    window.addEventListener('epi:data-loaded', () => agendar(true));
    window.addEventListener('epi:busca', () => agendar(false));
    window.addEventListener('epi:permissoes', () => agendar(true));
    document.addEventListener('click', (e) => { if (e.target.closest('.nav button[data-page="dashboard"]')) agendar(true); });
    const espera = setInterval(() => { if ($('#dashTopo')) { clearInterval(espera); agendar(true); } }, 400);
    setTimeout(() => clearInterval(espera), 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
