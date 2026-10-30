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

  // ---- Cartão de cada EPI ----
  let seq = 0;
  function novaLinha() {
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
    linha.querySelector('[data-icone]').innerHTML = `<i data-lucide="${esc(epi ? iconeEpi(epi.nome) : 'package')}"></i>`;
    sel.innerHTML = '<option value="">—</option>';
    sel.disabled = true;
    dlTam.innerHTML = '';
    if (epi) {
      const vars = variantes(epi.id);
      await saldoDoEpi(epi.id);
      if (vars.length) {
        sel.innerHTML = '<option value="">Escolha o C.A.</option>' + vars.map((v) =>
          `<option value="${esc(v.id)}">${esc((v.apelido ? v.apelido + ' · ' : '') + codigo(v.ca))} (${fmt(saldoCa(epi.id, v))})</option>`).join('');
        sel.disabled = false;
        if (vars.length === 1) { sel.value = vars[0].id; linha.dataset.var = vars[0].id; }
      } else {
        sel.innerHTML = '<option value="">Sem C.A. cadastrado</option>';
      }
      const tams = [...new Set(lista('movements').filter((m) => m.epi_id === epi.id).map((m) => String(m.tamanho || '').trim()).filter((t) => t && t !== 'N/A'))];
      dlTam.innerHTML = tams.map((t) => `<option value="${esc(t)}">`).join('');
    }
    icons();
    avisar(linha);
  }

  function marcarCa(linha, varId) {
    linha.dataset.var = varId;
    avisar(linha);
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
      el.innerHTML = ok ? '<i data-lucide="shield-check"></i>Termo assinado'
        : '<i data-lucide="triangle-alert"></i>Sem termo';
      el.title = ok ? '' : 'No celular, a entrega só libera depois do termo assinado.';
      el.className = 'prog-termo ' + (ok ? 'is-ok' : 'is-ruim');
    }
    icons();
    resumo();
  }

  // ---- Resumo ao lado ----
  function resumo() {
    const box = $('progResumo');
    if (!box) return;
    const c = acharColab($('progColab').value);
    const itens = [...$('progItens').querySelectorAll('.prog-item')].map((l) => {
      const epi = epis().find((e) => e.id === l.dataset.epi);
      if (!epi) return null;
      const v = lista('epiVariants').find((x) => x.id === l.dataset.var);
      const tam = l.querySelector('[data-campo="tam"]').value.trim();
      return { nome: epi.nome, qtd: Number(l.querySelector('[data-campo="qtd"]').value) || 0, ca: v ? (v.apelido ? `${v.apelido} · ${codigo(v.ca)}` : codigo(v.ca)) : '', tam, aviso: !l.querySelector('[data-aviso]').hidden };
    }).filter(Boolean);
    const total = itens.reduce((a, i) => a + i.qtd, 0);
    const comAviso = itens.filter((i) => i.aviso).length;
    box.innerHTML = `
      <dl class="prog-res-quem">
        <div><dt>Colaborador</dt><dd class="${c ? '' : 'vazio'}">${c ? esc(c.nome) : 'Não escolhido'}</dd></div>
        <div><dt>Entrega em</dt><dd>${esc(dataBR($('progData').value) || '—')}</dd></div>
      </dl>
      ${itens.length ? `<ul class="prog-res-lista">${itens.map((i) => `<li><b>${fmt(i.qtd)}×</b><span>${esc(i.nome)}<small>${esc([i.ca || 'Sem C.A.', i.tam ? 'Tam. ' + i.tam : ''].filter(Boolean).join(' · '))}</small></span></li>`).join('')}</ul>
        ${comAviso ? `<p class="prog-res-avisos">${comAviso} ${comAviso === 1 ? 'EPI tem aviso' : 'EPIs têm aviso'} (estoque ou C.A.). Dá para programar mesmo assim.</p>` : ''}`
        : '<p class="prog-res-vazio">Nenhum EPI na lista ainda.</p>'}`;
    const conta = $('progConta');
    if (conta) conta.textContent = `${fmt(total)} ${total === 1 ? 'item' : 'itens'}`;
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
    if (!itens.length) return setMsg('Adicione pelo menos um EPI.', true);
    const botao = $('progConcluir');
    botao.disabled = true;
    setMsg('Salvando…');
    const { error } = await db().rpc('epi_programar_entrega', {
      p_colaborador: colab.id, p_data: $('progData').value || hoje(), p_observacao: $('progObs').value, p_itens: itens
    });
    botao.disabled = false;
    if (error) return setMsg('Não foi possível programar: ' + error.message, true);
    limpar();
    setMsg(`Entrega de ${colab.nome} programada e enviada para a fila do celular.`);
  }

  function abrir() {
    if (!isAdmin()) return;
    $('dlProgColab').innerHTML = colaboradores().map((c) => `<option value="${esc(c.nome)}">`).join('');
    $('dlProgEpi').innerHTML = epis().map((e) => `<option value="${esc(e.nome)}">`).join('');
    saldos.clear();
    if (!$('progItens').children.length) limpar();
    else $('progItens').querySelectorAll('.prog-item').forEach((l) => { l.dataset.epi = '__'; escolherEpi(l); });
  }

  function start() {
    if (!$('progItens')) return;
    $('progData').value = hoje();
    document.querySelector('.nav [data-page="programar"]')?.addEventListener('click', abrir);
    $('progColab').addEventListener('input', mostrarColab);
    $('progData').addEventListener('change', resumo);
    $('progAdd').addEventListener('click', () => novaLinha().querySelector('input').focus());
    $('progLimpar').addEventListener('click', () => { limpar(); setMsg(''); });
    $('progConcluir').addEventListener('click', concluir);
    $('progItens').addEventListener('input', (e) => {
      const linha = e.target.closest('.prog-item');
      if (!linha) return;
      if (e.target.dataset.campo === 'epi') escolherEpi(linha);
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
        return avisar(linha);
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
