(() => {
  'use strict';
  // Consulta de C.A. (só no PC; css/padrao.css, "Etapa 6d"), pela especificação
  // Consulta_CA_Especificacao_Visual.css no modo sem imagem (Solução B: sem a
  // coluna central, sem foto e sem ícone grande). Não refaz a consulta: usa a de
  // sempre (lookupCaepi no app.js), que preenche a ficha antiga, e redesenha.
  if (window.__EPI_CA_FICHA__) return;
  window.__EPI_CA_FICHA__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const txt = (id) => String(document.getElementById(id)?.textContent || '').trim();
  const vazio = (v) => !v || v === '—' || v === 'N/A';
  const ou = (v) => (vazio(v) ? '—' : v);
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
      <p class="caf-kicker">Compliance / Base oficial</p>
      <h2 class="caf-title">Consulta de <em>C.A.</em></h2>
      <div class="caf-painel">
      <form class="caf-search" data-caf-form novalidate>
        <label class="caf-search-label" for="cafQuery">Buscar certificado de aprovação</label>
        <div class="caf-search-row">
          <div class="caf-input-wrap">
            <i class="caf-input-icon" data-lucide="search"></i>
            <input id="cafQuery" class="caf-query" data-caf-input autocomplete="off" maxlength="10" placeholder="Digite o número do C.A. ou C.I.">
          </div>
          <button type="submit" class="caf-submit" data-caf-btn><i data-lucide="search"></i>Consultar</button>
        </div>
      </form>
      <div class="caf-campos" data-caf-result data-state="idle" aria-live="polite">
        <div class="caf-cab">
          <div class="caf-cab-id"><span class="caf-number" data-caf-numero></span><span class="caf-name" data-caf-nome></span></div>
          <div class="caf-cab-dir">
            <span class="caf-status" data-caf-status></span>
            <button type="button" class="caf-tt-link" data-caf-cadastro hidden>Ver cadastro no app <i data-lucide="arrow-up-right"></i></button>
          </div>
          <span class="caf-cab-dica" data-caf-fab></span>
        </div>
        <div class="caf-grade">
          <div class="caf-bloco caf-larga"><span class="caf-bloco-ic"><i data-lucide="hard-hat"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Equipamento</span><span class="caf-bloco-val" data-caf-tipo></span></div></div>
          <div class="caf-bloco"><span class="caf-bloco-ic"><i data-lucide="factory"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Fabricante</span><span class="caf-bloco-val" data-caf-fab2></span></div></div>
          <div class="caf-bloco"><span class="caf-bloco-ic"><i data-lucide="id-card"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">CNPJ</span><span class="caf-bloco-val" data-caf-cnpj></span></div></div>
          <div class="caf-bloco"><span class="caf-bloco-ic"><i data-lucide="tag"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Marca / identificação</span><span class="caf-bloco-val" data-caf-marca></span></div></div>
          <div class="caf-bloco"><span class="caf-bloco-ic"><i data-lucide="layers"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Referência</span><span class="caf-bloco-val" data-caf-ref></span></div></div>
          <div class="caf-bloco"><span class="caf-bloco-ic"><i data-lucide="shield-check"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Norma</span><span class="caf-bloco-val" data-caf-norma></span></div></div>
          <div class="caf-bloco"><span class="caf-bloco-ic"><i data-lucide="calendar-days"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Validade</span><span class="caf-bloco-val" data-caf-validade></span><em class="caf-bloco-nota" data-caf-prazo></em></div></div>
          <div class="caf-bloco"><span class="caf-bloco-ic"><i data-lucide="archive"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">C.A. anterior</span><span class="caf-bloco-val" data-caf-anterior></span></div></div>
          <div class="caf-bloco" data-caf-hist-linha><span class="caf-bloco-ic"><i data-lucide="history"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Histórico</span><span class="caf-bloco-val" data-caf-hist></span><em class="caf-bloco-sub" data-caf-hist2></em></div></div>
          <div class="caf-bloco caf-larga"><span class="caf-bloco-ic"><i data-lucide="file-text"></i></span><div class="caf-bloco-tx"><span class="caf-bloco-rot">Descrição</span><span class="caf-bloco-val" data-caf-desc></span><em class="caf-bloco-sub" data-caf-fonte></em></div></div>
        </div>
      </div>
      </div>`;
    pagina.prepend(el);
    ligar(el);
    estadoSemResultado(el, 'idle', 'Aguardando consulta', '', 'Digite o número acima para ver o certificado.');
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

  // Estado do resultado pelos dados oficiais (situação + data de validade).
  function estadoDe(situacao, validadeBR) {
    const up = String(situacao || '').toLocaleUpperCase('pt-BR');
    const m = String(validadeBR || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dias = m ? Math.round((new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`) - new Date(new Date().toDateString())) / 86400000) : null;
    if (/CANCEL|SUSP/.test(up)) return { estado: 'revoked', icone: 'circle-x', texto: `Certificado ${frase(situacao).toLowerCase()}`, nota: frase(situacao) };
    if (up.includes('VENC') || (dias != null && dias < 0)) return { estado: 'expired', icone: 'circle-x', texto: 'Certificado vencido', nota: dias != null ? `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}` : 'Vencido' };
    if (dias != null && dias <= 30) return { estado: 'warning', icone: 'triangle-alert', texto: 'Certificado válido', nota: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia${dias === 1 ? '' : 's'}` };
    if (up.includes('VÁLID') || up.includes('VALID')) return { estado: 'valid', icone: 'circle-check', texto: 'Certificado válido', nota: 'Dentro do prazo' };
    return { estado: 'idle', icone: 'circle-help', texto: situacao || 'Situação não informada', nota: '' };
  }

  async function historico(ca) {
    try {
      const r = await fetch(`/api/caepi?ca=${encodeURIComponent(ca)}`, { headers: { Accept: 'application/json' } });
      const j = await r.json();
      return Array.isArray(j.history) ? j.history : [];
    } catch (_) { return []; }
  }

  const por = (el, k, v) => { const n = $(`[data-caf-${k}]`, el); if (n) n.textContent = v; };

  // Sem certificado na tela (inicial, consultando, não encontrado, erro): tudo com traço.
  function estadoSemResultado(el, estado, rotulo, numero, dica) {
    $('[data-caf-result]', el).dataset.state = estado;
    const icone = estado === 'loading' ? 'loader-circle' : estado === 'idle' ? 'clock-3' : estado === 'error' ? 'wifi-off' : 'search-x';
    $('[data-caf-status]', el).innerHTML = `<i data-lucide="${icone}"></i><span>${esc(rotulo)}</span>`;
    const n = String(numero || '').toUpperCase();
    $('[data-caf-numero]', el).innerHTML = /^CI-/.test(n) ? esc(n) : `<span class="caf-prefix">C.A.</span> ${esc(n.replace(/\D+/g, '') || '—')}`;
    por(el, 'nome', 'Informações do EPI');
    por(el, 'fab', dica);
    $('[data-caf-cadastro]', el).hidden = true;
    ['validade', 'ref', 'cnpj', 'hist', 'tipo', 'marca', 'fab2', 'anterior', 'norma', 'desc'].forEach((k) => por(el, k, '—'));
    por(el, 'fonte', '');
    ['prazo', 'hist2'].forEach((k) => por(el, k, ''));
    $('[data-caf-hist-linha]', el).hidden = false;
    el.classList.add('is-vazia');
    icons();
  }

  let pedido = 0;
  async function consultar(el) {
    const campo = $('[data-caf-input]', el), btn = $('[data-caf-btn]', el);
    const valor = campo.value.trim();
    if (!valor) { campo.focus(); return; }
    const original = document.getElementById('caInput');
    if (!original || typeof lookupCaepi !== 'function') return;
    const meu = ++pedido;
    original.value = valor;
    original.dispatchEvent(new Event('input'));
    btn.disabled = true;
    estadoSemResultado(el, 'loading', 'Consultando…', valor, 'Buscando na base oficial…');
    try { await lookupCaepi(); } finally { btn.disabled = false; }
    if (meu === pedido) await desenhar(el, meu);
  }

  async function desenhar(el, meu) {
    const status = txt('caStageStatus');
    if (/não encontrado|erro|indisponível|informe/i.test(status) || vazio(txt('caSituation'))) {
      const naoAchou = /não encontrado/i.test(status), falhou = /erro|indisponível/i.test(status);
      const valor = $('[data-caf-input]', el).value.trim();
      if (naoAchou) estadoSemResultado(el, 'not-found', 'C.A. não localizado', valor, 'Esse número não está na base. Confira e tente de novo.');
      else if (falhou) estadoSemResultado(el, 'error', 'Consulta indisponível', valor, 'Não foi possível consultar agora. Tente de novo em instantes.');
      else estadoSemResultado(el, 'idle', 'Aguardando consulta', '', 'Digite o número acima para ver o certificado.');
      return;
    }
    el.classList.remove('is-vazia');
    const ca = txt('caStageNumber').replace(/^\s*C\.A\.\s*/i, '');
    const interno = /^CI-/i.test(ca);
    const situacao = txt('caSituation'), validade = txt('caValidade');
    const cad = noCadastro(ca);
    const equipamento = txt('caEquipamento');
    const s = estadoDe(situacao, validade);

    $('[data-caf-result]', el).dataset.state = s.estado;
    $('[data-caf-status]', el).innerHTML = `<i data-lucide="${s.icone}"></i><span>${esc(interno && s.estado === 'valid' ? 'Código interno válido' : s.texto)}</span>`;
    $('[data-caf-numero]', el).innerHTML = interno ? esc(ca) : `<span class="caf-prefix">C.A.</span> ${esc(ca)}`;
    por(el, 'nome', cad.epi?.nome || frase(equipamento) || 'Equipamento');
    const fab = ou(txt('caFabricante'));
    por(el, 'fab', fab);
    por(el, 'fab2', fab);
    const link = $('[data-caf-cadastro]', el);
    link.hidden = !(cad.variante && cad.epi && typeof openEpiDetail === 'function');
    link.dataset.epi = cad.epi?.id || '';
    link.dataset.variante = cad.variante?.id || '';

    por(el, 'validade', vazio(validade) ? '—' : dataLonga(validade));
    por(el, 'prazo', s.nota);
    por(el, 'ref', ou(txt('caReferencia')));
    por(el, 'cnpj', vazio(txt('caCnpj')) ? '—' : cnpjFmt(txt('caCnpj')));
    por(el, 'tipo', vazio(equipamento) ? '—' : frase(equipamento));
    por(el, 'marca', ou(txt('caMarca')));
    por(el, 'anterior', cad.anteriores.length ? cad.anteriores.map((c) => (/^CI-/i.test(c) ? c : `C.A. ${c}`)).join(', ') : '—');
    por(el, 'norma', ou(txt('caNorma')));
    por(el, 'desc', txt('caDescricao') || '—');
    por(el, 'fonte', `${interno ? 'Base CIEPI' : 'Base oficial CAEPI'} · ${txt('caSourceInfo').replace(/^Base:\s*/i, '').replace(/^(prontuário|CIEPI)\s*•\s*/i, '') || '—'}`);

    // Histórico: só o que a base traz (versões e validade anterior). Sem datas inventadas.
    const linha = $('[data-caf-hist-linha]', el);
    if (interno) { linha.hidden = true; }
    else {
      linha.hidden = false;
      por(el, 'hist', 'Consultando…'); por(el, 'hist2', '');
      icons();
      const hist = await historico(ca);
      if (meu !== pedido) return;
      const validades = [...new Set(hist.map((x) => String(x.data_validade || '').slice(0, 10)).filter(Boolean))].sort().reverse();
      const atualIso = (validade.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) || []).slice(1).reverse().join('-');
      const anterior = validades.find((d) => atualIso && d < atualIso);
      const n = validades.length;
      if (!n) linha.hidden = true;
      por(el, 'hist', `${n} ${n === 1 ? 'versão' : 'versões'} na base oficial`);
      por(el, 'hist2', anterior ? `Anterior válida até ${dataLonga(dataBR(anterior))}` : 'Sem renovação registrada');
    }
    icons();
  }

  function ligar(el) {
    const campo = $('[data-caf-input]', el);
    campo.addEventListener('input', () => {
      try { const limpo = cleanCaTyping(campo.value); if (campo.value !== limpo) campo.value = limpo; } catch (_) {}
    });
    $('[data-caf-form]', el).addEventListener('submit', (e) => { e.preventDefault(); consultar(el); });
    $('[data-caf-mais]', el)?.addEventListener('click', (e) => {
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
