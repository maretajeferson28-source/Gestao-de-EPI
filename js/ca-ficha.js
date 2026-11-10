(() => {
  'use strict';
  // Consulta de C.A. nova (só no PC; css/padrao.css, "Etapa 6"). Não refaz a
  // consulta: usa a mesma de sempre (lookupCaepi no app.js), que preenche a
  // ficha antiga, e redesenha o resultado. Para C.A. da base oficial, busca
  // também o histórico de versões. Sem foto e sem ícone grande no lugar dela.
  if (window.__EPI_CA_FICHA__) return;
  window.__EPI_CA_FICHA__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const txt = (id) => String(document.getElementById(id)?.textContent || '').trim();
  const vazio = (v) => !v || v === '—' || v === 'N/A';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const normCa = (c) => { const t = String(c || '').trim(); return /^CI-/i.test(t) ? t.toUpperCase() : t.replace(/\D+/g, '').replace(/^0+/, ''); };
  const lista = (nome) => { try { const v = { variantes: () => epiVariants, epis: () => epiCatalog }[nome](); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dataLonga = (br) => { const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${+m[1]} ${MESES[+m[2] - 1]} ${m[3]}` : br; };
  const cnpjFmt = (v) => { const d = String(v || '').replace(/\D+/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v; };
  const frase = (s) => { const t = String(s || '').trim(); if (!t || t !== t.toUpperCase()) return t; const l = t.toLocaleLowerCase('pt-BR'); return l.charAt(0).toLocaleUpperCase('pt-BR') + l.slice(1); };

  function montar() {
    const pagina = $('.page[data-page-content="caepi"]');
    if (!pagina || $('#caFicha')) return;
    const el = document.createElement('section');
    el.className = 'caf';
    el.id = 'caFicha';
    el.innerHTML = `
      <header class="caf-topo">
        <small>Compliance / Base oficial</small>
        <h2>Consulta de <em>C.A.</em></h2>
      </header>
      <form class="caf-busca" data-caf-form>
        <small>Buscar certificado de aprovação</small>
        <div class="caf-busca-linha">
          <label class="caf-campo"><i data-lucide="search"></i><input data-caf-input autocomplete="off" maxlength="10" placeholder="Digite o número do C.A. ou C.I." aria-label="Número do C.A. ou C.I."></label>
          <button type="submit" class="caf-btn" data-caf-btn><i data-lucide="search"></i>Consultar</button>
        </div>
      </form>
      <div class="caf-aviso" data-caf-aviso>
        <strong>Digite um número para ver a ficha do equipamento.</strong>
        <span data-caf-base>Consulta na base oficial CAEPI (C.A.) e na base CIEPI (C.I.).</span>
      </div>
      <div class="caf-resultado" data-caf-resultado hidden>
        <div class="caf-principal">
          <div class="caf-esq">
            <span class="caf-selo" data-caf-selo></span>
            <strong class="caf-numero" data-caf-numero></strong>
            <h3 class="caf-nome" data-caf-nome></h3>
            <small class="caf-rotulo">Fabricante</small>
            <p class="caf-fab" data-caf-fab></p>
            <button type="button" class="caf-link" data-caf-cadastro hidden>Ver cadastro no app <i data-lucide="arrow-up-right"></i></button>
          </div>
          <dl class="caf-dir">
            <div><i data-lucide="calendar-days"></i><dt>Validade do registro</dt><dd><b data-caf-validade></b><span class="caf-prazo" data-caf-prazo></span></dd></div>
            <div><i data-lucide="tag"></i><dt>Referência</dt><dd><b data-caf-ref></b></dd></div>
            <div><i data-lucide="file-text"></i><dt>CNPJ</dt><dd><b data-caf-cnpj></b></dd></div>
            <div><i data-lucide="history"></i><dt>Histórico</dt><dd><b data-caf-hist></b><span class="caf-sub" data-caf-hist2></span></dd></div>
          </dl>
        </div>
        <section class="caf-tecnica">
          <header><h4><i data-lucide="file-text"></i>Identificação técnica</h4>
            <button type="button" class="caf-link" data-caf-mais aria-expanded="false"><span>Visualizar ficha completa</span> <i data-lucide="arrow-up-right"></i></button></header>
          <div class="caf-grade">
            <div><small>Tipo de EPI</small><p data-caf-tipo></p></div>
            <div><small>Marca / identificação</small><p data-caf-marca></p></div>
            <div><small>Fabricante</small><p data-caf-fab2></p></div>
            <div><small>C.A. anterior</small><p data-caf-anterior></p></div>
          </div>
          <div class="caf-completa" data-caf-completa hidden>
            <div><small>Norma</small><p data-caf-norma></p></div>
            <div class="caf-larga"><small>Descrição</small><p data-caf-desc></p></div>
            <div class="caf-larga caf-fonte"><small>Base</small><p data-caf-fonte></p></div>
          </div>
        </section>
      </div>`;
    pagina.prepend(el);
    ligar(el);
    fichaVazia(el, 'is-neutro', 'Aguardando consulta', '', 'Digite um número acima para ver a ficha.');
  }

  // C.A. cadastrado no app e C.A. que ele substituiu (mesmo EPI, marcado "passada").
  function noCadastro(ca) {
    const k = normCa(ca);
    const v = lista('variantes').find((x) => x.ativo !== false && normCa(x.ca) === k);
    if (!v) return { variante: null, epi: null, anteriores: [] };
    const epi = lista('epis').find((e) => e.id === v.epi_id) || null;
    // Só faz sentido falar em "anterior" quando este C.A. é o atual do EPI.
    const anteriores = v.comparativo_status !== 'atual' ? [] : lista('variantes').filter((x) => x.epi_id === v.epi_id && x.id !== v.id && x.comparativo_status === 'passada').map((x) => x.ca).filter(Boolean);
    return { variante: v, epi, anteriores };
  }

  function selo(situacao, validadeBR) {
    const up = String(situacao || '').toLocaleUpperCase('pt-BR');
    const m = String(validadeBR || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dias = m ? Math.round((new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) - new Date(new Date().toDateString())) / 86400000) : null;
    if (/CANCEL|SUSP/.test(up)) return { cls: 'is-vencido', icone: 'circle-x', texto: `Certificado ${frase(situacao).toLowerCase()}`, prazo: '' };
    if (up.includes('VENC') || (dias != null && dias < 0)) return { cls: 'is-vencido', icone: 'circle-x', texto: 'Certificado vencido', prazo: dias != null ? `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}` : 'Vencido' };
    if (dias != null && dias <= 30) return { cls: 'is-atencao', icone: 'triangle-alert', texto: 'Certificado válido', prazo: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias === 1 ? '' : 's'}` };
    if (up.includes('VÁLID') || up.includes('VALID')) return { cls: 'is-valido', icone: 'circle-check', texto: 'Certificado válido', prazo: 'Dentro do prazo' };
    return { cls: 'is-neutro', icone: 'info', texto: situacao || 'Situação não informada', prazo: '' };
  }

  async function historico(ca) {
    try {
      const r = await fetch(`/api/caepi?ca=${encodeURIComponent(ca)}`, { headers: { Accept: 'application/json' } });
      const j = await r.json();
      return Array.isArray(j.history) ? j.history : [];
    } catch (_) { return []; }
  }

  async function consultar(el) {
    const campo = $('[data-caf-input]', el), btn = $('[data-caf-btn]', el);
    const valor = campo.value.trim();
    const original = document.getElementById('caInput');
    if (!original || typeof lookupCaepi !== 'function') return;
    original.value = valor;
    original.dispatchEvent(new Event('input'));
    btn.disabled = true;
    fichaVazia(el, 'is-neutro', 'Consultando…', valor, 'Buscando na base oficial…');
    try { await lookupCaepi(); } finally { btn.disabled = false; }
    await desenhar(el);
  }

  // Ficha com traços (como a antiga): antes da consulta, ou quando não achou.
  function fichaVazia(el, cls, selo_, numero, dica) {
    const seloEl = $('[data-caf-selo]', el);
    seloEl.className = `caf-selo ${cls}`;
    seloEl.innerHTML = `<i data-lucide="${cls === 'is-neutro' ? 'clock-3' : 'circle-x'}"></i>${esc(selo_)}`;
    const n = String(numero || '').toUpperCase();
    $('[data-caf-numero]', el).innerHTML = /^CI-/.test(n) ? `<b>${esc(n)}</b>` : `C.A. <b>${esc(n.replace(/\D+/g, '') || '—')}</b>`;
    $('[data-caf-nome]', el).textContent = 'Informações do EPI';
    $('[data-caf-fab]', el).textContent = dica;
    $('[data-caf-cadastro]', el).hidden = true;
    ['validade', 'ref', 'cnpj', 'hist', 'tipo', 'marca', 'fab2', 'anterior', 'norma', 'desc', 'fonte'].forEach((k) => { $(`[data-caf-${k}]`, el).textContent = '—'; });
    ['prazo', 'hist2'].forEach((k) => { $(`[data-caf-${k}]`, el).textContent = ''; });
    $('[data-caf-aviso]', el).hidden = true;
    $('[data-caf-resultado]', el).hidden = false;
    el.classList.add('is-vazia');
    icons();
  }

  async function desenhar(el) {
    el.classList.remove('is-vazia');
    const status = txt('caStageStatus');
    const aviso = $('[data-caf-aviso]', el), res = $('[data-caf-resultado]', el);
    if (/não encontrado|erro|indisponível|informe/i.test(status) || vazio(txt('caSituation'))) {
      const naoAchou = /não encontrado/i.test(status), falhou = /erro|indisponível/i.test(status);
      fichaVazia(el, naoAchou || falhou ? 'is-vencido' : 'is-neutro',
        naoAchou ? 'Não encontrado' : falhou ? 'Não foi possível consultar' : 'Aguardando consulta',
        naoAchou || falhou ? $('[data-caf-input]', el).value.trim() : '',
        naoAchou ? 'Confira o número e tente de novo.' : falhou ? 'Tente de novo em instantes.' : 'Digite um número acima para ver a ficha.');
      return;
    }
    const numero = txt('caStageNumber');
    const ca = numero.replace(/^\s*C\.A\.\s*/i, '');
    const interno = /^CI-/i.test(ca);
    const situacao = txt('caSituation'), validade = txt('caValidade');
    const cad = noCadastro(ca);
    const equipamento = txt('caEquipamento');
    const s = selo(situacao, validade);

    const seloEl = $('[data-caf-selo]', el);
    seloEl.className = `caf-selo ${s.cls}`;
    seloEl.innerHTML = `<i data-lucide="${s.icone}"></i>${esc(interno && s.cls === 'is-valido' ? 'Certificado interno válido' : s.texto)}`;
    $('[data-caf-numero]', el).innerHTML = interno ? `<b>${esc(ca)}</b>` : `C.A. <b>${esc(ca)}</b>`;
    $('[data-caf-nome]', el).textContent = cad.epi?.nome || frase(equipamento) || 'Equipamento';
    const fab = vazio(txt('caFabricante')) ? '—' : txt('caFabricante');
    $('[data-caf-fab]', el).textContent = fab;
    $('[data-caf-fab2]', el).textContent = fab;
    const link = $('[data-caf-cadastro]', el);
    link.hidden = !(cad.variante && cad.epi && typeof openEpiDetail === 'function');
    link.dataset.epi = cad.epi?.id || '';
    link.dataset.variante = cad.variante?.id || '';

    $('[data-caf-validade]', el).textContent = vazio(validade) ? '—' : dataLonga(validade);
    const prazo = $('[data-caf-prazo]', el);
    prazo.textContent = s.prazo;
    prazo.className = `caf-prazo ${s.cls}`;
    $('[data-caf-ref]', el).textContent = vazio(txt('caReferencia')) ? '—' : txt('caReferencia');
    $('[data-caf-cnpj]', el).textContent = vazio(txt('caCnpj')) ? '—' : cnpjFmt(txt('caCnpj'));
    $('[data-caf-tipo]', el).textContent = vazio(equipamento) ? '—' : frase(equipamento);
    $('[data-caf-marca]', el).textContent = vazio(txt('caMarca')) ? '—' : txt('caMarca');
    $('[data-caf-anterior]', el).textContent = cad.anteriores.length ? cad.anteriores.map((c) => (/^CI-/i.test(c) ? c : `C.A. ${c}`)).join(', ') : '—';
    $('[data-caf-norma]', el).textContent = vazio(txt('caNorma')) ? '—' : txt('caNorma');
    $('[data-caf-desc]', el).textContent = txt('caDescricao') || '—';
    $('[data-caf-fonte]', el).textContent = txt('caSourceInfo').replace(/^Base:\s*/i, '') || '—';

    const h1 = $('[data-caf-hist]', el), h2 = $('[data-caf-hist2]', el);
    if (interno) { h1.textContent = 'Base CIEPI'; h2.textContent = 'Código interno, sem histórico oficial'; }
    else {
      h1.textContent = 'Consultando…'; h2.textContent = '';
      const hist = await historico(ca);
      // A base repete linhas da mesma versão: conta só validades diferentes.
      const validades = [...new Set(hist.map((x) => String(x.data_validade || '').slice(0, 10)).filter(Boolean))].sort().reverse();
      const atualIso = (validade.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) || []).slice(1).reverse().join('-');
      const anterior = validades.find((d) => atualIso && d < atualIso);
      const n = validades.length;
      h1.textContent = n ? `${n} ${n === 1 ? 'versão' : 'versões'} na base oficial` : '—';
      h2.textContent = anterior ? `Anterior válida até ${dataLonga(dataBR(anterior))}` : n ? 'Sem renovação registrada' : '';
    }
    aviso.hidden = true;
    res.hidden = false;
    icons();
  }

  function ligar(el) {
    const campo = $('[data-caf-input]', el);
    campo.addEventListener('input', () => {
      try { const limpo = cleanCaTyping(campo.value); if (campo.value !== limpo) campo.value = limpo; } catch (_) {}
    });
    $('[data-caf-form]', el).addEventListener('submit', (e) => { e.preventDefault(); consultar(el); });
    $('[data-caf-mais]', el).addEventListener('click', (e) => {
      const b = e.currentTarget, box = $('[data-caf-completa]', el);
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', String(!box.hidden));
      $('span', b).textContent = box.hidden ? 'Visualizar ficha completa' : 'Ocultar ficha completa';
    });
    $('[data-caf-cadastro]', el).addEventListener('click', (e) => {
      const b = e.currentTarget;
      try {
        openEpiDetail(b.dataset.epi);
        if (typeof selectedVariantId !== 'undefined') selectedVariantId = b.dataset.variante;
        if (typeof renderEpiVariantList === 'function') renderEpiVariantList();
        icons();
      } catch (err) { console.error('[CA FICHA]', err); }
    });
  }

  function start() {
    montar();
    window.addEventListener('epi:data-loaded', montar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
