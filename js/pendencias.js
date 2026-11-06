// Página "Pendências": conformidade do cadastro em roscas e, embaixo, cada
// pendência com a lista do que falta e o botão para a tela onde se resolve.
// A bolinha no menu conta as pendências graves (C.A. vencido e estoque crítico).
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const isAdmin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  const LISTAS = { collaborators: () => collaborators, epiCatalog: () => epiCatalog, epiVariants: () => epiVariants, movements: () => movements };
  const lista = (nome) => { try { const v = LISTAS[nome](); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
  const hoje = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const dataBR = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };
  const isoDeBR = (br) => { const [d, m, y] = String(br || '').split('/'); return y ? `${y}-${m}-${d}` : String(br || '').slice(0, 10); };
  const diasDesde = (iso) => Math.round((new Date(hoje()) - new Date(String(iso).slice(0, 10))) / 86400000);
  const normCa = (c) => { const t = String(c || '').trim(); if (!t || /^n\/?a$/i.test(t)) return ''; return /^CI-/i.test(t) ? t.toUpperCase() : t.replace(/\D+/g, ''); };
  const COR = { vermelho: '#ef4444', amarelo: '#f5b301', verde: '#22c55e' };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });

  // Dados que não ficam nas listas do app.
  let extras = null, buscando = null;
  async function carregarExtras() {
    const c = db();
    if (!c) return null;
    const [termos, estoque, fila, ordens] = await Promise.all([
      c.from('termos_epi').select('colaborador_id'),
      c.rpc('epi_stock_por_item', { p_busca: '' }),
      c.from('entregas_programadas').select('id,data_prevista,colaborador_id').eq('status', 'programada').order('data_prevista'),
      c.from('ordens_servico').select('funcao,epis').eq('ativo', true)
    ]);
    return {
      termos: new Set((termos.data || []).map((t) => t.colaborador_id)),
      estoque: (estoque.data || []).filter((i) => Number(i.saldo) <= 0 || (i.minimo != null && Number(i.saldo) <= Number(i.minimo))),
      fila: fila.data || [],
      ordens: ordens.data || []
    };
  }

  function calcular(x) {
    const ativos = lista('collaborators').filter((c) => c.ativo !== false);
    const variantes = lista('epiVariants').filter((v) => v.ativo !== false);
    const epis = lista('epiCatalog').filter((e) => e.ativo !== false);
    const movs = lista('movements');
    const nomeEpi = (id) => lista('epiCatalog').find((e) => e.id === id)?.nome || '—';
    const nomeColab = (id) => lista('collaborators').find((c) => c.id === id)?.nome || '—';
    const funcao = (c) => c.funcao || c.cargo || '—';

    const vencidos = variantes.filter((v) => v.data_validade && String(v.data_validade).slice(0, 10) < hoje() && !/^CI-/i.test(v.ca || ''))
      .map((v) => ({ epi: nomeEpi(v.epi_id), ca: v.ca, apelido: v.apelido, validade: v.data_validade }));
    const semTermo = ativos.filter((c) => !x.termos.has(c.id));
    const semOs = ativos.filter((c) => !c.os_id);
    const comCa = new Set(variantes.map((v) => v.epi_id));
    const episSemCa = epis.filter((e) => !comCa.has(e.id));
    const cadastrados = new Set(variantes.map((v) => normCa(v.ca)));
    const porCa = new Map();
    for (const m of movs) {
      const ca = normCa(m.ca);
      if (!ca || cadastrados.has(ca)) continue;
      const g = porCa.get(ca) || { ca, epi: m.epi, qtd: 0, ultima: '' };
      g.qtd += Number(m.quantidade) || 0;
      const d = isoDeBR(m.data);
      if (d > g.ultima) g.ultima = d;
      porCa.set(ca, g);
    }
    const foraDoApp = new Map();
    for (const o of x.ordens) for (const i of o.epis || []) {
      if (i.epi_id) continue;
      const k = String(i.descricao).trim().toLowerCase();
      const g = foraDoApp.get(k) || { item: i.descricao, funcoes: new Set() };
      g.funcoes.add(o.funcao);
      foraDoApp.set(k, g);
    }
    const semNome = movs.filter((m) => !m.colaborador_id);

    return {
      conf: [
        { t: 'Termo assinado', feito: ativos.length - semTermo.length, total: ativos.length, un: 'colaboradores', alvo: 'pTermo' },
        { t: 'OS ligada', feito: ativos.length - semOs.length, total: ativos.length, un: 'colaboradores', alvo: 'pOs' },
        { t: 'EPIs com C.A.', feito: epis.length - episSemCa.length, total: epis.length, un: 'EPIs', alvo: 'pEpiSemCa' },
        { t: 'Entregas com nome', feito: movs.length - semNome.length, total: movs.length, un: 'entregas', alvo: 'pSemNome' }
      ],
      secoes: [
        { id: 'pVencidos', tom: 'vermelho', icone: 'shield-alert', titulo: 'C.A. vencidos em uso', ok: 'Nenhum C.A. vencido',
          dica: 'EPI com C.A. vencido não pode ser entregue. Cadastre o C.A. novo e desative o vencido.', ir: 'estoque', rot: 'Abrir Estoque',
          cab: ['EPI', 'C.A.', 'Validade', ''], linhas: vencidos.map((v) => [v.epi + (v.apelido ? ` · ${v.apelido}` : ''), v.ca, dataBR(v.validade), `<em class="pd-tag is-vermelho">vencido há ${fmt(diasDesde(v.validade))} dias</em>`]) },
        { id: 'pEstoque', tom: 'vermelho', icone: 'package-x', titulo: 'Estoque no mínimo ou zerado', ok: 'Estoque em dia',
          dica: 'Faça o pedido antes que falte na hora da entrega.', ir: 'estoque', rot: 'Abrir Estoque',
          cab: ['EPI', 'Em estoque', 'Mínimo'], linhas: x.estoque.map((i) => [i.nome, fmt(i.saldo), i.minimo == null ? '—' : fmt(i.minimo)]) },
        { id: 'pTermo', tom: 'vermelho', icone: 'file-signature', titulo: 'Colaboradores sem termo assinado', ok: 'Todos com termo assinado',
          dica: 'Sem o termo o app bloqueia a entrega. A coleta é no celular, na aba Termo.', ir: 'colaboradores', rot: 'Abrir Colaboradores',
          nomes: semTermo.map((c) => ({ nome: c.nome, sub: funcao(c) })) },
        { id: 'pOs', tom: 'amarelo', icone: 'clipboard-list', titulo: 'Ativos sem ordem de serviço', ok: 'Todos com OS ligada',
          dica: 'Sem OS o botão "OS" do Programar fica apagado para a pessoa.', ir: 'colaboradores', rot: 'Abrir Colaboradores',
          nomes: semOs.map((c) => ({ nome: c.nome, sub: funcao(c) })) },
        { id: 'pCaSemCadastro', tom: 'amarelo', icone: 'badge-help', titulo: 'C.A. entregues sem cadastro', ok: 'Todo C.A. entregue está cadastrado',
          dica: 'Esses C.A. aparecem nas entregas, mas não existem no prontuário do EPI.', ir: 'epis', rot: 'Abrir EPIs',
          cab: ['C.A.', 'EPI nas entregas', 'Itens', 'Última'], linhas: [...porCa.values()].sort((a, b) => b.qtd - a.qtd).map((g) => [g.ca, g.epi || '—', fmt(g.qtd), dataBR(g.ultima)]) },
        { id: 'pEpiSemCa', tom: 'amarelo', icone: 'hard-hat', titulo: 'EPIs sem C.A.', ok: 'Todo EPI tem C.A.',
          dica: 'Item sem C.A. usa código interno (CI) quando não for EPI certificado.', ir: 'epis', rot: 'Abrir EPIs',
          nomes: episSemCa.map((e) => ({ nome: e.nome })) },
        { id: 'pForaDoApp', tom: 'amarelo', icone: 'footprints', titulo: 'Itens exigidos nas OS que o app não tem', ok: 'OS cobertas pelo app',
          dica: 'Cadastre o EPI no app para ele entrar no "Usar na entrega" da OS.', ir: 'epis', rot: 'Abrir EPIs',
          cab: ['Item da OS', 'Funções'], linhas: [...foraDoApp.values()].map((g) => [g.item, [...g.funcoes].join(', ')]) },
        { id: 'pFila', tom: 'amarelo', icone: 'list-checks', titulo: 'Entregas esperando na fila', ok: 'Fila vazia',
          dica: 'Programadas no PC e ainda não confirmadas no celular.', ir: 'programar', rot: 'Abrir Programar',
          cab: ['Colaborador', 'Para'], linhas: x.fila.map((f) => [nomeColab(f.colaborador_id), dataBR(f.data_prevista)]) },
        { id: 'pSemNome', tom: 'amarelo', icone: 'user-x', titulo: 'Entregas sem colaborador', ok: 'Todas as entregas têm nome',
          dica: 'Vieram da planilha antiga sem o nome de quem recebeu.', ir: 'movimentacoes', rot: 'Abrir Movimentações',
          contagem: semNome.length }
      ]
    };
  }

  const tamanho = (s) => s.linhas ? s.linhas.length : s.nomes ? s.nomes.length : s.contagem || 0;

  function rosca(c) {
    const p = c.total ? Math.round((c.feito / c.total) * 100) : 100;
    const cor = p >= 90 ? COR.verde : p >= 40 ? COR.amarelo : COR.vermelho;
    const r = 40, volta = 2 * Math.PI * r, falta = Math.max(0, c.total - c.feito);
    return `<button type="button" class="pd-rosca" data-rolar="${c.alvo}" style="--c:${cor}">
      <div class="pd-rosca-graf"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="fundo"/>
        <circle cx="50" cy="50" r="${r}" class="valor" stroke-dasharray="${(volta * p) / 100} ${volta}"/></svg><b>${p}%</b></div>
      <strong>${esc(c.t)}</strong><small>${falta ? `faltam <em>${fmt(falta)}</em> ${c.un}` : 'tudo em dia'}</small></button>`;
  }

  function secao(s) {
    const n = tamanho(s);
    let corpo = '';
    if (s.linhas) {
      corpo = `<table class="pd-tabela"><thead><tr>${s.cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${s.linhas.map((l) => `<tr>${l.map((v, i) => `<td>${i === l.length - 1 && String(v).startsWith('<em') ? v : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else if (s.nomes) {
      corpo = `<ul class="pd-nomes">${s.nomes.map((x) => `<li><strong>${esc(x.nome)}</strong>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</li>`).join('')}</ul>`;
    }
    const longo = n > 8;
    return `<section class="panel pd-secao${longo ? ' is-recolhida' : ''}" id="${s.id}" style="--c:${COR[s.tom]}">
      <header><span class="pd-icone"><i data-lucide="${s.icone}"></i></span>
        <div><h3><b>${fmt(n)}</b>${esc(s.titulo)}</h3><p>${esc(s.dica)}</p></div>
        <button type="button" class="btn pd-ir" data-ir="${s.ir}">${esc(s.rot)}<i data-lucide="chevron-right"></i></button></header>
      ${corpo ? `<div class="pd-corpo">${corpo}</div>${longo ? `<button type="button" class="pd-mais" data-expandir>Mostrar todos (${fmt(n)})</button>` : ''}` : ''}
    </section>`;
  }

  function desenhar() {
    const box = $('pendConteudo');
    if (!box || !extras) return;
    const d = calcular(extras);
    const abertas = d.secoes.filter((s) => tamanho(s) > 0).sort((a, b) => (a.tom === b.tom ? 0 : a.tom === 'vermelho' ? -1 : 1));
    const emDia = d.secoes.filter((s) => !tamanho(s));
    box.innerHTML = `
      <div class="panel pd-conf"><div class="panel-head"><h3><i data-lucide="gauge"></i>Conformidade</h3><small>clique numa rosca para ver o que falta</small></div>
        <div class="pd-roscas">${d.conf.map(rosca).join('')}</div>
        ${emDia.length ? `<div class="pd-ok">${emDia.map((s) => `<span><i data-lucide="circle-check"></i>${esc(s.ok)}</span>`).join('')}</div>` : ''}</div>
      ${abertas.map(secao).join('')}`;
    icons();
    marcarMenu(d);
  }

  // Bolinha no menu: só o que é grave (C.A. vencido + estoque crítico).
  function marcarMenu(d) {
    const graves = d.secoes.filter((s) => s.id === 'pVencidos' || s.id === 'pEstoque').reduce((t, s) => t + tamanho(s), 0);
    document.querySelectorAll('[data-pend-badge]').forEach((b) => { b.textContent = graves; b.hidden = !graves; });
  }

  async function atualizar() {
    if (!isAdmin()) return;
    if (!buscando) buscando = carregarExtras().then((x) => { if (x) extras = x; }).catch((e) => console.warn('[PENDÊNCIAS]', e)).finally(() => { buscando = null; });
    await buscando;
    desenhar();
  }

  function start() {
    const box = $('pendConteudo');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const ir = e.target.closest('[data-ir]');
      if (ir) return document.querySelector(`.nav [data-page="${ir.dataset.ir}"]`)?.click();
      const rolar = e.target.closest('[data-rolar]');
      if (rolar) {
        const alvo = $(rolar.dataset.rolar);
        if (alvo) { alvo.classList.remove('is-recolhida'); alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); alvo.querySelector('[data-expandir]')?.remove(); }
        return;
      }
      const mais = e.target.closest('[data-expandir]');
      if (mais) { mais.closest('.pd-secao')?.classList.remove('is-recolhida'); mais.remove(); }
    });
    window.addEventListener('epi:data-loaded', atualizar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.EPI_PENDENCIAS = { atualizar };
})();
