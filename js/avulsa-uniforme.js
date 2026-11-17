(() => {
  'use strict';
  // Entrega avulsa: botão "Uniforme". Ligado, os campos EPI / C.A. / Tamanho
  // dão lugar a Item (peça), Sala e Tamanho das salas de uniforme
  // (deposito_itens), com o saldo ao lado. Só salva com os três escolhidos e
  // quantidade dentro do saldo. A movimentação é gravada sem EPI (epi_id nulo)
  // e com deposito_item_id; o banco tira a peça da sala na mesma hora
  // (gatilho em movimentacoes_epi, supabase/entregas-uniformes-avulsa.sql).
  if (window.__EPI_AVULSA_UNIFORME__) return;
  window.__EPI_AVULSA_UNIFORME__ = true;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const fmt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const ORDEM = ['PP', 'P', 'M', 'G', 'GG', 'EXG', 'EXGG', 'EXGGG'];
  const pesoTam = (t) => { const s = String(t || '').trim().toUpperCase(); const n = parseFloat(s); if (!Number.isNaN(n)) return n; const i = ORDEM.indexOf(s.split(' ')[0]); return i < 0 ? 999 : 1000 + i; };
  const salaCurta = (nome) => String(nome || '').replace(/^sala de uniformes?\s*[–-]?\s*/i, '') || nome;

  let ligado = false;
  let uni = { salas: [], itens: [] };

  async function carregar() {
    const cli = db();
    if (!cli) return;
    const [d, i] = await Promise.all([
      cli.from('depositos').select('id,nome,ativo').order('nome'),
      cli.from('deposito_itens').select('id,deposito_id,peca,tamanho,quantidade,ca')
    ]);
    uni = { salas: (d.data || []).filter((s) => s.ativo !== false), itens: i.data || [] };
    $('dlAvUniPeca').innerHTML = [...new Set(uni.itens.map((x) => x.peca))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((p) => `<option value="${esc(p)}">`).join('');
    if (ligado) { escolherPeca(true); }
  }

  function montar() {
    const form = $('saidaForm');
    if (!form || $('avUniBtn')) return;
    const grade = form.querySelector('.form-grid');
    // Botão no topo do formulário
    const barra = document.createElement('div');
    barra.className = 'av-uni-barra';
    barra.innerHTML = '<button type="button" id="avUniBtn" class="prog-uni-btn" aria-pressed="false" title="Entregar uniforme das salas (Novos / Usados) em vez de EPI"><i data-lucide="shirt" aria-hidden="true"></i>Uniforme</button>';
    grade.before(barra);
    // Campos do uniforme (escondidos até ligar)
    const campos = [
      ['avUniPeca', '<label for="avUniPeca">Item</label><input id="avUniPeca" list="dlAvUniPeca" placeholder="Digite o item" autocomplete="off"><datalist id="dlAvUniPeca"></datalist>'],
      ['avUniSala', '<label for="avUniSala">Sala</label><select id="avUniSala" disabled><option value="">—</option></select>'],
      ['avUniTam', '<label for="avUniTam">Tamanho <span class="av-uni-saldo" id="avUniSaldo"></span></label><select id="avUniTam" disabled><option value="">—</option></select>']
    ];
    const ancora = $('nEpi').closest('.field');
    campos.reverse().forEach(([id, html]) => {
      const f = document.createElement('div');
      f.className = 'field av-uni-campo';
      f.hidden = true;
      f.innerHTML = html;
      ancora.after(f);
    });
    $('avUniBtn').addEventListener('click', () => ligar(!ligado));
    $('avUniPeca').addEventListener('input', () => escolherPeca());
    $('avUniSala').addEventListener('change', () => escolherSala());
    $('avUniTam').addEventListener('change', mostrarSaldo);
    $('nQtd').addEventListener('input', () => { if (ligado) mostrarSaldo(); });
    form.addEventListener('reset', () => setTimeout(() => { if (ligado) { $('avUniPeca').value = ''; escolherPeca(true); } }, 0));
    // Salvar em modo uniforme: passa antes do salvar do EPI (app.js).
    form.addEventListener('submit', salvar, true);
    icons();
  }

  function ligar(on) {
    ligado = on;
    const b = $('avUniBtn');
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-on', on);
    // EPI, C.A. e Tamanho do EPI saem; Item, Sala e Tamanho da sala entram.
    ['nEpi', 'nCA', 'nTam'].forEach((id) => { const f = $(id).closest('.field'); f.hidden = on; });
    $('nEpi').required = !on;
    document.querySelectorAll('.av-uni-campo').forEach((f) => { f.hidden = !on; });
    $('saidaMsg').textContent = '';
    if (on) carregar(); else { $('avUniPeca').value = ''; escolherPeca(true); }
  }

  function escolherPeca(forcar) {
    const nome = $('avUniPeca').value;
    const peca = uni.itens.find((x) => norm(x.peca) === norm(nome))?.peca || null;
    const sel = $('avUniSala');
    const antes = sel.value;
    const salas = peca ? uni.salas.filter((s) => uni.itens.some((x) => x.deposito_id === s.id && x.peca === peca)) : [];
    sel.innerHTML = salas.length
      ? '<option value="">Escolher</option>' + salas.map((s) => { const t = uni.itens.filter((x) => x.deposito_id === s.id && x.peca === peca).reduce((a, x) => a + x.quantidade, 0); return `<option value="${esc(s.id)}">${esc(salaCurta(s.nome))} (${fmt(t)})</option>`; }).join('')
      : '<option value="">—</option>';
    sel.disabled = !salas.length;
    sel.dataset.peca = peca || '';
    if (salas.some((s) => s.id === antes)) sel.value = antes;
    else if (salas.length === 1) sel.value = salas[0].id;
    escolherSala();
  }

  function escolherSala() {
    const sel = $('avUniTam'), peca = $('avUniSala').dataset.peca, sala = $('avUniSala').value;
    const antes = sel.value;
    const tams = peca && sala ? uni.itens.filter((x) => x.deposito_id === sala && x.peca === peca)
      .sort((a, b) => pesoTam(a.tamanho) - pesoTam(b.tamanho) || a.tamanho.localeCompare(b.tamanho, 'pt-BR', { numeric: true })) : [];
    sel.innerHTML = tams.length
      ? '<option value="">Escolher</option>' + tams.map((x) => `<option value="${esc(x.id)}"${x.quantidade <= 0 ? ' disabled' : ''}>${esc(x.tamanho || 'Único')} · ${fmt(x.quantidade)}</option>`).join('')
      : '<option value="">—</option>';
    sel.disabled = !tams.length;
    if (tams.some((x) => x.id === antes && x.quantidade > 0)) sel.value = antes;
    else if (tams.length === 1 && tams[0].quantidade > 0) sel.value = tams[0].id;
    mostrarSaldo();
  }

  function mostrarSaldo() {
    const it = uni.itens.find((x) => x.id === $('avUniTam').value);
    const el = $('avUniSaldo');
    const q = Number($('nQtd').value) || 0;
    el.textContent = it ? `· estoque ${fmt(it.quantidade)}` : '';
    el.classList.toggle('is-ruim', !!it && q > it.quantidade);
  }

  async function salvar(e) {
    if (!ligado) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    let admin = false; try { admin = currentIsAdmin === true; } catch (_) {}
    if (!admin) return;
    const msg = $('saidaMsg');
    const erro = (t) => { msg.textContent = t; msg.classList.add('is-error'); };
    msg.textContent = ''; msg.classList.remove('is-error');
    const peca = $('avUniSala').dataset.peca;
    const it = uni.itens.find((x) => x.id === $('avUniTam').value);
    const qtd = Number($('nQtd').value), resp = $('nResp').value.trim(), colNome = $('nColab').value.trim();
    if (!$('avUniPeca').value.trim()) return erro('Escolha o item de uniforme.');
    if (!peca) return erro('Esse item não está em nenhuma sala. Escolha um da lista.');
    if (!$('avUniSala').value) return erro('Escolha a sala.');
    if (!it) return erro('Escolha o tamanho.');
    if (!Number.isInteger(qtd) || qtd < 1) return erro('Confira a quantidade.');
    if (qtd > it.quantidade) return erro(`Só tem ${fmt(it.quantidade)} de ${it.peca} tam. ${it.tamanho || 'único'} nessa sala.`);
    if (!resp) return erro('Informe o responsável.');
    if (!navigator.onLine) return erro('Sem internet: uniforme precisa de internet para tirar da sala na hora.');
    // Mesmas regras do EPI: colaborador cadastrado, termo assinado e facial ou assinatura.
    let col = null;
    if (colNome && colNome !== 'Bolsa Reserva') {
      col = findCollaborator(colNome);
      if (!col) return erro(`"${colNome}" não é um colaborador cadastrado. Cadastre o colaborador e colete o termo antes da entrega.`);
      if (!window.EPI_TERMO?.temAssinatura?.(col.id)) return erro(`${col.nome} ainda não assinou o termo de autorização. Peça para assinar no celular (botão Termo) antes da entrega.`);
      const validou = validacaoEntrega.colaboradorId === col.id && Boolean(validacaoEntrega.facial?.ok || validacaoEntrega.selfie || validacaoEntrega.assinatura);
      if (!validou) return erro('Faça a facial ou a assinatura do colaborador antes de salvar.');
    }
    const payload = {
      id: crypto.randomUUID(),
      data: $('nData').value,
      colaborador_id: col?.id || null,
      colaborador_nome_informado: colNome || null,
      epi_id: null,
      epi_nome_original: it.peca,
      quantidade: qtd,
      ca: it.ca || 'N/A',
      tamanho: it.tamanho || 'N/A',
      responsavel: resp,
      observacao: $('nObs').value.trim() || null,
      origem: 'Site Gestão EPI',
      contabiliza_estoque: false,
      deposito_item_id: it.id
    };
    try {
      setBusy(true);
      if (validacaoEntrega.colaboradorId && validacaoEntrega.colaboradorId !== payload.colaborador_id) limparValidacao();
      aplicarFacial(payload, validacaoEntrega.facial);
      await enviarValidacao(payload, validacaoEntrega);
      const { error } = await db().from('movimentacoes_epi').insert(payload);
      if (error) throw error;
      const sala = uni.salas.find((s) => s.id === it.deposito_id);
      $('saidaForm').reset();
      $('nQtd').value = 1; $('nResp').value = 'Jeferson'; $('nData').value = todayLocal();
      msg.textContent = `Entrega salva: ${fmt(qtd)} × ${it.peca} tam. ${it.tamanho || 'único'} (saiu da ${sala ? sala.nome : 'sala'}).`;
      await carregar();
      await loadAll(false);
    } catch (err) {
      console.error(err);
      erro(`Erro: ${err.message || err}`);
    } finally { setBusy(false); }
  }

  function start() { montar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
