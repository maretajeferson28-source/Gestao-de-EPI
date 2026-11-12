// Colaboradores (PC): card de detalhes do colaborador (coluna da direita).
// Só lê os dados já carregados pelo app.js e chama as funções que já existem:
// openColabEdit, toggleColabActive (app.js), EPI_TERMO, EPI_OS_FOLHA e
// EPI_HISTORICO. Não grava nada por conta própria.
(function () {
  if (window.__EPI_COLAB_PAINEL__) return;
  window.__EPI_COLAB_PAINEL__ = true;

  const $ = (id) => document.getElementById(id);
  const db = () => { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } };
  const isAdmin = () => { try { return currentIsAdmin === true; } catch (_) { return false; } };
  const LISTAS = { collaborators: () => collaborators, movements: () => movements, epiCatalog: () => epiCatalog };
  const lista = (nome) => { try { const v = LISTAS[nome](); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
  const dataBR = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };
  // Datas das movimentações vêm em dd/mm/aaaa; para ordenar, vira aaaa-mm-dd.
  const isoDeBR = (br) => { const t = String(br || ''); if (/^\d{4}-/.test(t)) return t.slice(0, 10); const [d, m, y] = t.split('/'); return y ? `${y}-${m}-${d}` : ''; };
  const brDe = (v) => { const t = String(v || ''); return /^\d{4}-/.test(t) ? dataBR(t) : t; };
  const icons = () => window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  const iniciais = (nome) => {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toLocaleUpperCase('pt-BR') || 'C';
  };

  // ---- O.S. (carregada uma vez, como no Programar) ----
  let ordens = null;
  async function carregarOrdens() {
    if (ordens || !db()) return ordens;
    const { data, error } = await db().from('ordens_servico').select('*').eq('ativo', true);
    if (error) { console.error('[colab-painel OS]', error); ordens = new Map(); return ordens; }
    ordens = new Map((data || []).map((o) => [o.id, o]));
    return ordens;
  }
  const osDe = (c) => (c?.os_id && ordens ? ordens.get(c.os_id) || null : null);

  // Colaborador mostrado no card. A tabela (próxima etapa) vai trocar com
  // window.EPI_COLAB_PAINEL.mostrar(id); até lá, mostra o primeiro ativo.
  let atualId = null;
  let fechado = false;
  const atual = () => {
    const todos = lista('collaborators');
    // Sem escolha ainda: o primeiro da lista (mesma ordem da tabela).
    return todos.find((c) => c.id === atualId) || linhasFiltradas()[0] || null;
  };

  function situacao(c) {
    if (c.ativo === false) return { cls: 'is-off', txt: 'Desativado', ic: 'dot' };
    if (c.afastado === true) return { cls: 'is-alerta', txt: 'Afastado', ic: 'dot' };
    return { cls: 'is-ok', txt: 'Ativo', ic: 'dot' };
  }

  function entregas(c) {
    const ms = lista('movements').filter((m) => m.colaborador_id === c.id);
    if (!ms.length) return { ultima: null, qtdUltima: 0, epis: [] };
    const ord = [...ms].sort((a, b) => isoDeBR(b.data).localeCompare(isoDeBR(a.data)));
    const dia = isoDeBR(ord[0].data);
    const doDia = ord.filter((m) => isoDeBR(m.data) === dia);
    const qtdUltima = doDia.reduce((s, m) => s + (Number(m.quantidade) || 0), 0);
    // EPIs que ele já recebeu (um por EPI), do mais recente para o mais antigo.
    const vistos = new Map();
    for (const m of ord) {
      const k = m.epi_id || m.epi_nome_original;
      if (!k || vistos.has(k)) continue;
      const epi = lista('epiCatalog').find((e) => e.id === m.epi_id);
      vistos.set(k, epi?.nome || m.epi_nome_original || 'EPI');
    }
    return { ultima: brDe(ord[0].data), qtdUltima, epis: [...vistos.values()] };
  }

  const itensTxt = (n) => `${fmt(n)} ${Number(n) === 1 ? 'item' : 'itens'}`;
  function resumoNomes(nomes) {
    const curtos = nomes.map((n) => String(n).split(/\s+/)[0]);
    const unicos = [...new Set(curtos.map((n) => n.toLocaleLowerCase('pt-BR')))];
    if (!unicos.length) return '';
    const primeiros = unicos.slice(0, 4);
    const txt = primeiros.length > 1 ? primeiros.slice(0, -1).join(', ') + (unicos.length > 4 ? ', ' + primeiros[primeiros.length - 1] + ' e outros' : ' e ' + primeiros[primeiros.length - 1]) : primeiros[0];
    return txt.charAt(0).toLocaleUpperCase('pt-BR') + txt.slice(1);
  }

  function linha(acao, icone, titulo, sub, ativo) {
    return `<button type="button" class="colab-det-link" data-det-acao="${acao}"${ativo ? '' : ' disabled'}>
      <span class="colab-det-link-ic"><i data-lucide="${icone}"></i></span>
      <span class="colab-det-link-txt"><span class="colab-det-link-tit">${esc(titulo)}</span><span class="colab-det-link-sub">${esc(sub)}</span></span>
      <i data-lucide="chevron-right" class="colab-det-link-chev"></i></button>`;
  }

  function render() {
    const box = $('colabDet');
    if (!box) return;
    const c = atual();
    box.hidden = fechado || !c;
    $('colabPc')?.classList.toggle('sem-det', fechado || !c);
    if (!c || fechado) { box.innerHTML = ''; marcarSelecao(); return; }
    // (atualId só muda quando alguém clica: até lá o card segue o 1º da lista)
    const s = situacao(c);
    const termo = window.EPI_TERMO?.termoDe?.(c.id) || null;
    const temTermo = !!window.EPI_TERMO?.temTermo?.(c.id);
    const os = osDe(c);
    const ent = entregas(c);
    const funcao = c.funcao || c.cargo || '';
    const admin = isAdmin();

    const selos = [
      `<span class="colab-selo ${s.cls}"><span class="colab-selo-ponto"></span>${s.txt}</span>`,
      termo ? '<span class="colab-selo is-ok"><i data-lucide="check"></i>Termo assinado</span>'
        : '<span class="colab-selo is-alerta"><i data-lucide="clock-3"></i>Termo pendente</span>',
      os ? '<span class="colab-selo is-ok"><i data-lucide="check"></i>O.S. vigente</span>'
        : '<span class="colab-selo is-neutro"><i data-lucide="minus"></i>Sem O.S.</span>'
    ].join('');

    const osSub = os ? [os.funcao, os.revisao ? `Rev. ${os.revisao}` : '', os.data_os ? `Emitida em ${dataBR(os.data_os)}` : ''].filter(Boolean).join(' • ')
      : 'Nenhuma O.S. ligada à função';
    const termoSub = termo ? `Assinado em ${dataBR(termo.assinado_em)} • Vigente` : 'Ainda não assinou no celular';
    const episSub = ent.epis.length ? `${itensTxt(ent.epis.length)} • ${resumoNomes(ent.epis)}` : 'Nenhum EPI recebido ainda';
    const ultSub = ent.ultima ? `${ent.ultima} • ${itensTxt(ent.qtdUltima)} ${ent.qtdUltima === 1 ? 'entregue' : 'entregues'}` : 'Nenhuma entrega registrada';

    box.innerHTML = `
      <svg class="colab-det-arco" viewBox="0 0 240 110" aria-hidden="true"><defs><linearGradient id="colabDetArco" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FF6600" stop-opacity="0"/><stop offset="55%" stop-color="#FF6600" stop-opacity=".32"/><stop offset="100%" stop-color="#FF9A35" stop-opacity=".55"/></linearGradient></defs><path d="M 0 103 C 75 93, 125 48, 240 24" fill="none" stroke="url(#colabDetArco)" stroke-width="1.2"/></svg>
      <div class="colab-det-cab">
        <div class="colab-det-avatar" data-avatar="${esc(c.id)}" aria-hidden="true">${esc(iniciais(c.nome))}</div>
        <div class="colab-det-id">
          <h3 class="colab-det-nome" title="${esc(c.nome)}">${esc(c.nome)}</h3>
          ${funcao ? `<span class="colab-det-funcao">${esc(funcao)}</span>` : ''}
          ${c.setor ? `<span class="colab-det-setor">Setor: ${esc(c.setor)}</span>` : ''}
        </div>
      </div>
      <div class="colab-det-selos">${selos}</div>
      <div class="colab-det-contato">
        <span class="colab-det-contato-item" title="Matrícula"><i data-lucide="id-card"></i>${c.matricula ? `Mat. ${esc(c.matricula)}` : 'Sem matrícula'}</span>
        <span class="colab-det-contato-div" aria-hidden="true"></span>
        <span class="colab-det-contato-item" title="Data de admissão"><i data-lucide="calendar-days"></i>${c.data_admissao ? `Admissão ${esc(dataBR(c.data_admissao))}` : 'Sem data de admissão'}</span>
      </div>
      <div class="colab-det-links">
        ${linha('termo', 'file-text', 'Termo de responsabilidade', termoSub, temTermo)}
        ${linha('os', 'clipboard-list', 'Ordem de serviço (O.S.)', osSub, !!os)}
        ${linha('epis', 'shield-check', 'EPIs vinculados', episSub, admin)}
        ${linha('ultima', 'package', 'Última entrega', ultSub, admin)}
      </div>
      ${admin ? `<div class="colab-det-acoes">
        <button type="button" class="colab-det-editar" data-det-acao="editar"><i data-lucide="pencil"></i><span>Editar cadastro</span></button>
        <button type="button" class="colab-det-historico" data-det-acao="historico"><i data-lucide="clock-3"></i><span>Ver histórico</span></button>
        <button type="button" class="colab-det-desativar${c.ativo === false ? ' is-reativar' : ''}" data-det-acao="ativo"><i data-lucide="${c.ativo === false ? 'user-check' : 'user-x'}"></i><span>${c.ativo === false ? 'Reativar' : 'Desativar'}</span></button>
      </div>` : ''}`;
    icons();
    marcarSelecao();
    aplicarFotos();
  }

  async function atualizar() {
    await carregarOrdens(); // a coluna O.S. da tabela precisa de todas
    render();
    renderTabela();
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('#colabDet [data-det-acao]');
    if (!b || b.disabled) return;
    const c = atual();
    if (!c) return;
    const acao = b.dataset.detAcao;
    if (acao === 'fechar') { fechado = true; render(); return; }
    if (acao === 'termo') return window.EPI_TERMO?.abrir?.(c);
    if (acao === 'os') { const os = osDe(c); if (os) window.EPI_OS_FOLHA?.abrir?.({ os, colaborador: c }); return; }
    if (acao === 'epis' || acao === 'ultima' || acao === 'historico') return window.EPI_HISTORICO?.abrir?.(c);
    if (acao === 'editar' && typeof openColabEdit === 'function') return openColabEdit(c.id);
    if (acao === 'ativo' && typeof toggleColabActive === 'function') return toggleColabActive(c);
  });

  // Os termos (termo.js) carregam logo depois dos dados: redesenha de novo em seguida.
  window.addEventListener('epi:data-loaded', () => { ordens = null; atualizar(); setTimeout(() => { render(); renderTabela(); carregarFotos(); }, 1500); });

  // ---- Topo: botão Novo colaborador, busca e filtros ----
  // Os filtros guardam a escolha; a tabela (próxima etapa) lê com filtros().
  const unicos = (campo) => [...new Set(lista('collaborators').map((c) => String(c[campo] || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  function preencherSelect(id, rotulo, valores) {
    const sel = $(id);
    if (!sel) return;
    const atualV = sel.value;
    sel.innerHTML = `<option value="">${esc(rotulo)}</option>` + valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (valores.includes(atualV)) sel.value = atualV;
  }
  // Cada filtro fica só com a largura do texto que mostra (o select do
  // navegador estica até a opção mais comprida da lista).
  let regua = null;
  function ajustarLargura(sel) {
    if (!sel) return;
    if (!regua) { regua = document.createElement('span'); regua.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0'; document.body.appendChild(regua); }
    const cs = getComputedStyle(sel);
    regua.style.font = cs.font;
    regua.textContent = sel.options[sel.selectedIndex]?.text || '';
    sel.style.width = Math.min(170, Math.ceil(regua.offsetWidth) + 11 + 26 + 6) + 'px';
  }
  const ajustarTodos = () => document.querySelectorAll('.colab-filtro select').forEach(ajustarLargura);
  function montarTopo() {
    preencherSelect('colabFSetor', 'Setor', unicos('setor'));
    const funcoes = [...new Set(lista('collaborators').map((c) => String(c.funcao || c.cargo || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    preencherSelect('colabFFuncao', 'Função', funcoes);
    const novo = $('colabNovo');
    if (novo) novo.hidden = !isAdmin();
    document.querySelectorAll('.colab-filtro select').forEach((s) => s.classList.toggle('tem-valor', !!s.value));
    ajustarTodos();
  }
  const filtros = () => ({
    busca: ($('colabBusca')?.value || '').trim(),
    setor: $('colabFSetor')?.value || '',
    status: $('colabFStatus')?.value || '',
    termo: $('colabFTermo')?.value || '',
    funcao: $('colabFFuncao')?.value || ''
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#colabNovo') && typeof openColabEdit === 'function') openColabEdit(null);
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('.colab-filtro select');
    if (!s) return;
    s.classList.toggle('tem-valor', !!s.value);
    ajustarLargura(s);
    window.dispatchEvent(new CustomEvent('epi:colab-filtros', { detail: filtros() }));
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'colabBusca') window.dispatchEvent(new CustomEvent('epi:colab-filtros', { detail: filtros() }));
  });
  window.addEventListener('epi:data-loaded', montarTopo);
  document.fonts?.ready?.then(ajustarTodos);
  montarTopo();

  // ---- Tabela de colaboradores (coluna da esquerda) ----
  // Dados reais; filtros do topo; ordenação por nome; 8 por página; clicar na
  // linha mostra o colaborador no card; "…" abre o mesmo menu de antes
  // (openColabMenu do app.js: alterar, termo, afastar, desativar, excluir).
  const POR_PAGINA = 8;
  let pagina = 1;
  let ordemAsc = true;
  const semAcento = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

  function ultimasEntregas() {
    const m = new Map();
    for (const mv of lista('movements')) {
      if (!mv.colaborador_id) continue;
      const iso = isoDeBR(mv.data);
      if (iso && (!m.has(mv.colaborador_id) || iso > m.get(mv.colaborador_id))) m.set(mv.colaborador_id, iso);
    }
    return m;
  }
  const statusDe = (c) => (c.ativo === false ? 'desativado' : c.afastado === true ? 'afastado' : 'ativo');
  const temTermoAssinado = (c) => !!window.EPI_TERMO?.termoDe?.(c.id);

  function linhasFiltradas() {
    const f = filtros();
    const q = semAcento(f.busca);
    const qDig = f.busca.replace(/\D+/g, '');
    return lista('collaborators').filter((c) => {
      if (q) {
        const alvo = semAcento([c.nome, c.matricula, c.funcao, c.cargo].filter(Boolean).join(' '));
        if (!alvo.includes(q) && !(qDig && String(c.matricula || '').replace(/\D+/g, '').includes(qDig))) return false;
      }
      if (f.setor && String(c.setor || '').trim() !== f.setor) return false;
      if (f.funcao && String(c.funcao || c.cargo || '').trim() !== f.funcao) return false;
      // Desativados só aparecem quando o filtro Status pede por eles.
      if (!f.status && c.ativo === false) return false;
      if (f.status && statusDe(c) !== f.status) return false;
      if (f.termo === 'assinado' && !temTermoAssinado(c)) return false;
      if (f.termo === 'pendente' && temTermoAssinado(c)) return false;
      return true;
    // Termos assinados primeiro, pendentes depois; nome em ordem dentro de cada grupo.
    }).sort((a, b) => (Number(!temTermoAssinado(a)) - Number(!temTermoAssinado(b)))
      || (ordemAsc ? 1 : -1) * String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }

  const selo = (cls, ic, txt) => `<span class="g-employee-badge ${cls}">${ic ? `<i data-lucide="${ic}"></i>` : ''}${esc(txt)}</span>`;
  const falta = '<span class="g-employee-missing" aria-label="Não se aplica">—</span>';

  function linhaTabela(c, ult) {
    const st = statusDe(c);
    const termo = temTermoAssinado(c) ? selo('is-good', 'check', 'Assinado') : st === 'desativado' ? falta : selo('is-warning', 'clock-3', 'Pendente');
    const funcao = c.funcao || c.cargo || '';
    const data = ult.get(c.id);
    return `<tr data-colab-linha="${esc(c.id)}" tabindex="0" aria-label="${esc(c.nome)}">
      <td><div class="g-employee-person"><span class="g-employee-avatar" data-avatar="${esc(c.id)}" aria-hidden="true">${esc(iniciais(c.nome))}</span>
        <span class="g-employee-identity"><span class="g-employee-name" title="${esc(c.nome)}${c.matricula ? ` · Mat. ${esc(c.matricula)}` : ''}">${esc(c.nome)}</span></span></div></td>
      <td><span class="g-employee-cell-clip" title="${esc(funcao)}">${funcao ? esc(funcao) : falta}</span></td>
      <td>${termo}</td>
      <td>${data ? esc(dataBR(data)) : falta}</td>
      <td class="g-employee-acoes">${isAdmin() ? `<button type="button" class="g-employee-more" data-colab-menu="${esc(c.id)}" aria-haspopup="menu" aria-expanded="false" title="Opções" aria-label="Opções de ${esc(c.nome)}"><i data-lucide="ellipsis"></i></button>` : ''}</td>
    </tr>`;
  }

  function paginacao(total, paginas) {
    if (paginas <= 1) return '';
    let ini = Math.max(1, pagina - 2);
    const fim = Math.min(paginas, ini + 4);
    ini = Math.max(1, fim - 4);
    let nums = '';
    for (let p = ini; p <= fim; p++) nums += `<button type="button" class="g-employee-page${p === pagina ? ' is-current' : ''}" data-pagina="${p}"${p === pagina ? ' aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`;
    return `<nav class="g-employee-pagination" aria-label="Páginas">
      <button type="button" class="g-employee-page" data-pagina="${pagina - 1}"${pagina <= 1 ? ' disabled' : ''} aria-label="Página anterior"><i data-lucide="chevron-left"></i></button>
      ${nums}
      <button type="button" class="g-employee-page" data-pagina="${pagina + 1}"${pagina >= paginas ? ' disabled' : ''} aria-label="Próxima página"><i data-lucide="chevron-right"></i></button>
    </nav>`;
  }

  function renderTabela() {
    const box = $('colabPcLista');
    if (!box) return;
    const todas = linhasFiltradas();
    const paginas = Math.max(1, Math.ceil(todas.length / POR_PAGINA));
    if (pagina > paginas) pagina = paginas;
    const daPagina = todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    const ult = ultimasEntregas();
    const plural = todas.length === 1 ? 'colaborador' : 'colaboradores';
    box.innerHTML = `<section class="g-employee-panel" aria-label="Lista de colaboradores">
      <div class="g-employee-table-scroll">
        <div class="g-employee-selecao" aria-hidden="true"></div>
        <table class="g-employee-table">
          <colgroup><col><col><col><col><col></colgroup>
          <thead><tr>
            <th scope="col" aria-sort="${ordemAsc ? 'ascending' : 'descending'}"><button type="button" class="g-employee-sort" data-ordenar title="Ordenar por nome">Colaborador<i data-lucide="chevrons-up-down"></i></button></th>
            <th scope="col">Função</th><th scope="col">Termo</th><th scope="col">Última entrega</th><th scope="col"><span class="sr-only">Ações</span></th>
          </tr></thead>
          <tbody>${daPagina.map((c) => linhaTabela(c, ult)).join('') || `<tr class="g-employee-vazio"><td colspan="5">Nenhum colaborador encontrado com esses filtros.</td></tr>`}</tbody>
        </table>
      </div>
      <footer class="g-employee-footer">
        <span class="g-employee-count">Exibindo ${fmt(daPagina.length)} de ${fmt(todas.length)} ${plural}</span>
        ${paginacao(todas.length, paginas)}
      </footer>
    </section>`;
    icons();
    marcarSelecao();
    aplicarFotos();
  }

  // Destaque da linha escolhida: uma camada só, desenhada atrás da linha
  // (com cantos arredondados, o que o fundo de <tr> não permite).
  function marcarSelecao() {
    const box = $('colabPcLista');
    if (!box) return;
    const id = fechado ? null : atual()?.id;
    let alvo = null;
    box.querySelectorAll('tr[data-colab-linha]').forEach((tr) => {
      const sel = tr.dataset.colabLinha === id;
      tr.classList.toggle('is-selected', sel);
      tr.setAttribute('aria-selected', sel ? 'true' : 'false');
      if (sel) alvo = tr;
    });
    const camada = box.querySelector('.g-employee-selecao');
    if (!camada) return;
    if (!alvo) { camada.hidden = true; return; }
    camada.hidden = false;
    camada.style.top = alvo.offsetTop + 'px';
    camada.style.height = alvo.offsetHeight + 'px';
  }

  document.addEventListener('click', (e) => {
    const lista_ = e.target.closest('#colabPcLista');
    if (!lista_) return;
    const menu = e.target.closest('.g-employee-more[data-colab-menu]');
    if (menu) { e.stopPropagation(); if (typeof openColabMenu === 'function') openColabMenu(menu); return; }
    const pg = e.target.closest('[data-pagina]');
    if (pg && !pg.disabled) { pagina = Number(pg.dataset.pagina) || 1; renderTabela(); return; }
    if (e.target.closest('[data-ordenar]')) { ordemAsc = !ordemAsc; renderTabela(); return; }
    const tr = e.target.closest('tr[data-colab-linha]');
    if (tr) { atualId = tr.dataset.colabLinha; fechado = false; render(); }
  });
  document.addEventListener('keydown', (e) => {
    const tr = e.target.closest?.('#colabPcLista tr[data-colab-linha]');
    if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); }
  });
  window.addEventListener('epi:colab-filtros', () => { pagina = 1; renderTabela(); });
  window.addEventListener('resize', marcarSelecao);

  // ---- Fotos: a selfie do termo assinado entra no lugar das iniciais ----
  // Links assinados do bucket dos termos, pedidos de uma vez e renovados a
  // cada 50 min. Sem foto (ou se a imagem falhar), ficam as iniciais.
  const fotos = new Map(); // colaborador_id -> url
  let fotosEm = 0;
  async function carregarFotos(forcar) {
    const cli = db();
    const bucket = window.EPI_TERMO?.bucket;
    if (!cli || !bucket || !window.EPI_TERMO?.termoDe) return;
    if (!forcar && fotos.size && Date.now() - fotosEm < 50 * 60 * 1000) { aplicarFotos(); return; }
    const pares = lista('collaborators').map((c) => [c.id, window.EPI_TERMO.termoDe(c.id)?.selfie_path]).filter((p) => p[1]);
    if (!pares.length) return;
    const { data, error } = await cli.storage.from(bucket).createSignedUrls(pares.map((p) => p[1]), 3600);
    if (error || !Array.isArray(data)) { console.error('[colab-painel fotos]', error); return; }
    fotos.clear();
    data.forEach((d, i) => { if (d?.signedUrl) fotos.set(pares[i][0], d.signedUrl); });
    fotosEm = Date.now();
    aplicarFotos();
  }
  function aplicarFotos() {
    document.querySelectorAll('#colabPc [data-avatar]').forEach((el) => {
      const url = fotos.get(el.dataset.avatar);
      if (!url || el.classList.contains('tem-foto')) return;
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.onload = () => { el.textContent = ''; el.appendChild(img); el.classList.add('tem-foto'); };
      img.src = url;
    });
  }

  window.EPI_COLAB_PAINEL = {
    filtros,
    mostrar(id) { atualId = id; fechado = false; atualizar(); },
    fechar() { fechado = true; render(); },
    atualizar
  };
  atualizar();
  setTimeout(() => carregarFotos(), 1800);
})();
