(() => {
  'use strict';

  // Programar entrega (PC): monta o pedido (colaborador + EPIs com C.A.,
  // quantidade e tamanho) com um resumo ao lado. Ao concluir, a programação vai
  // para a fila do celular (status 'programada'), onde a entrega é confirmada
  // com facial e assinatura. Nada baixa do estoque aqui.
  if (window.__EPI_PROGRAMAR__) return;
  window.__EPI_PROGRAMAR__ = true;

  const $ = (id) => document.getElementById(id);
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const isAdmin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  // Listas do app.js (variáveis globais do script principal).
  const LISTAS = {
    collaborators: () => collaborators, epiCatalog: () => epiCatalog,
    epiVariants: () => epiVariants, movements: () => movements
  };
  const lista = (nome) => { try { const v = LISTAS[nome](); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const normCa = (c) => { const t = String(c || '').trim(); if (!t) return ''; return /^CI-/i.test(t) ? t.toUpperCase() : t.replace(/\D+/g, ''); };
  const fmt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
  const hoje = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const dataBR = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const iconeEpi = (nome) => { try { return typeof epiCardIcon === 'function' ? epiCardIcon({ nome }) : 'package'; } catch (_) { return 'package'; } };
  const codigo = (ca) => (/^CI-/i.test(String(ca)) ? String(ca) : 'C.A. ' + ca);

  const colaboradores = () => lista('collaborators').filter((c) => c.ativo !== false);
  const epis = () => lista('epiCatalog').filter((e) => e.ativo !== false);
  const variantes = (epiId) => lista('epiVariants').filter((v) => v.epi_id === epiId && v.ativo !== false);
  const acharColab = (nome) => { const n = norm(nome); return n ? colaboradores().find((c) => norm(c.nome) === n) || null : null; };
  const acharEpi = (nome) => { const n = norm(nome); return n ? epis().find((e) => norm(e.nome) === n) || null : null; };

  function setMsg(texto, erro = false) {
    const el = $('progMsg');
    el.textContent = texto;
    el.classList.toggle('is-error', erro);
  }

  // Saldo por C.A. de cada EPI (epi_stock_por_ca), guardado enquanto a tela está aberta.
  const saldos = new Map();
  async function saldoDoEpi(epiId) {
    if (saldos.has(epiId)) return saldos.get(epiId);
    const { data, error } = await db().rpc('epi_stock_por_ca', { p_epi: epiId });
    const mapa = new Map((error ? [] : data || []).map((r) => [r.ca || '', Number(r.saldo) || 0]));
    saldos.set(epiId, mapa);
    return mapa;
  }
  const saldoCa = (epiId, v) => saldos.get(epiId)?.get(normCa(v?.ca)) || 0;

  // ---- Uniformes (botão "Uniforme" na Composição da entrega) ----
  // Com o botão ligado, a entrega inteira é de uniforme: cada linha escolhe
  // Item (peça), Sala, Tamanho e Quantidade das salas de uniforme
  // (deposito_itens). O Estoque mostra o saldo daquela peça, sala e tamanho.
  // Só programa com os três escolhidos; a peça sai da sala na confirmação (Fila).
  let modoUni = false;
  let uni = { salas: [], itens: [] };
  async function carregarUni() {
    const cli = db();
    if (!cli) return;
    const [d, i] = await Promise.all([
      cli.from('depositos').select('id,nome,ativo').order('nome'),
      cli.from('deposito_itens').select('id,deposito_id,peca,tamanho,quantidade,ca')
    ]);
    uni = { salas: (d.data || []).filter((s) => s.ativo !== false), itens: i.data || [] };
    const dl = $('dlProgPeca');
    if (dl) dl.innerHTML = [...new Set(uni.itens.map((x) => x.peca))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((p) => `<option value="${esc(p)}">`).join('');
  }
  const ORDEM_TAM = ['PP', 'P', 'M', 'G', 'GG', 'EXG', 'EXGG', 'EXGGG'];
  const pesoTam = (t) => { const s = String(t || '').trim().toUpperCase(); const n = parseFloat(s); if (!Number.isNaN(n)) return n; const i = ORDEM_TAM.indexOf(s.split(' ')[0]); return i < 0 ? 999 : 1000 + i; };
  const acharPeca = (nome) => { const n = norm(nome); return n ? (uni.itens.find((x) => norm(x.peca) === n)?.peca || null) : null; };
  const salaCurta = (nome) => String(nome || '').replace(/^sala de uniformes?\s*[–-]?\s*/i, '') || nome;
  const iconePeca = (p) => (/bota|cal[cç]ado|sapato/i.test(p) ? 'footprints' : 'shirt');

  function botaoUni() {
    const tit = document.querySelector('.prog-comp-titulo');
    if (!tit || $('progUni')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'progUni';
    b.className = 'prog-uni-btn';
    b.setAttribute('aria-pressed', 'false');
    b.title = 'Entregar uniforme das salas (Novos / Usados) em vez de EPI';
    b.innerHTML = '<i data-lucide="shirt" aria-hidden="true"></i>Uniforme';
    b.addEventListener('click', () => setModo(!modoUni));
    tit.appendChild(b);
    if (!$('dlProgPeca')) { const dl = document.createElement('datalist'); dl.id = 'dlProgPeca'; document.body.appendChild(dl); }
    icons();
  }

  function setModo(on, perguntar = true) {
    if (on === modoUni) return true;
    const preenchidas = [...$('progItens').querySelectorAll('.prog-item')].some((l) => (l.querySelector('[data-campo="epi"],[data-campo="peca"]')?.value || '').trim());
    if (perguntar && preenchidas && !confirm(on ? 'Trocar para uniforme tira os EPIs já escolhidos desta entrega. Continuar?' : 'Voltar para EPI tira os uniformes já escolhidos desta entrega. Continuar?')) return false;
    modoUni = on;
    const b = $('progUni');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on); }
    document.querySelector('.prog-comp-titulo')?.closest('.prog-bloco')?.classList.toggle('prog-uni-on', on);
    const cab = document.querySelector('.prog-cab');
    if (cab) { const s = cab.querySelectorAll('span'); if (s[1]) s[1].textContent = on ? 'Item' : 'EPI'; if (s[2]) s[2].textContent = on ? 'Sala' : 'C.A.'; }
    $('progAdd').innerHTML = `<i data-lucide="plus" aria-hidden="true"></i>${on ? 'Adicionar outro item' : 'Adicionar outro EPI'}`;
    $('progItens').innerHTML = '';
    novaLinha();
    if (on) carregarUni();
    icons();
    resumo();
    return true;
  }

  function novaLinhaUni() {
    const div = document.createElement('div');
    div.className = 'prog-item prog-item--uni';
    div.dataset.linha = ++seq;
    div.innerHTML = `
      <div class="prog-epi-cel"><span class="prog-epi-icone" data-icone><i data-lucide="shirt"></i></span><input data-campo="peca" list="dlProgPeca" placeholder="Digite o item" autocomplete="off" aria-label="Item"></div>
      <select data-campo="sala" aria-label="Sala" disabled><option value="">—</option></select>
      <span class="prog-saldo" data-saldo>—</span>
      <div class="prog-qtd">
        <button type="button" data-passo="-1" aria-label="Diminuir"><i data-lucide="minus"></i></button>
        <input data-campo="qtd" type="number" min="1" step="1" value="1" inputmode="numeric" aria-label="Quantidade">
        <button type="button" data-passo="1" aria-label="Aumentar"><i data-lucide="plus"></i></button>
      </div>
      <select data-campo="tamuni" aria-label="Tamanho" disabled><option value="">—</option></select>
      <button class="prog-remover" type="button" data-remover title="Tirar este item" aria-label="Tirar este item"><i data-lucide="trash-2"></i></button>
      <p class="prog-aviso" data-aviso hidden></p>`;
    $('progItens').appendChild(div);
    icons();
    return div;
  }

  // Item escolhido: monta as salas que têm essa peça.
  function escolherPeca(linha) {
    const peca = acharPeca(linha.querySelector('[data-campo="peca"]').value);
    if ((linha.dataset.peca || '') === (peca || '')) return avisarUni(linha);
    linha.dataset.peca = peca || '';
    linha.dataset.item = '';
    linha.classList.toggle('tem-epi', !!peca);
    if (peca) $('progItens').querySelectorAll('.prog-item').forEach((l) => {
      if (l !== linha && !l.querySelector('[data-campo="peca"]')?.value.trim()) l.remove();
    });
    linha.querySelector('[data-icone]').innerHTML = `<i data-lucide="${iconePeca(peca || '')}"></i>`;
    const sel = linha.querySelector('[data-campo="sala"]');
    const salas = peca ? uni.salas.filter((s) => uni.itens.some((x) => x.deposito_id === s.id && x.peca === peca)) : [];
    sel.innerHTML = salas.length
      ? '<option value="">Escolher</option>' + salas.map((s) => { const t = uni.itens.filter((x) => x.deposito_id === s.id && x.peca === peca).reduce((a, x) => a + x.quantidade, 0); return `<option value="${esc(s.id)}" title="${esc(s.nome)}: ${fmt(t)} peças">${esc(salaCurta(s.nome))}</option>`; }).join('')
      : '<option value="">—</option>';
    sel.disabled = !salas.length;
    if (salas.length === 1) sel.value = salas[0].id;
    escolherSala(linha);
  }

  // Sala escolhida: monta os tamanhos daquela peça na sala, com o saldo.
  function escolherSala(linha) {
    const peca = linha.dataset.peca, sala = linha.querySelector('[data-campo="sala"]').value;
    const sel = linha.querySelector('[data-campo="tamuni"]');
    const tams = peca && sala ? uni.itens.filter((x) => x.deposito_id === sala && x.peca === peca)
      .sort((a, b) => pesoTam(a.tamanho) - pesoTam(b.tamanho) || a.tamanho.localeCompare(b.tamanho, 'pt-BR', { numeric: true })) : [];
    const antes = linha.dataset.item;
    sel.innerHTML = tams.length
      ? '<option value="">Escolher</option>' + tams.map((x) => `<option value="${esc(x.id)}"${x.quantidade <= 0 ? ' disabled' : ''}>${esc(x.tamanho || 'Único')} · ${fmt(x.quantidade)}</option>`).join('')
      : '<option value="">—</option>';
    sel.disabled = !tams.length;
    const comSaldo = tams.filter((x) => x.quantidade > 0);
    sel.value = tams.some((x) => x.id === antes) ? antes : (comSaldo.length === 1 && tams.length === 1 ? comSaldo[0].id : '');
    linha.dataset.item = sel.value;
    avisarUni(linha);
  }

  function avisarUni(linha) {
    const el = linha.querySelector('[data-aviso]');
    const nome = linha.querySelector('[data-campo="peca"]').value.trim();
    const sala = linha.querySelector('[data-campo="sala"]').value;
    const item = uni.itens.find((x) => x.id === linha.dataset.item);
    const qtd = Number(linha.querySelector('[data-campo="qtd"]').value) || 0;
    const avisos = [];
    if (nome && !linha.dataset.peca) avisos.push('Item não está em nenhuma sala. Escolha um da lista.');
    else if (linha.dataset.peca && !sala) avisos.push('Escolha a sala.');
    else if (sala && !item) avisos.push('Escolha o tamanho.');
    else if (item && qtd > item.quantidade) avisos.push(item.quantidade > 0 ? `Só tem ${fmt(item.quantidade)} desse tamanho na sala.` : 'Esse tamanho acabou na sala.');
    el.textContent = avisos.join(' ');
    el.hidden = !avisos.length;
    // Estoque: só aparece depois de escolher o tamanho.
    const cel = linha.querySelector('[data-saldo]');
    const s = item ? item.quantidade : null;
    cel.className = 'prog-saldo' + (s == null ? '' : s <= 0 || qtd > s ? ' is-ruim' : ' is-ok') + (avisos.length && s != null ? ' tem-aviso' : '');
    cel.title = avisos.join(' ');
    cel.innerHTML = (avisos.length && s != null ? '<i data-lucide="triangle-alert"></i>' : '') + (s == null ? '—' : fmt(s));
    linha.classList.toggle('tem-aviso', !!avisos.length && !!nome);
    icons();
    resumo();
  }

  // ---- Cartão de cada EPI ----
  let seq = 0;
  function novaLinha() {
    if (modoUni) return novaLinhaUni();
    const id = ++seq;
    const div = document.createElement('div');
    div.className = 'prog-item';
    div.dataset.linha = id;
    div.innerHTML = `
      <div class="prog-epi-cel"><span class="prog-epi-icone" data-icone><i data-lucide="package"></i></span><input data-campo="epi" list="dlProgEpi" placeholder="Digite o EPI" autocomplete="off" aria-label="EPI"></div>
      <select data-campo="ca" aria-label="C.A." disabled><option value="">—</option></select>
      <span class="prog-saldo" data-saldo>—</span>
      <div class="prog-qtd">
        <button type="button" data-passo="-1" aria-label="Diminuir"><i data-lucide="minus"></i></button>
        <input data-campo="qtd" type="number" min="1" step="1" value="1" inputmode="numeric" aria-label="Quantidade">
        <button type="button" data-passo="1" aria-label="Aumentar"><i data-lucide="plus"></i></button>
      </div>
      <input data-campo="tam" list="dlProgTam${id}" placeholder="—" autocomplete="off" aria-label="Tamanho (se houver)"><datalist id="dlProgTam${id}"></datalist>
      <button class="prog-remover" type="button" data-remover title="Tirar este EPI" aria-label="Tirar este EPI"><i data-lucide="trash-2"></i></button>
      <p class="prog-aviso" data-aviso hidden></p>`;
    $('progItens').appendChild(div);
    icons();
    return div;
  }

  async function escolherEpi(linha) {
    const epi = acharEpi(linha.querySelector('[data-campo="epi"]').value);
    const sel = linha.querySelector('[data-campo="ca"]');
    const dlTam = linha.querySelector('datalist');
    if ((linha.dataset.epi || '') === (epi?.id || '')) return avisar(linha);
    linha.dataset.epi = epi?.id || '';
    linha.dataset.var = '';
    linha.classList.toggle('tem-epi', !!epi);
    // Escolheu um EPI: as outras linhas que ficaram vazias saem da tabela.
    if (epi) $('progItens').querySelectorAll('.prog-item').forEach((l) => {
      if (l !== linha && !l.querySelector('[data-campo="epi"]').value.trim()) l.remove();
    });
    linha.querySelector('[data-icone]').innerHTML = `<i data-lucide="${esc(epi ? iconeEpi(epi.nome) : 'package')}"></i>`;
    sel.innerHTML = '<option value="">—</option>';
    sel.disabled = true;
    dlTam.innerHTML = '';
    if (epi) {
      const vars = variantes(epi.id);
      await saldoDoEpi(epi.id);
      if (vars.length) {
        sel.innerHTML = '<option value="">Escolher</option>' + vars.map((v) =>
          `<option value="${esc(v.id)}" title="${esc((v.apelido ? v.apelido + ' · ' : '') + 'estoque ' + fmt(saldoCa(epi.id, v)))}">${esc(String(v.ca))}</option>`).join('');
        sel.disabled = false;
        if (vars.length === 1) { sel.value = vars[0].id; linha.dataset.var = vars[0].id; }
      } else {
        sel.innerHTML = '<option value="">Sem C.A.</option>';
      }
      const tams = [...new Set(lista('movements').filter((m) => m.epi_id === epi.id).map((m) => String(m.tamanho || '').trim()).filter((t) => t && t !== 'N/A'))];
      dlTam.innerHTML = tams.map((t) => `<option value="${esc(t)}">`).join('');
    }
    icons();
    fotoLinha(linha);
    avisar(linha);
  }

  function marcarCa(linha, varId) {
    linha.dataset.var = varId;
    fotoLinha(linha);
    avisar(linha);
  }

  // Foto do EPI na caixinha da linha (só no PC): a do C.A. escolhido ou, se
  // ele não tiver, a de outro C.A. do mesmo EPI. Sem foto cadastrada, a caixa
  // fica vazia no PC (no celular continua o ícone).
  async function fotoLinha(linha) {
    const box = linha.querySelector('[data-icone]');
    if (!box) return;
    box.querySelector('img')?.remove();
    box.classList.remove('tem-foto');
    const epiId = linha.dataset.epi;
    if (!epiId || typeof variantImageUrl !== 'function') return;
    const vars = lista('epiVariants').filter((v) => v.epi_id === epiId && v.ativo !== false && v.imagem_path);
    const v = vars.find((x) => x.id === linha.dataset.var) || vars[0];
    if (!v) return;
    try {
      const url = await variantImageUrl(v.imagem_path);
      if (!url || linha.dataset.epi !== epiId || box.querySelector('img')) return;
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = url;
      box.appendChild(img);
      box.classList.add('tem-foto');
    } catch (_) { /* sem foto: a caixa fica vazia */ }
  }

  function avisar(linha) {
    const el = linha.querySelector('[data-aviso]');
    const epiId = linha.dataset.epi;
    const nomeEpi = linha.querySelector('[data-campo="epi"]').value.trim();
    const varId = linha.dataset.var;
    const qtd = Number(linha.querySelector('[data-campo="qtd"]').value) || 0;
    const avisos = [];
    if (nomeEpi && !epiId) avisos.push('EPI não cadastrado. Escolha um da lista.');
    if (epiId && varId) {
      const v = lista('epiVariants').find((x) => x.id === varId);
      const s = saldoCa(epiId, v);
      if (qtd > s) avisos.push(s > 0 ? `Só tem ${fmt(s)} em estoque deste C.A.` : 'Este C.A. está sem estoque.');
      if (v?.data_validade && String(v.data_validade).slice(0, 10) < hoje()) avisos.push(`C.A. vencido em ${dataBR(v.data_validade)}.`);
    }
    if (epiId && !varId && variantes(epiId).length) avisos.push('Escolha o C.A. que vai ser entregue.');
    el.textContent = avisos.join(' ');
    el.hidden = !avisos.length;
    // Coluna Estoque: saldo do C.A. escolhido; aviso vira ícone com o motivo no título.
    const cel = linha.querySelector('[data-saldo]');
    const v = varId ? lista('epiVariants').find((x) => x.id === varId) : null;
    const s = v ? saldoCa(epiId, v) : null;
    cel.className = 'prog-saldo' + (s == null ? '' : s <= 0 || qtd > s ? ' is-ruim' : ' is-ok') + (avisos.length ? ' tem-aviso' : '');
    cel.title = avisos.join(' ');
    cel.innerHTML = (avisos.length ? '<i data-lucide="triangle-alert"></i>' : '') + (s == null ? '—' : fmt(s));
    linha.classList.toggle('tem-aviso', !!avisos.length);
    icons();
    resumo();
  }

  function mostrarColab() {
    const el = $('progTermo');
    const av = $('progAvatar');
    const nome = $('progColab').value.trim();
    const c = acharColab(nome);
    av.classList.toggle('is-ok', !!c);
    if (c) {
      const p = c.nome.trim().split(/\s+/);
      av.textContent = ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    } else av.innerHTML = '<i data-lucide="user"></i>';
    if (!nome) { el.textContent = ''; el.className = 'prog-termo'; }
    else if (!c) { el.textContent = 'Não cadastrado'; el.title = 'Escolha um colaborador da lista.'; el.className = 'prog-termo is-ruim'; }
    else {
      const ok = window.EPI_TERMO?.temAssinatura?.(c.id);
      el.innerHTML = ok ? '<i data-lucide="check"></i>Termo assinado'
        : '<i data-lucide="triangle-alert"></i>Sem termo';
      el.title = ok ? '' : 'No celular, a entrega só libera depois do termo assinado.';
      el.className = 'prog-termo ' + (ok ? 'is-ok' : 'is-ruim');
    }
    // Função e setor ao lado do campo (padrão visual no PC).
    const info = $('progColabInfo');
    if (info) {
      info.hidden = !c;
      info.innerHTML = c ? `<div><span>Função</span><b>${esc(c.funcao || c.cargo || '—')}</b></div>` : '';
    }
    icons();
    posicionarTermo();
    requestAnimationFrame(posicionarTermo);
    resumo();
    atualizarOs();
  }

  // No PC o selo do termo fica logo depois do nome, dentro do campo (como no
  // mockup). Mede o texto digitado e encosta o selo nele; se o nome for longo,
  // o selo para antes da setinha e o texto é cortado antes dele.
  let regua = null;
  function posicionarTermo() {
    const inp = $('progColab'), el = $('progTermo');
    if (!inp || !el) return;
    // No PC o selo do termo foi desligado: o campo é só o nome.
    if (window.matchMedia('(min-width:721px)').matches || !el.textContent.trim()) {
      el.style.left = ''; el.style.right = ''; inp.style.removeProperty('padding-right'); return;
    }
    const cs = getComputedStyle(inp);
    // Mede com um span invisível na mesma fonte do campo (o canvas media com a
    // fonte reserva enquanto a Inter ainda não tinha chegado, e o selo caía
    // em cima do nome).
    if (!regua) {
      regua = document.createElement('span');
      regua.setAttribute('aria-hidden', 'true');
      regua.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;pointer-events:none';
      document.body.appendChild(regua);
    }
    regua.style.font = cs.font;
    regua.style.letterSpacing = cs.letterSpacing;
    regua.textContent = inp.value || '';
    const texto = regua.getBoundingClientRect().width;
    const pl = parseFloat(cs.paddingLeft) || 0;
    // Se o nome não couber inteiro junto do selo, o selo vira só o ícone
    // (o texto aparece ao passar o mouse).
    el.classList.remove('is-curto');
    if (pl + texto + 10 + el.offsetWidth + 34 > inp.clientWidth) {
      el.classList.add('is-curto');
      if (!el.title) el.title = el.textContent.trim();
    }
    const larg = el.offsetWidth;
    const max = inp.clientWidth - larg - 34;
    const left = Math.min(pl + texto + 10, max);
    el.style.left = `${inp.offsetLeft + left}px`;
    el.style.right = 'auto';
    inp.style.setProperty('padding-right', `${larg + 42}px`, 'important');
  }
  window.addEventListener('resize', () => posicionarTermo());
  // O campo muda de largura sem a janela mudar (Resumo, menu lateral, barra de
  // rolagem, fonte terminando de carregar): reposiciona o selo junto, para ele
  // nunca passar por cima da setinha nem sair do campo.
  if (window.ResizeObserver) {
    let ultimaLarg = 0;
    const obs = new ResizeObserver(() => {
      const inp = $('progColab');
      if (!inp || inp.offsetWidth === ultimaLarg) return;
      ultimaLarg = inp.offsetWidth;
      posicionarTermo();
    });
    const ligar = () => { const inp = $('progColab'); if (inp) obs.observe(inp); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
  }
  document.fonts?.ready?.then(() => posicionarTermo());
  // A Inter é baixada só quando a tela usa: remede quando ela chegar.
  document.fonts?.addEventListener?.('loadingdone', () => posicionarTermo());

  // ---- Resumo ao lado ----
  function resumo() {
    const box = $('progResumo');
    if (!box) return;
    const c = acharColab($('progColab').value);
    const itens = [...$('progItens').querySelectorAll('.prog-item')].map((l) => {
      if (l.classList.contains('prog-item--uni')) {
        if (!l.dataset.peca) return null;
        const it = uni.itens.find((x) => x.id === l.dataset.item);
        const sala = uni.salas.find((s) => s.id === l.querySelector('[data-campo="sala"]').value);
        return { nome: l.dataset.peca, qtd: Number(l.querySelector('[data-campo="qtd"]').value) || 0, ca: sala ? salaCurta(sala.nome) : '', tam: it ? (it.tamanho || 'Único') : '', aviso: !l.querySelector('[data-aviso]').hidden, uni: true };
      }
      const epi = epis().find((e) => e.id === l.dataset.epi);
      if (!epi) return null;
      const v = lista('epiVariants').find((x) => x.id === l.dataset.var);
      const tam = l.querySelector('[data-campo="tam"]').value.trim();
      const caNum = v ? (/^CI-/i.test(String(v.ca)) ? String(v.ca) : `CA ${v.ca}`) : '';
      return { nome: epi.nome, qtd: Number(l.querySelector('[data-campo="qtd"]').value) || 0, ca: caNum, tam, aviso: !l.querySelector('[data-aviso]').hidden };
    }).filter(Boolean);
    const total = itens.reduce((a, i) => a + i.qtd, 0);
    const comAviso = itens.filter((i) => i.aviso).length;
    // Como no mockup: três linhas (ícone, rótulo, valor à direita) e a lista
    // tabelinha: Nome | C.A. | Qtd | Tam (nome corta com reticências).
    box.innerHTML = `
      <dl class="prog-res-info">
        <div><dt><i data-lucide="users-round"></i>Colaborador</dt><dd${c ? '' : ' class="vazio"'}>${c ? esc(c.nome) : '—'}</dd></div>
        <div><dt><i data-lucide="layers"></i>Total de itens</dt><dd>${fmt(total)}</dd></div>
        <div><dt><i data-lucide="calendar-days"></i>Previsão de entrega</dt><dd>${esc(dataBR($('progData').value) || '—')}</dd></div>
      </dl>
      <div class="prog-res-sec">
        <h4 class="prog-res-tit">Itens selecionados</h4>
        ${itens.length
          ? `<ul class="prog-res-itens"><li class="prog-res-cab" aria-hidden="true"><span class="prog-res-nome">Nome</span><span class="prog-res-c">${modoUni ? 'Sala' : 'C.A.'}</span><span class="prog-res-c">Qtd</span><span class="prog-res-c">Tam</span></li>${itens.map((i) => { const completo = [i.nome, i.ca || (i.uni ? '' : 'Sem C.A.'), `Qtd. ${fmt(i.qtd)}`, i.tam ? `Tam. ${i.tam}` : ''].filter(Boolean).join(' · '); return `<li title="${esc(completo)}"><span class="prog-res-nome">${esc(i.nome)}</span><span class="prog-res-c">${esc(i.ca ? i.ca.replace(/^CA /, '') : (i.uni ? '—' : 's/ C.A.'))}</span><span class="prog-res-c">${fmt(i.qtd)}</span><span class="prog-res-c${i.tam ? '' : ' is-vazio'}">${esc(i.tam || '—')}</span></li>`; }).join('')}</ul>
            ${comAviso ? `<p class="prog-res-avisos">${comAviso} ${modoUni ? (comAviso === 1 ? 'item falta escolher ou passa do estoque' : 'itens faltam escolher ou passam do estoque') + '. Acerte antes de programar.' : (comAviso === 1 ? 'EPI tem aviso' : 'EPIs têm aviso') + ' (estoque ou C.A.). Dá para programar mesmo assim.'}</p>` : ''}`
          : `<p class="prog-res-vazio">${modoUni ? 'Nenhum item adicionado' : 'Nenhum EPI adicionado'}</p>`}
      </div>
      <div class="prog-res-div" aria-hidden="true"></div>`;
    icons();
    const conta = $('progConta');
    if (conta) conta.textContent = `${fmt(total)} ${total === 1 ? 'item' : 'itens'}`;
    faixaOs(c);
  }

  // Faixa "Pela O.S." no topo da tabela: o que a O.S. do colaborador pede e ele
  // nunca recebeu (ou recebeu com C.A. vencido). Cada nome é um botão que põe o
  // EPI na tabela; o que já está na tabela sai da faixa.
  const isoDeBR = (br) => { const [d, m, y] = String(br || '').split('/'); return y ? `${y}-${m}-${d}` : ''; };
  function faltasOs(c) {
    const os = osDoColab(c);
    if (!os) return null;
    const h = hoje();
    const naTabela = new Set([...$('progItens').querySelectorAll('.prog-item')].map((l) => l.dataset.epi).filter(Boolean));
    const recebidos = lista('movements').filter((m) => m.colaborador_id === c.id);
    const vistos = new Set();
    const faltas = [];
    let pedidos = 0, naEntrega = 0;
    for (const item of os.epis || []) {
      if (!item.epi_id || vistos.has(item.epi_id)) continue;
      vistos.add(item.epi_id);
      const epi = epis().find((e) => e.id === item.epi_id);
      if (!epi) continue;
      pedidos++;
      const ult = recebidos.filter((m) => m.epi_id === item.epi_id).sort((x, y) => isoDeBR(y.data).localeCompare(isoDeBR(x.data)))[0];
      let st = null, motivo = '';
      if (!ult) { st = 'falta'; motivo = 'Nunca recebeu'; }
      else {
        const v = lista('epiVariants').find((x) => x.epi_id === item.epi_id && normCa(x.ca) === normCa(ult.ca));
        if (v?.data_validade && String(v.data_validade).slice(0, 10) < h) { st = 'vencido'; motivo = `Recebeu em ${ult.data} com C.A. vencido`; }
      }
      if (st && naTabela.has(epi.id)) naEntrega++;
      else if (st) faltas.push({ id: epi.id, nome: epi.nome, st, motivo });
    }
    return { os, faltas, pedidos, naEntrega };
  }

  function faixaOs(c) {
    const el = $('progFaltaOs');
    if (!el) return;
    const r = c ? faltasOs(c) : null;
    // Etiqueta "O.S. ativa · N itens pendentes" na faixa do colaborador (só no PC).
    const chip = $('progOsChip');
    if (chip) {
      // Fica sempre no lugar: sem colaborador ou sem O.S., mostra "Nenhuma O.S.".
      chip.hidden = false;
      if (r && !r.pedidos) {
        // O.S. ligada ao cadastro, mas sem EPIs nela.
        chip.className = 'prog-os-chip is-vazio';
        chip.innerHTML = `<i data-lucide="layers"></i><span><em>O.S. ${esc(r.os.funcao || '')}</em> · sem EPIs</span>`;
        chip.title = `O.S. de ${r.os.funcao}`;
      } else if (!r) {
        chip.className = 'prog-os-chip is-vazio';
        chip.innerHTML = '<i data-lucide="layers"></i><span>Nenhuma O.S. identificada</span>';
        chip.title = c ? 'Este colaborador não tem O.S. no cadastro.' : 'Escolha um colaborador para ver a O.S.';
      } else {
        const n = r.faltas.length;
        chip.className = 'prog-os-chip' + (n ? '' : ' is-ok');
        chip.innerHTML = `<i data-lucide="${n ? 'layers' : 'circle-check'}"></i><span><em>O.S. ativa</em> · ${n ? `${n} ${n === 1 ? 'item pendente' : 'itens pendentes'}` : 'em dia'}</span>`;
        chip.title = `O.S. de ${r.os.funcao}`;
      }
      icons();
      // O chip aparecendo/sumindo muda a largura do campo do colaborador.
      posicionarTermo();
    }
    if (!r || !r.pedidos) { el.hidden = true; el.innerHTML = ''; el.dataset.chave = ''; rotOsColab = null; return; }
    // Só redesenha quando muda o colaborador ou o que falta (o resumo chama
    // isto a cada tecla; redesenhar à toa reiniciava o carrossel e as fotos).
    const chave = `${c.id}|${r.faltas.map((x) => x.id + ':' + x.st).join(',')}|${r.naEntrega}`;
    if (el.dataset.chave === chave && !el.hidden) return;
    if (rotOsColab !== c.id) { rotOs = 0; rotOsColab = c.id; }
    el.dataset.chave = chave;
    el.hidden = false;
    // No PC: painel com 3 cartões e setinha (pc); no celular continua a lista
    // de botões de antes (velho).
    const cabPc = (sub) => `<div class="prog-osp-cab"><span class="prog-osp-ic" aria-hidden="true"><i data-lucide="clock-3"></i></span>
        <div class="prog-osp-txt"><h3 class="prog-osp-tit">Falta entregar pela O.S.</h3><p class="prog-osp-sub">${sub}</p></div>
        ${r.faltas.length > 3 ? '<button type="button" class="prog-osp-prox" data-osp-prox title="Ver o próximo item" aria-label="Ver o próximo item"><i data-lucide="chevron-right"></i></button>' : ''}</div>`;
    if (!r.faltas.length) {
      el.className = 'prog-falta is-ok';
      const txt = r.naEntrega
        ? `Tudo o que faltava da O.S. de <b>${esc(r.os.funcao)}</b> já está nesta entrega`
        : `Em dia com a O.S. de <b>${esc(r.os.funcao)}</b>`;
      el.innerHTML = `<div class="prog-osp is-ok">${cabPc(txt)}</div>
        <div class="prog-falta-velho"><i data-lucide="circle-check"></i><span>${txt}</span></div>`;
    } else {
      el.className = 'prog-falta';
      const n = r.faltas.length;
      const ordem = r.faltas.slice(rotOs % n).concat(r.faltas.slice(0, rotOs % n));
      el.innerHTML = `<div class="prog-osp">${cabPc('Itens pendentes desta ordem de serviço.')}
          <div class="prog-osp-janela"><div class="prog-osp-trilho">${ordem.map((x) => {
            const v = caDaFalta(x.id);
            const ca = v ? (/^CI-/i.test(String(v.ca)) ? String(v.ca) : 'CA ' + v.ca) : 'Sem C.A.';
            return `<button type="button" class="prog-osp-item is-${x.st}" data-falta-epi="${esc(x.id)}" title="${esc(x.motivo)} · clique para pôr na entrega">
              <span class="prog-osp-foto" data-osp-foto="${esc(x.id)}"></span>
              <span class="prog-osp-info"><span class="prog-osp-nome">${esc(x.nome)}</span><span class="prog-osp-ca">${esc(ca)}</span></span></button>`;
          }).join('')}</div></div></div>
        <div class="prog-falta-velho">
          <div class="prog-falta-cab">
            <div class="prog-falta-txt"><i data-lucide="triangle-alert"></i><span><b>Falta entregar pela O.S.</b> · ${esc(r.os.funcao)} <em>(${n})</em></span></div>
            ${n > 1 ? '<button type="button" class="prog-falta-todos" data-falta-todos><i data-lucide="plus"></i>Adicionar todos</button>' : ''}
          </div>
          <div class="prog-falta-chips">${r.faltas.map((x) => `<button type="button" class="prog-falta-chip is-${x.st}" data-falta-epi="${esc(x.id)}" title="${esc(x.motivo)} · clique para pôr na entrega"><i data-lucide="plus"></i>${esc(x.nome)}</button>`).join('')}</div>
        </div>`;
      fotosOs(el);
    }
    icons();
  }

  // Carrossel da faixa da O.S. (PC): a setinha leva o 1º cartão para o fim,
  // o 2º vira o 1º e o próximo aparece.
  let rotOs = 0, rotOsColab = null;
  function proximoOs() {
    const trilho = $('progFaltaOs')?.querySelector('.prog-osp-trilho');
    if (!trilho || trilho.dataset.andando || trilho.children.length < 2) return;
    trilho.dataset.andando = '1';
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      trilho.style.transition = 'none';
      trilho.appendChild(trilho.firstElementChild);
      trilho.style.transform = '';
      void trilho.offsetWidth;
      trilho.style.transition = '';
      rotOs++;
      delete trilho.dataset.andando;
    };
    trilho.style.transition = 'transform 380ms cubic-bezier(.4,0,.2,1)';
    trilho.style.transform = 'translateX(calc((-100% - 14px) / 3))';
    trilho.addEventListener('transitionend', fim, { once: true });
    setTimeout(fim, 450);
  }

  // C.A. mostrado no cartão: o primeiro válido do EPI (senão o primeiro).
  function caDaFalta(epiId) {
    const h = hoje();
    const vs = variantes(epiId);
    return vs.find((v) => !v.data_validade || String(v.data_validade).slice(0, 10) >= h) || vs[0] || null;
  }

  // Foto cadastrada do EPI em cada cartão; sem foto, a caixinha fica vazia.
  function fotosOs(el) {
    if (typeof variantImageUrl !== 'function') return;
    el.querySelectorAll('[data-osp-foto]').forEach(async (box) => {
      const id = box.dataset.ospFoto;
      const v0 = caDaFalta(id);
      const vs = variantes(id).filter((v) => v.imagem_path);
      const v = (v0 && v0.imagem_path ? v0 : null) || vs[0];
      if (!v) return;
      try {
        const url = await variantImageUrl(v.imagem_path);
        if (!url || box.querySelector('img')) return;
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = url;
        box.appendChild(img);
        box.classList.add('tem-foto');
      } catch (_) { /* sem foto */ }
    });
  }

  // Põe um EPI na tabela: usa a linha vazia se houver, senão cria outra.
  async function adicionarEpi(id) {
    const epi = epis().find((e) => e.id === id);
    if (!epi) return;
    if (modoUni && !setModo(false)) return;
    const vazia = [...$('progItens').querySelectorAll('.prog-item')].find((l) => !l.querySelector('[data-campo="epi"]').value.trim());
    const linha = vazia || novaLinha();
    linha.querySelector('[data-campo="epi"]').value = epi.nome;
    await escolherEpi(linha);
  }

  // ---- Ordem de serviço da função do colaborador ----
  let ordens = null; // Map id -> OS, carregado na primeira vez
  async function carregarOrdens() {
    if (ordens) return ordens;
    const { data, error } = await db().from('ordens_servico').select('*').eq('ativo', true);
    if (error) { console.error('[OS]', error); return new Map(); }
    ordens = new Map((data || []).map((o) => [o.id, o]));
    return ordens;
  }
  const osDoColab = (c) => (c?.os_id && ordens ? ordens.get(c.os_id) || null : null);

  async function atualizarOs() {
    const b = $('progOs');
    if (!b) return;
    const c = acharColab($('progColab').value);
    if (c?.os_id) await carregarOrdens();
    const os = osDoColab(c);
    b.disabled = !os;
    b.title = !c ? 'Escolha o colaborador para ver a ordem de serviço dele'
      : os ? `Ver a OS de ${os.funcao} e os EPIs obrigatórios` : `${c.nome} ainda não tem ordem de serviço ligada`;
    resumo();
  }

  // Abre direto a folha A4 da OS (js/os-folha.js), com "Usar na entrega" na barra.
  function abrirOs() {
    const c = acharColab($('progColab').value);
    const os = osDoColab(c);
    if (!os) return;
    window.EPI_OS_FOLHA?.abrir({ os, colaborador: c, usar: () => usarOs(os) });
  }

  async function usarOs(os) {
    if (modoUni && !setModo(false)) return;
    // Tira as linhas vazias e acrescenta os EPIs da OS que ainda não estão na tabela.
    $('progItens').querySelectorAll('.prog-item').forEach((l) => { if (!l.querySelector('[data-campo="epi"]').value.trim()) l.remove(); });
    const naTabela = new Set([...$('progItens').querySelectorAll('.prog-item')].map((l) => l.dataset.epi).filter(Boolean));
    const novos = [...new Set((os.epis || []).map((i) => i.epi_id).filter((id) => id && !naTabela.has(id)))];
    for (const id of novos) {
      const epi = epis().find((e) => e.id === id);
      if (!epi) continue;
      const linha = novaLinha();
      linha.querySelector('[data-campo="epi"]').value = epi.nome;
      await escolherEpi(linha);
    }
    if (!$('progItens').children.length) novaLinha();
    resumo();
    const fora = (os.epis || []).filter((i) => !i.epi_id).length;
    setMsg(novos.length
      ? `${novos.length} ${novos.length === 1 ? 'EPI da OS entrou' : 'EPIs da OS entraram'} na entrega. Escolha o C.A. e a quantidade de cada um.${fora ? ` ${fora} ${fora === 1 ? 'item da OS não está cadastrado' : 'itens da OS não estão cadastrados'} no app.` : ''}`
      : 'Os EPIs da OS já estão na entrega.');
  }

  function limpar() {
    $('progColab').value = '';
    $('progData').value = hoje();
    $('progObs').value = '';
    $('progItens').innerHTML = '';
    novaLinha();
    mostrarColab();
  }

  async function concluir() {
    if (!isAdmin()) return;
    const colab = acharColab($('progColab').value);
    if (!colab) return setMsg('Escolha um colaborador cadastrado da lista.', true);
    const itens = [];
    for (const linha of $('progItens').querySelectorAll('.prog-item')) {
      if (linha.classList.contains('prog-item--uni')) {
        const nomeU = linha.querySelector('[data-campo="peca"]').value.trim();
        if (!nomeU) continue;
        if (!linha.dataset.peca) return setMsg(`"${nomeU}" não está em nenhuma sala de uniforme.`, true);
        if (!linha.querySelector('[data-campo="sala"]').value) return setMsg(`Escolha a sala de ${linha.dataset.peca}.`, true);
        const it = uni.itens.find((x) => x.id === linha.dataset.item);
        if (!it) return setMsg(`Escolha o tamanho de ${linha.dataset.peca}.`, true);
        const q = Number(linha.querySelector('[data-campo="qtd"]').value);
        if (!Number.isInteger(q) || q < 1) return setMsg(`Confira a quantidade de ${it.peca}.`, true);
        if (q > it.quantidade) return setMsg(`Só tem ${fmt(it.quantidade)} de ${it.peca} tam. ${it.tamanho || 'único'} nessa sala.`, true);
        itens.push({ deposito_item_id: it.id, quantidade: q });
        continue;
      }
      const nome = linha.querySelector('[data-campo="epi"]').value.trim();
      if (!nome) continue;
      const epi = acharEpi(nome);
      if (!epi) return setMsg(`"${nome}" não é um EPI cadastrado.`, true);
      const qtd = Number(linha.querySelector('[data-campo="qtd"]').value);
      if (!Number.isInteger(qtd) || qtd < 1) return setMsg(`Confira a quantidade de ${epi.nome}.`, true);
      itens.push({
        epi_id: epi.id,
        variante_id: linha.dataset.var || null,
        quantidade: qtd,
        tamanho: linha.querySelector('[data-campo="tam"]').value.trim() || null
      });
    }
    if (!itens.length) return setMsg(modoUni ? 'Adicione pelo menos um item de uniforme.' : 'Adicione pelo menos um EPI.', true);
    const botao = $('progConcluir');
    botao.disabled = true;
    setMsg('Salvando…');
    const { error } = await db().rpc('epi_programar_entrega', {
      p_colaborador: colab.id, p_data: $('progData').value || hoje(), p_observacao: $('progObs').value, p_itens: itens
    });
    botao.disabled = false;
    if (error) return setMsg('Não foi possível programar: ' + error.message, true);
    limpar();
    if (modoUni) carregarUni();
    setMsg(`Entrega de ${colab.nome} programada e enviada para a fila do celular.`);
  }

  function abrir() {
    if (!isAdmin()) return;
    $('dlProgColab').innerHTML = colaboradores().map((c) => `<option value="${esc(c.nome)}">`).join('');
    $('dlProgEpi').innerHTML = epis().map((e) => `<option value="${esc(e.nome)}">`).join('');
    saldos.clear();
    botaoUni();
    carregarUni().then(() => { if (modoUni) $('progItens').querySelectorAll('.prog-item--uni').forEach((l) => { l.dataset.peca = '__'; escolherPeca(l); }); });
    if (!$('progItens').children.length) limpar();
    else $('progItens').querySelectorAll('.prog-item:not(.prog-item--uni)').forEach((l) => { l.dataset.epi = '__'; escolherEpi(l); });
  }

  function start() {
    if (!$('progItens')) return;
    $('progData').value = hoje();
    botaoUni();
    document.querySelector('.nav [data-page="programar"]')?.addEventListener('click', abrir);
    $('progColab').addEventListener('input', mostrarColab);
    $('progData').addEventListener('change', resumo);
    $('progAdd').addEventListener('click', () => novaLinha().querySelector('input').focus());
    $('progLimpar').addEventListener('click', () => { limpar(); setMsg(''); });
    $('progOs')?.addEventListener('click', abrirOs);
    $('progFaltaOs')?.addEventListener('click', async (e) => {
      if (e.target.closest('[data-osp-prox]')) return proximoOs();
      const chip = e.target.closest('[data-falta-epi]');
      if (chip) return adicionarEpi(chip.dataset.faltaEpi);
      if (e.target.closest('[data-falta-todos]')) {
        const ids = [...$('progFaltaOs').querySelectorAll('.prog-falta-velho [data-falta-epi]')].map((b) => b.dataset.faltaEpi);
        for (const id of ids) await adicionarEpi(id);
      }
    });
    $('progConcluir').addEventListener('click', concluir);
    $('progItens').addEventListener('input', (e) => {
      const linha = e.target.closest('.prog-item');
      if (!linha) return;
      if (e.target.dataset.campo === 'peca') escolherPeca(linha);
      else if (e.target.dataset.campo === 'sala') escolherSala(linha);
      else if (e.target.dataset.campo === 'tamuni') { linha.dataset.item = e.target.value; avisarUni(linha); }
      else if (linha.classList.contains('prog-item--uni')) avisarUni(linha);
      else if (e.target.dataset.campo === 'epi') escolherEpi(linha);
      else if (e.target.dataset.campo === 'ca') marcarCa(linha, e.target.value);
      else avisar(linha);
    });
    $('progItens').addEventListener('click', (e) => {
      const linha = e.target.closest('.prog-item');
      if (!linha) return;
      const ca = e.target.closest('.prog-ca');
      if (ca) return marcarCa(linha, ca.dataset.var);
      const passo = e.target.closest('[data-passo]');
      if (passo) {
        const q = linha.querySelector('[data-campo="qtd"]');
        q.value = String(Math.max(1, (Number(q.value) || 1) + Number(passo.dataset.passo)));
        return linha.classList.contains('prog-item--uni') ? avisarUni(linha) : avisar(linha);
      }
      if (e.target.closest('[data-remover]')) {
        linha.remove();
        if (!$('progItens').children.length) novaLinha();
        resumo();
      }
    });
  }

  window.EPI_PROGRAMAR = { abrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
