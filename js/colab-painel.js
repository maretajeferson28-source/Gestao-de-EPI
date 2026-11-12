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
    return todos.find((c) => c.id === atualId)
      || [...todos].filter((c) => c.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))[0]
      || null;
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
    if (!c || fechado) { box.innerHTML = ''; return; }
    atualId = c.id;
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
        <div class="colab-det-avatar" aria-hidden="true">${esc(iniciais(c.nome))}</div>
        <div class="colab-det-id">
          <h3 class="colab-det-nome" title="${esc(c.nome)}">${esc(c.nome)}</h3>
          ${funcao ? `<span class="colab-det-funcao">${esc(funcao)}</span>` : ''}
          ${c.setor ? `<span class="colab-det-setor">Setor: ${esc(c.setor)}</span>` : ''}
        </div>
        <button type="button" class="colab-det-fechar" data-det-acao="fechar" title="Fechar" aria-label="Fechar detalhes"><i data-lucide="x"></i></button>
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
  }

  async function atualizar() {
    const c = atual();
    if (c?.os_id) await carregarOrdens();
    render();
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
  window.addEventListener('epi:data-loaded', () => { ordens = null; atualizar(); setTimeout(render, 1500); });

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

  window.EPI_COLAB_PAINEL = {
    filtros,
    mostrar(id) { atualId = id; fechado = false; atualizar(); },
    fechar() { fechado = true; render(); },
    atualizar
  };
  atualizar();
})();
