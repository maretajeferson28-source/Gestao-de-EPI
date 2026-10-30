(() => {
  'use strict';

  // Fila de entregas (celular): as programações feitas no PC (js/programar.js)
  // aparecem aqui. Para entregar: abre o cartão, faz a facial e a assinatura e
  // confirma. Só então as saídas são gravadas e o estoque baixa
  // (epi_confirmar_entrega). O número de pendentes aparece na aba da barra.
  if (window.__EPI_FILA__) return;
  window.__EPI_FILA__ = true;

  const $ = (id) => document.getElementById(id);
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const isAdmin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  const colabs = () => { try { return Array.isArray(collaborators) ? collaborators : []; } catch (_) { return []; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
  const hoje = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const dataBR = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const codigo = (ca) => (ca ? (/^CI-/i.test(ca) ? ca : 'C.A. ' + ca) : 'Sem C.A.');

  let fila = [];
  let aberta = null; // programação em entrega
  const validacao = { facial: null, assinatura: null };

  // ---- Contador na aba ----
  function marcarBadge(n) {
    document.querySelectorAll('[data-fila-badge]').forEach((b) => { b.textContent = n > 99 ? '99+' : String(n); b.hidden = !n; });
  }
  async function contar() {
    if (!isAdmin() || !db() || !navigator.onLine) return;
    const { count, error } = await db().from('entregas_programadas').select('id', { count: 'exact', head: true }).eq('status', 'programada');
    if (!error) marcarBadge(count || 0);
  }

  // ---- Lista ----
  async function carregar() {
    const box = $('filaLista');
    if (!box || !isAdmin()) return;
    if (!navigator.onLine) { box.innerHTML = '<p class="fila-vazio">Sem internet. A fila aparece quando voltar o sinal.</p>'; return; }
    box.innerHTML = '<p class="fila-vazio">Carregando…</p>';
    const { data, error } = await db().from('entregas_programadas')
      .select('id,colaborador_id,data_prevista,observacao,created_at,colaboradores(nome),entregas_programadas_itens(id,ordem,quantidade,tamanho,ca,epi_id,epis(nome),epi_variantes(apelido))')
      .eq('status', 'programada')
      .order('data_prevista', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) { box.innerHTML = `<p class="fila-vazio">Não foi possível carregar a fila: ${esc(error.message)}</p>`; return; }
    fila = data || [];
    marcarBadge(fila.length);
    if (!fila.length) { box.innerHTML = '<div class="fila-vazio-grande"><i data-lucide="party-popper"></i><strong>Nenhuma entrega na fila</strong><span>As entregas programadas no PC aparecem aqui.</span></div>'; icons(); return; }
    box.innerHTML = fila.map((p) => {
      const itens = [...(p.entregas_programadas_itens || [])].sort((a, b) => a.ordem - b.ordem);
      const total = itens.reduce((a, i) => a + Number(i.quantidade || 0), 0);
      const atrasada = String(p.data_prevista) < hoje();
      const ehHoje = String(p.data_prevista) === hoje();
      return `<article class="fila-card">
        <header>
          <strong>${esc(p.colaboradores?.nome || 'Colaborador')}</strong>
          <span class="fila-data${atrasada ? ' is-atrasada' : ehHoje ? ' is-hoje' : ''}">${atrasada ? 'Atrasada · ' : ehHoje ? 'Hoje · ' : ''}${dataBR(p.data_prevista)}</span>
        </header>
        <ul>${itens.map((i) => `<li><b>${fmt(i.quantidade)}×</b><span>${esc(i.epis?.nome || 'EPI')}<small>${esc([i.epi_variantes?.apelido, codigo(i.ca), i.tamanho ? 'Tam. ' + i.tamanho : ''].filter(Boolean).join(' · '))}</small></span></li>`).join('')}</ul>
        ${p.observacao ? `<p class="fila-obs"><i data-lucide="message-square"></i>${esc(p.observacao)}</p>` : ''}
        <footer>
          <button class="btn compact fila-cancelar" type="button" data-cancelar="${esc(p.id)}">Cancelar</button>
          <button class="btn primary compact" type="button" data-entregar="${esc(p.id)}"><i data-lucide="package-check"></i>Entregar ${fmt(total)} ${total === 1 ? 'item' : 'itens'}</button>
        </footer>
      </article>`;
    }).join('');
    icons();
  }

  async function cancelar(id) {
    if (!confirm('Cancelar esta entrega? Ela sai da fila.')) return;
    const { error } = await db().from('entregas_programadas')
      .update({ status: 'cancelada', cancelada_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'programada');
    if (error) return alert('Não foi possível cancelar: ' + error.message);
    carregar();
  }

  // ---- Tela de entrega ----
  function telaMsg(texto, erro = false) { const el = $('filaTelaMsg'); el.textContent = texto; el.classList.toggle('is-error', erro); }

  function marcarValidacao() {
    const f = $('filaFacial'), a = $('filaAssinatura');
    f.classList.toggle('is-ok', !!validacao.facial?.ok);
    a.classList.toggle('is-ok', !!validacao.assinatura);
    f.innerHTML = `<i data-lucide="${validacao.facial?.ok ? 'check' : 'scan-face'}"></i>${validacao.facial?.ok ? 'Facial ok' : 'Facial'}`;
    a.innerHTML = `<i data-lucide="${validacao.assinatura ? 'check' : 'signature'}"></i>${validacao.assinatura ? 'Assinado' : 'Assinatura'}`;
    $('filaConfirmar').disabled = !(validacao.facial?.ok && validacao.assinatura);
    icons();
  }

  function abrirEntrega(id) {
    aberta = fila.find((p) => p.id === id);
    if (!aberta) return;
    validacao.facial = null; validacao.assinatura = null;
    const col = colabs().find((c) => c.id === aberta.colaborador_id);
    const temTermo = window.EPI_TERMO?.temAssinatura?.(aberta.colaborador_id);
    const itens = [...(aberta.entregas_programadas_itens || [])].sort((a, b) => a.ordem - b.ordem);
    $('filaTelaNome').textContent = aberta.colaboradores?.nome || col?.nome || 'Colaborador';
    $('filaTelaData').textContent = 'Programada para ' + dataBR(aberta.data_prevista);
    $('filaTelaTermo').innerHTML = temTermo ? '<i data-lucide="shield-check"></i>Termo assinado'
      : '<i data-lucide="triangle-alert"></i>Sem termo assinado: colete o termo (aba Termo) antes de entregar';
    $('filaTelaTermo').className = 'fila-termo ' + (temTermo ? 'is-ok' : 'is-ruim');
    $('filaTelaItens').innerHTML = itens.map((i) => `
      <li data-item="${esc(i.id)}">
        <span class="fila-item-nome">${esc(i.epis?.nome || 'EPI')}<small>${esc([i.epi_variantes?.apelido, codigo(i.ca), i.tamanho ? 'Tam. ' + i.tamanho : ''].filter(Boolean).join(' · '))}</small></span>
        <span class="fila-qtd"><button type="button" data-passo="-1" aria-label="Diminuir"><i data-lucide="minus"></i></button><input type="number" min="0" step="1" inputmode="numeric" value="${esc(i.quantidade)}" aria-label="Quantidade"><button type="button" data-passo="1" aria-label="Aumentar"><i data-lucide="plus"></i></button></span>
      </li>`).join('');
    $('filaTelaObs').textContent = aberta.observacao || '';
    $('filaTelaObs').hidden = !aberta.observacao;
    $('filaFacial').disabled = $('filaAssinatura').disabled = !temTermo;
    telaMsg(temTermo ? 'Faça a facial e a assinatura do colaborador para confirmar.' : '', false);
    marcarValidacao();
    $('filaTela').hidden = false;
    document.body.classList.add('fila-tela-aberta');
    if (navigator.onLine) window.EPI_FACE?.preparar?.();
  }

  function fecharEntrega() {
    $('filaTela').hidden = true;
    document.body.classList.remove('fila-tela-aberta');
    aberta = null;
  }

  async function validar(tipo) {
    const col = colabs().find((c) => c.id === aberta?.colaborador_id);
    if (!col) return telaMsg('Colaborador não encontrado no cadastro.', true);
    const blob = tipo === 'face' ? await window.EPI_TERMO_CAPTURA?.face(col) : await window.EPI_TERMO_CAPTURA?.assinatura(col);
    if (!blob) return;
    if (tipo === 'assinatura') { validacao.assinatura = blob; telaMsg('Assinatura registrada.'); return marcarValidacao(); }
    telaMsg('Comparando com a foto do termo…');
    const r = await window.EPI_FACE?.comparar(col.id, blob);
    const pct = r?.semelhanca != null ? Math.round(r.semelhanca * 100) : null;
    if (r?.ok) { validacao.facial = { ok: true, semelhanca: r.semelhanca, termoId: r.termoId }; telaMsg(`Rosto confere com o termo (${pct}%).`); }
    else { validacao.facial = null; telaMsg(r?.erro || (pct == null ? 'Não foi possível comparar agora. Tente de novo.' : `Rosto não confere com o termo (${pct}%). Tente com mais luz e o rosto centralizado.`), true); }
    marcarValidacao();
  }

  async function confirmar() {
    if (!aberta || !(validacao.facial?.ok && validacao.assinatura)) return;
    if (!navigator.onLine) return telaMsg('Sem internet: a entrega da fila precisa de sinal para confirmar.', true);
    const itens = [...$('filaTelaItens').querySelectorAll('[data-item]')].map((li) => ({ id: li.dataset.item, quantidade: Number(li.querySelector('input').value) || 0 }));
    if (!itens.some((i) => i.quantidade > 0)) return telaMsg('Nenhum item com quantidade para entregar.', true);
    const botao = $('filaConfirmar');
    botao.disabled = true;
    telaMsg('Salvando a entrega…');
    try {
      const path = `entregas/${aberta.colaborador_id}/${aberta.id}-assinatura.png`;
      const up = await db().storage.from('termos-epi').upload(path, validacao.assinatura, { contentType: 'image/png', upsert: true });
      if (up.error) throw up.error;
      const responsavel = (document.getElementById('sideUserName')?.textContent || '').trim();
      const { error } = await db().rpc('epi_confirmar_entrega', {
        p_programacao: aberta.id, p_itens: itens, p_responsavel: responsavel && responsavel !== 'Usuário' ? responsavel : '',
        p_validacao: { assinatura_path: path, facial_ok: true, semelhanca: validacao.facial.semelhanca ?? null, termo_id: validacao.facial.termoId || null }
      });
      if (error) throw error;
      const nome = aberta.colaboradores?.nome || 'colaborador';
      fecharEntrega();
      try { if (typeof loadAll === 'function') await loadAll(false); } catch (_) { /* recarrega na próxima abertura */ }
      await carregar();
      const aviso = $('filaAviso');
      aviso.textContent = `Entrega de ${nome} confirmada e baixada do estoque.`;
      aviso.hidden = false;
      setTimeout(() => { aviso.hidden = true; }, 6000);
    } catch (err) {
      telaMsg('Não foi possível confirmar: ' + (err.message || err), true);
      botao.disabled = false;
    }
  }

  function start() {
    if (!$('filaLista')) return;
    document.querySelector('.nav [data-page="fila"]')?.addEventListener('click', carregar);
    $('filaLista').addEventListener('click', (e) => {
      const ent = e.target.closest('[data-entregar]'); if (ent) return abrirEntrega(ent.dataset.entregar);
      const can = e.target.closest('[data-cancelar]'); if (can) cancelar(can.dataset.cancelar);
    });
    $('filaTelaFechar').addEventListener('click', fecharEntrega);
    $('filaFacial').addEventListener('click', () => validar('face'));
    $('filaAssinatura').addEventListener('click', () => validar('assinatura'));
    $('filaConfirmar').addEventListener('click', confirmar);
    $('filaTelaItens').addEventListener('click', (e) => {
      const b = e.target.closest('[data-passo]');
      if (!b) return;
      const inp = b.parentElement.querySelector('input');
      inp.value = String(Math.max(0, (Number(inp.value) || 0) + Number(b.dataset.passo)));
    });
    // Contador: ao carregar os dados do app, ao voltar o sinal e a cada 1 minuto.
    window.addEventListener('epi:data-loaded', contar);
    window.addEventListener('online', contar);
    setInterval(contar, 60000);
    contar();
  }

  window.EPI_FILA = { carregar, contar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
