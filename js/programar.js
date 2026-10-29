(() => {
  'use strict';

  // Programar entrega (PC): colaborador + EPIs com C.A., quantidade e tamanho.
  // Ao concluir, a programação vai para a fila do celular (status 'programada'),
  // onde a entrega é confirmada com facial e assinatura. Nada baixa do estoque aqui.
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

  // ---- Linhas de EPI ----
  let seq = 0;
  function novaLinha() {
    const id = ++seq;
    const div = document.createElement('div');
    div.className = 'prog-item';
    div.dataset.linha = id;
    div.innerHTML = `
      <div class="field prog-epi"><label>EPI*</label><input data-campo="epi" list="dlProgEpi" placeholder="Digite para buscar" autocomplete="off"></div>
      <div class="field prog-ca"><label>C.A.</label><select data-campo="ca" disabled><option value="">Escolha o EPI</option></select></div>
      <div class="field prog-qtd"><label>Qtd*</label><input data-campo="qtd" type="number" min="1" step="1" value="1" inputmode="numeric"></div>
      <div class="field prog-tam"><label>Tamanho</label><input data-campo="tam" list="dlProgTam${id}" placeholder="Se houver" autocomplete="off"><datalist id="dlProgTam${id}"></datalist></div>
      <button class="btn compact prog-remover" type="button" data-remover title="Tirar este EPI" aria-label="Tirar este EPI"><i data-lucide="x"></i></button>
      <p class="prog-aviso" data-aviso></p>`;
    $('progItens').appendChild(div);
    icons();
    return div;
  }

  async function preencherCas(linha) {
    const epi = acharEpi(linha.querySelector('[data-campo="epi"]').value);
    const sel = linha.querySelector('[data-campo="ca"]');
    const dlTam = linha.querySelector('datalist');
    linha.dataset.epi = epi?.id || '';
    if (!epi) {
      sel.innerHTML = '<option value="">Escolha o EPI</option>';
      sel.disabled = true;
      dlTam.innerHTML = '';
      return avisar(linha);
    }
    const vars = variantes(epi.id);
    const mapa = await saldoDoEpi(epi.id);
    sel.innerHTML = `<option value="">Sem C.A.</option>` + vars.map((v) => {
      const s = mapa.get(normCa(v.ca)) || 0;
      const nome = (/^CI-/i.test(v.ca) ? v.ca : 'C.A. ' + v.ca) + (v.apelido ? ' · ' + v.apelido : '');
      return `<option value="${esc(v.id)}">${esc(nome)} — ${fmt(s)} em estoque</option>`;
    }).join('');
    sel.disabled = false;
    if (vars.length === 1) sel.value = vars[0].id;
    // Tamanhos já usados nesse EPI viram sugestão.
    const tams = [...new Set(lista('movements').filter((m) => m.epi_id === epi.id).map((m) => String(m.tamanho || '').trim()).filter((t) => t && t !== 'N/A'))];
    dlTam.innerHTML = tams.map((t) => `<option value="${esc(t)}">`).join('');
    avisar(linha);
  }

  function avisar(linha) {
    const el = linha.querySelector('[data-aviso]');
    const epiId = linha.dataset.epi;
    const nomeEpi = linha.querySelector('[data-campo="epi"]').value.trim();
    const avisos = [];
    if (nomeEpi && !epiId) avisos.push('EPI não cadastrado. Escolha um da lista.');
    const varId = linha.querySelector('[data-campo="ca"]').value;
    const qtd = Number(linha.querySelector('[data-campo="qtd"]').value) || 0;
    if (epiId && varId) {
      const v = lista('epiVariants').find((x) => x.id === varId);
      const s = saldos.get(epiId)?.get(normCa(v?.ca)) || 0;
      if (qtd > s) avisos.push(s > 0 ? `Só tem ${fmt(s)} em estoque deste C.A.` : 'Este C.A. está sem estoque.');
      if (v?.data_validade && String(v.data_validade).slice(0, 10) < hoje()) avisos.push(`C.A. vencido em ${dataBR(v.data_validade)}.`);
    }
    if (epiId && !varId && variantes(epiId).length) avisos.push('Escolha o C.A. que vai ser entregue.');
    el.textContent = avisos.join(' ');
    el.hidden = !avisos.length;
  }

  function mostrarTermo() {
    const el = $('progTermo');
    const nome = $('progColab').value.trim();
    const c = acharColab(nome);
    if (!nome) { el.textContent = ''; el.className = 'prog-termo'; return; }
    if (!c) { el.textContent = 'Colaborador não cadastrado.'; el.className = 'prog-termo is-ruim'; return; }
    const ok = window.EPI_TERMO?.temAssinatura?.(c.id);
    el.textContent = ok ? 'Termo assinado.' : 'Sem termo assinado: no celular, a entrega só libera depois do termo.';
    el.className = 'prog-termo ' + (ok ? 'is-ok' : 'is-ruim');
  }

  function limpar() {
    $('progColab').value = '';
    $('progData').value = hoje();
    $('progObs').value = '';
    $('progItens').innerHTML = '';
    novaLinha();
    mostrarTermo();
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
        variante_id: linha.querySelector('[data-campo="ca"]').value || null,
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
    setMsg(`Entrega de ${colab.nome} programada e enviada para a fila do celular.`);
    limpar();
    carregarFila();
  }

  // ---- Fila (programações ainda não entregues) ----
  async function carregarFila() {
    const box = $('progFila');
    const { data, error } = await db().from('entregas_programadas')
      .select('id,data_prevista,observacao,created_at,colaboradores(nome),entregas_programadas_itens(ordem,quantidade,tamanho,ca,epis(nome),epi_variantes(apelido))')
      .eq('status', 'programada')
      .order('data_prevista', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) { box.innerHTML = `<p class="prog-vazio">Não foi possível carregar a fila: ${esc(error.message)}</p>`; return; }
    $('progFilaQtd').textContent = data.length ? `(${data.length})` : '';
    if (!data.length) { box.innerHTML = '<p class="prog-vazio">Nenhuma entrega na fila.</p>'; return; }
    box.innerHTML = data.map((p) => {
      const itens = (p.entregas_programadas_itens || []).sort((a, b) => a.ordem - b.ordem).map((i) => `
        <li><strong>${fmt(i.quantidade)} × ${esc(i.epis?.nome || 'EPI')}</strong>
          <span>${i.ca ? 'C.A. ' + esc(i.ca) : 'Sem C.A.'}${i.epi_variantes?.apelido ? ' · ' + esc(i.epi_variantes.apelido) : ''}${i.tamanho ? ' · Tam. ' + esc(i.tamanho) : ''}</span></li>`).join('');
      const atrasada = String(p.data_prevista) < hoje();
      return `<article class="prog-card">
        <header><strong>${esc(p.colaboradores?.nome || 'Colaborador')}</strong>
          <span class="prog-data${atrasada ? ' is-atrasada' : ''}">${atrasada ? 'Era para ' : ''}${dataBR(p.data_prevista)}</span></header>
        <ul>${itens}</ul>
        ${p.observacao ? `<p class="prog-obs">${esc(p.observacao)}</p>` : ''}
        <button class="btn compact prog-cancelar" type="button" data-cancelar="${esc(p.id)}"><i data-lucide="x-circle"></i>Cancelar</button>
      </article>`;
    }).join('');
    icons();
  }

  async function cancelar(id) {
    if (!confirm('Cancelar esta programação? Ela sai da fila do celular.')) return;
    const { error } = await db().from('entregas_programadas')
      .update({ status: 'cancelada', cancelada_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'programada');
    if (error) return setMsg('Não foi possível cancelar: ' + error.message, true);
    setMsg('Programação cancelada.');
    carregarFila();
  }

  function abrir() {
    if (!isAdmin()) return;
    $('dlProgColab').innerHTML = colaboradores().map((c) => `<option value="${esc(c.nome)}">`).join('');
    $('dlProgEpi').innerHTML = epis().map((e) => `<option value="${esc(e.nome)}">`).join('');
    saldos.clear();
    if (!$('progItens').children.length) limpar();
    else $('progItens').querySelectorAll('.prog-item').forEach(preencherCas);
    carregarFila();
  }

  function start() {
    if (!$('progItens')) return;
    $('progData').value = hoje();
    document.querySelector('.nav [data-page="programar"]')?.addEventListener('click', abrir);
    $('progColab').addEventListener('input', mostrarTermo);
    $('progAdd').addEventListener('click', () => novaLinha().querySelector('input').focus());
    $('progLimpar').addEventListener('click', () => { limpar(); setMsg(''); });
    $('progConcluir').addEventListener('click', concluir);
    $('progItens').addEventListener('input', (e) => {
      const linha = e.target.closest('.prog-item');
      if (!linha) return;
      if (e.target.dataset.campo === 'epi') preencherCas(linha);
      else avisar(linha);
    });
    $('progItens').addEventListener('change', (e) => { const l = e.target.closest('.prog-item'); if (l) avisar(l); });
    $('progItens').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remover]');
      if (!b) return;
      b.closest('.prog-item').remove();
      if (!$('progItens').children.length) novaLinha();
    });
    $('progFila').addEventListener('click', (e) => { const b = e.target.closest('[data-cancelar]'); if (b) cancelar(b.dataset.cancelar); });
  }

  window.EPI_PROGRAMAR = { abrir, carregarFila };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
