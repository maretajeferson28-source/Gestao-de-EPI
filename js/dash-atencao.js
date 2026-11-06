// Faixa do dashboard entre os números e os gráficos: à esquerda o que precisa
// de atenção (com link para a tela onde se resolve), à direita a conformidade
// do cadastro em roscas. Só para administrador.
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
  const normCa = (c) => { const t = String(c || '').trim(); if (!t || /^n\/?a$/i.test(t)) return ''; return /^CI-/i.test(t) ? t.toUpperCase() : t.replace(/\D+/g, ''); };
  const COR = { vermelho: '#ef4444', amarelo: '#f5b301', verde: '#22c55e' };

  // Dados que não estão nas listas do app: termos, mínimo de estoque, fila e OS.
  let extras = null, buscando = null;
  async function carregarExtras() {
    const c = db();
    if (!c) return null;
    const [termos, estoque, fila, ordens] = await Promise.all([
      c.from('termos_epi').select('colaborador_id'),
      c.rpc('epi_stock_por_item', { p_busca: '' }),
      c.from('entregas_programadas').select('id', { count: 'exact', head: true }).eq('status', 'programada'),
      c.from('ordens_servico').select('epis').eq('ativo', true)
    ]);
    return {
      termos: new Set((termos.data || []).map((t) => t.colaborador_id)),
      baixos: (estoque.data || []).filter((i) => Number(i.saldo) <= 0 || (i.minimo != null && Number(i.saldo) <= Number(i.minimo))).length,
      fila: fila.count || 0,
      foraDoApp: new Set((ordens.data || []).flatMap((o) => (o.epis || []).filter((i) => !i.epi_id).map((i) => String(i.descricao).toLowerCase().trim()))).size
    };
  }

  function calcular(x) {
    const ativos = lista('collaborators').filter((c) => c.ativo !== false);
    const variantes = lista('epiVariants').filter((v) => v.ativo !== false);
    const epis = lista('epiCatalog').filter((e) => e.ativo !== false);
    const movs = lista('movements');
    const vencidos = variantes.filter((v) => v.data_validade && String(v.data_validade).slice(0, 10) < hoje() && !/^CI-/i.test(v.ca || ''));
    const nomesVencidos = [...new Set(vencidos.map((v) => epis.find((e) => e.id === v.epi_id)?.nome).filter(Boolean))];
    const comCa = new Set(variantes.map((v) => v.epi_id));
    const cadastrados = new Set(variantes.map((v) => normCa(v.ca)));
    const caSemCadastro = new Set(movs.map((m) => normCa(m.ca)).filter((c) => c && !cadastrados.has(c)));
    const comNome = movs.filter((m) => m.colaborador_id).length;
    const semTermo = ativos.filter((c) => !x.termos.has(c.id)).length;
    const comOs = ativos.filter((c) => c.os_id).length;
    const lista3 = (arr) => arr.length <= 3 ? arr.join(', ') : `${arr.slice(0, 3).join(', ')} e mais ${arr.length - 3}`;
    return {
      // O que já aparece nas roscas (termo, OS, EPIs sem C.A.) não se repete aqui.
      pend: [
        { n: vencidos.length, tom: 'vermelho', grave: true, txt: `C.A. vencido${vencidos.length === 1 ? '' : 's'} em uso`,
          det: vencidos.length ? `C.A. ${lista3(vencidos.map((v) => v.ca))} · ${nomesVencidos.join(', ')}` : '', ok: 'Nenhum C.A. vencido', ir: 'estoque', rot: 'Estoque' },
        { n: x.baixos, tom: 'vermelho', txt: 'EPIs com estoque no mínimo ou zerado', ok: 'Estoque em dia', ir: 'estoque', rot: 'Estoque' },
        { n: caSemCadastro.size, tom: 'amarelo', txt: 'C.A. entregues sem cadastro', det: caSemCadastro.size ? `C.A. ${lista3([...caSemCadastro])}` : '', ok: 'Todo C.A. entregue está cadastrado', ir: 'epis', rot: 'EPIs' },
        { n: x.foraDoApp, tom: 'amarelo', txt: 'Itens exigidos nas OS que o app não tem', ok: 'OS cobertas pelo app', ir: 'epis', rot: 'EPIs' },
        { n: x.fila, tom: 'amarelo', txt: 'Entregas esperando na fila do celular', ok: 'Fila vazia', ir: 'programar', rot: 'Programar' }
      ],
      conf: [
        ['Termo assinado', ativos.length - semTermo, ativos.length, 'colaboradores', 'colaboradores'],
        ['OS ligada', comOs, ativos.length, 'colaboradores', 'colaboradores'],
        ['EPIs com C.A.', epis.filter((e) => comCa.has(e.id)).length, epis.length, 'EPIs', 'epis'],
        ['Entregas com nome', comNome, movs.length, 'entregas', 'movimentacoes']
      ]
    };
  }

  // Rosca clicável: mostra quanto falta e leva para a tela onde se resolve.
  function rosca([titulo, feito, total, unidade, ir]) {
    const p = total ? Math.round((feito / total) * 100) : 100;
    const cor = p >= 90 ? COR.verde : p >= 40 ? COR.amarelo : COR.vermelho;
    const r = 40, volta = 2 * Math.PI * r;
    const falta = Math.max(0, total - feito);
    return `<button type="button" class="dash-rosca" data-ir="${ir}" style="--c:${cor}" title="${esc(`${fmt(feito)} de ${fmt(total)} ${unidade}`)}">
      <div class="dash-rosca-graf"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="fundo"/>
        <circle cx="50" cy="50" r="${r}" class="valor" stroke-dasharray="${(volta * p) / 100} ${volta}"/></svg><b>${p}%</b></div>
      <strong>${esc(titulo)}</strong>
      <small>${falta ? `faltam <em>${fmt(falta)}</em> ${unidade}` : 'tudo em dia'}</small></button>`;
  }

  function desenhar() {
    const box = $('dashAtencao');
    if (!box || !extras) return;
    const d = calcular(extras);
    const abertas = d.pend.filter((p) => p.n > 0).sort((a, b) => (a.tom === b.tom ? 0 : a.tom === 'vermelho' ? -1 : 1)); // vermelhos primeiro, na ordem da lista
    const emDia = d.pend.filter((p) => !p.n);
    box.innerHTML = `
      <div class="panel dash-pend">
        <div class="panel-head"><h3><i data-lucide="bell-ring"></i>Precisa da sua atenção</h3><small>clique para resolver</small></div>
        ${abertas.length ? `<ul>${abertas.map((p) => `<li class="${p.grave ? 'is-grave' : ''}" style="--c:${COR[p.tom]}"><button type="button" data-ir="${p.ir}"><i class="dot"></i><b>${fmt(p.n)}</b>
          <span>${esc(p.txt)}${p.det ? `<small>${esc(p.det)}</small>` : ''}</span><em>${esc(p.rot)}<i data-lucide="chevron-right"></i></em></button></li>`).join('')}</ul>`
          : '<p class="dash-pend-vazio">Nada pendente agora.</p>'}
        ${emDia.length ? `<div class="dash-ok">${emDia.map((p) => `<span><i data-lucide="circle-check"></i>${esc(p.ok)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="panel dash-conf">
        <div class="panel-head"><h3><i data-lucide="gauge"></i>Conformidade</h3><small>clique numa rosca para resolver</small></div>
        <div class="dash-roscas">${d.conf.map(rosca).join('')}</div>
      </div>`;
    box.hidden = false;
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  async function atualizar() {
    const box = $('dashAtencao');
    if (!box) return;
    if (!isAdmin()) { box.hidden = true; return; }
    if (!buscando) buscando = carregarExtras().then((x) => { if (x) extras = x; }).catch((e) => console.warn('[DASH ATENÇÃO]', e)).finally(() => { buscando = null; });
    await buscando;
    desenhar();
  }

  function montar() {
    const kpis = document.querySelector('[data-page-content="dashboard"] .kpis');
    if (!kpis || $('dashAtencao')) return;
    const box = document.createElement('div');
    box.id = 'dashAtencao';
    box.className = 'dash-atencao';
    box.hidden = true;
    kpis.after(box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ir]');
      if (b) document.querySelector(`.nav [data-page="${b.dataset.ir}"]`)?.click();
    });
  }

  function start() {
    montar();
    window.addEventListener('epi:data-loaded', atualizar);
    document.querySelector('.nav [data-page="dashboard"]')?.addEventListener('click', atualizar);
    atualizar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.EPI_DASH_ATENCAO = { atualizar };
})();
