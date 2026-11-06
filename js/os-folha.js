// Folha da Ordem de Serviço dentro do app: página A4 branca, igual ao PDF,
// aberta numa janela por cima da tela (sem baixar nada).
// Uso: window.EPI_OS_FOLHA.abrir({ os, colaborador })
(() => {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBR = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };
  const cpfFmt = (v) => String(v || '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  // Cores do mapa de riscos (NR-5): físico verde, químico vermelho, biológico
  // marrom, ergonômico amarelo, acidentes azul.
  const COR_RISCO = { fisico: '#16a34a', quimico: '#dc2626', biologico: '#92400e', ergonomico: '#ca8a04', acidentes: '#2563eb', acidente: '#2563eb' };
  const corRisco = (g) => COR_RISCO[String(g || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()] || '#6b7280';
  const FRASE = 'A pressa é a companheira inesperada dos acidentes, portanto faça tudo com tempo, para fazer bem e com segurança.';

  let atual = null;

  function montarJanela() {
    if (document.getElementById('osFolhaModal')) return;
    const div = document.createElement('div');
    div.className = 'os-folha-modal hidden';
    div.id = 'osFolhaModal';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-label', 'Ordem de serviço');
    div.innerHTML = `
      <div class="os-folha-barra">
        <div class="os-folha-barra-titulo"><i data-lucide="file-text" aria-hidden="true"></i><span id="osFolhaNome">Ordem de serviço</span></div>
        <div class="os-folha-barra-acoes">
          <button class="btn primary os-folha-usar" id="osFolhaUsar" type="button" hidden><i data-lucide="list-plus" aria-hidden="true"></i>Usar na entrega</button>
          <button class="btn os-folha-btn" id="osFolhaPdf" type="button"><i data-lucide="download" aria-hidden="true"></i>Baixar PDF</button>
          <button class="btn os-folha-btn" id="osFolhaImprimir" type="button"><i data-lucide="printer" aria-hidden="true"></i>Imprimir</button>
          <button class="os-folha-fechar" id="osFolhaFechar" type="button" aria-label="Fechar"><i data-lucide="x" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="os-folha-area" id="osFolhaArea"></div>`;
    document.body.appendChild(div);
    const fechar = () => { div.classList.add('hidden'); document.body.classList.remove('os-folha-aberta'); };
    div.querySelector('#osFolhaFechar').addEventListener('click', fechar);
    div.addEventListener('click', (e) => { if (e.target === div) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !div.classList.contains('hidden')) fechar(); });
    div.querySelector('#osFolhaImprimir').addEventListener('click', () => window.print());
    div.querySelector('#osFolhaUsar').addEventListener('click', async () => {
      const usar = atual?.usar;
      fechar();
      if (usar) await usar();
    });
    div.querySelector('#osFolhaPdf').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { await window.EPI_PDF.downloadOrdemServico(atual); }
      catch (err) { console.error('[OS PDF]', err); alert('Não foi possível gerar o PDF: ' + (err.message || err)); }
      finally { b.disabled = false; }
    });
  }

  // Texto corrido -> tópicos: quebra nas linhas e nos marcadores; se vier um
  // parágrafo só, quebra nas frases.
  const frases = (t) => String(t || '').split(/(?<=[.;:])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((s) => s.trim()).filter(Boolean);
  function topicos(texto) {
    const linhas = String(texto || '').split(/\r?\n/).map((l) => l.replace(/^[\s•\-–]+/, '').trim()).filter(Boolean);
    return linhas.length > 1 ? linhas : frases(linhas[0] || '');
  }
  // Recomendação longa vira item principal + subitens (" - " ou frases).
  function recomendacao(r) {
    const t = String(r || '').replace(/^[-•]\s*/, '').trim();
    let partes = t.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    if (partes.length === 1 && t.length > 260) partes = frases(t);
    return { principal: partes[0] || t, subs: partes.slice(1) };
  }

  // Monta as partes da folha. O topo e o rodapé se repetem em cada página;
  // os blocos do meio são distribuídos nas páginas A4 por paginar().
  function partes({ os, colaborador = {} }) {
    const secao = (n, titulo, corpo, lista) => `<section class="os-sec"${lista ? ' data-quebra' : ''}><h3><span>${n}</span>${esc(titulo)}</h3>${corpo}</section>`;
    const campo = (rot, val, largo) => `<div class="os-campo${largo ? ' is-largo' : ''}"><small>${esc(rot)}</small><strong>${esc(val || '—')}</strong></div>`;
    const ident = [colaborador.matricula ? 'Matrícula ' + colaborador.matricula : '', colaborador.cpf ? 'CPF ' + cpfFmt(colaborador.cpf) : ''].filter(Boolean).join(' · ');

    // 1. Descrição em tópicos
    const desc = topicos(os.descricao);
    const descricao = desc.length ? `<ul class="os-topicos" data-itens>${desc.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : '';
    // 2. Agentes: um card por grupo de risco, com a cor do mapa de riscos
    const agentes = (os.agentes || []).map((g) => `<div class="os-risco-card" style="--cor:${corRisco(g.grupo)}">
        <b>${esc(g.grupo)}</b>
        ${(g.itens || []).length ? `<ul>${g.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p>Não identificado</p>'}</div>`).join('');
    // 3. EPIs
    const epis = (os.epis || []).map((e) => `<li><span class="os-check" aria-hidden="true"></span>${esc(e.descricao)}</li>`).join('');
    // 4. Recomendações em tabela numerada
    const recs = (os.recomendacoes || []).map((r, i) => {
      const x = recomendacao(r);
      return `<tr><td class="os-num">${String(i + 1).padStart(2, '0')}</td><td>${esc(x.principal)}${x.subs.length ? `<ul class="os-sub">${x.subs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</td></tr>`;
    }).join('');
    // 5. Procedimentos: quadro de alerta, com a OBS separada
    const proc = topicos(os.procedimentos);
    const procOk = proc.filter((l) => !/^obs/i.test(l));
    const procObs = proc.filter((l) => /^obs/i.test(l)).map((l) => l.replace(/^obs\.?:?\s*/i, ''));
    const procedimentos = `<div class="os-alerta"><b>Em caso de acidente</b>${procOk.map((l) => `<p>${esc(l)}</p>`).join('')}
      ${procObs.map((l) => `<p class="os-nota"><strong>Atenção:</strong> ${esc(l)}</p>`).join('')}</div>`;
    // 6. Observações: declaração + trecho da CLT em destaque
    const obs = String(os.observacoes || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const iArt = obs.findIndex((l) => /^art\.?\s*\d+/i.test(l));
    const declara = iArt < 0 ? obs : obs.slice(0, iArt);
    const lei = iArt < 0 ? [] : obs.slice(iArt);
    const leiItens = lei.slice(1).join(' ').split(/\s(?=[a-z]\)\s)/);
    const observacoes = `<div class="os-declaracao">${declara.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      ${lei.length ? `<div class="os-lei"><b>CLT · ${esc(lei[0].replace(/^art\.?\s*/i, 'Art. '))}</b>${leiItens.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}`;

    return {
      topo: `<header class="os-topo">
        <div class="os-marca"><img src="/assets/pdf-brand/logo.png" alt=""><div><b>GESTÃO DE <em>EPI</em></b><small>CONTROLE OPERACIONAL</small></div></div>
        <div class="os-doc"><b>ORDEM DE SERVIÇO (O.S.) POR FUNÇÃO</b><small>Segurança do Trabalho · NR-01</small></div>
      </header>`,
      rodape: (pag, total) => `<footer class="os-rodape"><span>Gestão de EPI · Controle Operacional · O.S. ${esc(os.funcao)}</span><span>Página ${pag} de ${total}</span></footer>`,
      blocos: [
        `<div class="os-titulo">
          <div><small>ORDEM DE SERVIÇO</small><h2>${esc(os.funcao)}</h2></div>
          <div class="os-selo"><span>Data</span><b>${esc(dataBR(os.data_os) || '—')}</b><span>Revisão</span><b>${esc(os.revisao ? 'Rev. ' + os.revisao : '—')}</b></div>
        </div>`,
        `<div class="os-ident">
          ${campo('Funcionário', colaborador.nome, true)}
          ${campo('Função', os.funcao)}
          ${campo('Setor', os.setor)}
          ${ident ? campo('Identificação', ident, true) : ''}
        </div>`,
        descricao ? secao(1, 'Descrição da Função', descricao, desc.length > 1) : '',
        secao(2, 'Agentes Associados às Atividades', agentes ? `<div class="os-riscos-grid">${agentes}</div>` : '<p class="os-texto"><em>Não identificados.</em></p>'),
        secao(3, 'EPIs de Uso Obrigatório', epis ? `<ul class="os-epis" data-itens>${epis}</ul>` : '<p class="os-texto"><em>Não se aplica.</em></p>', !!epis),
        recs ? secao(4, 'Recomendações', `<table class="os-tabela"><thead><tr><th>Nº</th><th>Recomendação</th></tr></thead><tbody data-itens>${recs}</tbody></table>`, true) : '',
        `<p class="os-frase">${esc(FRASE)}</p>`,
        os.procedimentos ? secao(5, 'Procedimentos em caso de acidentes', procedimentos) : '',
        os.observacoes ? secao(6, 'Observações', observacoes) : '',
        `<div class="os-assinaturas" data-junto>
          <div><span class="os-linha"></span><b>${esc(colaborador.nome || 'Funcionário')}</b><small>Assinatura do Funcionário</small><span class="os-data">Data: ____/____/______</span></div>
          <div><span class="os-linha"></span><b>&nbsp;</b><small>Assinatura do Responsável</small><span class="os-data">Data: ____/____/______</span></div>
        </div>`
      ].filter(Boolean)
    };
  }

  const elemento = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  // Distribui os blocos em páginas A4 (210 × 297 mm). Quando uma seção com lista
  // não cabe, ela é partida item por item e continua na página seguinte.
  function paginar(area, p) {
    area.innerHTML = '';
    const paginas = [];
    const nova = () => {
      const pag = document.createElement('article');
      pag.className = 'os-folha os-pagina';
      // O rodapé entra já na criação (com o número provisório) para a medida contar com ele.
      pag.innerHTML = `${p.topo}<div class="os-corpo"></div>${p.rodape(1, 1)}`;
      area.appendChild(pag);
      paginas.push(pag);
      return pag.querySelector('.os-corpo');
    };
    // Estourou se o fim do último elemento (o bloco ou o item da lista que acabou de
    // entrar) passa do fim da área útil da página.
    const estoura = (corpo, el = corpo.lastElementChild) => {
      if (!el) return false;
      const limite = corpo.getBoundingClientRect().bottom - parseFloat(getComputedStyle(corpo).paddingBottom || 0);
      return el.getBoundingClientRect().bottom > limite + 0.5;
    };
    let corpo = nova();
    for (const html of p.blocos) {
      const bloco = elemento(html);
      corpo.appendChild(bloco);
      if (!estoura(corpo, bloco)) continue;
      const lista = bloco.hasAttribute('data-quebra') ? bloco.querySelector('[data-itens]') : null;
      if (lista && lista.children.length > 1) {
        // Parte a lista: o que cabe fica aqui, o resto vai para a próxima página.
        const itens = [...lista.children];
        lista.innerHTML = '';
        let atualLista = lista, atualBloco = bloco, anteriorLista = null;
        for (const li of itens) {
          atualLista.appendChild(li);
          if (!estoura(corpo, li)) continue;
          if (atualBloco === bloco && atualLista.children.length <= 3 && corpo.children.length > 1) {
            // Só caberiam até 2 itens no pé da página: a seção inteira começa na próxima.
            corpo.removeChild(bloco);
            corpo = nova();
            corpo.appendChild(bloco);
          } else if (atualLista.children.length > 1) {
            atualLista.removeChild(li);
            anteriorLista = atualLista;
            corpo = nova();
            atualBloco = bloco.cloneNode(true);
            atualBloco.querySelector('h3').insertAdjacentHTML('beforeend', '<em class="os-cont">continuação</em>');
            atualLista = atualBloco.querySelector('[data-itens]');
            atualLista.innerHTML = '';
            corpo.appendChild(atualBloco);
            atualLista.appendChild(li);
          }
        }
        // Viúva (como no Word): a continuação não fica com um item só.
        if (anteriorLista && atualLista.children.length === 1 && anteriorLista.children.length >= 4) atualLista.prepend(anteriorLista.lastElementChild);
      } else if (corpo.children.length > 1) {
        // "Manter com o anterior" (como no Word): as assinaturas não descem sozinhas.
        const anterior = bloco.hasAttribute('data-junto') && corpo.children.length > 2 ? bloco.previousElementSibling : null;
        corpo.removeChild(bloco);
        if (anterior) corpo.removeChild(anterior);
        corpo = nova();
        if (anterior) corpo.appendChild(anterior);
        corpo.appendChild(bloco);
      }
    }
    paginas.forEach((pag, i) => { pag.querySelector('.os-rodape').outerHTML = p.rodape(i + 1, paginas.length); });
  }

  function abrir(dados) {
    if (!dados?.os) return;
    montarJanela();
    atual = dados;
    document.getElementById('osFolhaUsar').hidden = typeof dados.usar !== 'function' || !(dados.os.epis || []).some((e) => e.epi_id);
    document.getElementById('osFolhaNome').textContent = `O.S. ${dados.os.funcao}${dados.colaborador?.nome ? ' · ' + dados.colaborador.nome : ''}`;
    const modal = document.getElementById('osFolhaModal');
    modal.classList.remove('hidden');
    document.body.classList.add('os-folha-aberta');
    const area = document.getElementById('osFolhaArea');
    // A janela já está à mostra: dá para medir e paginar.
    paginar(area, partes(dados));
    area.scrollTop = 0;
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  window.EPI_OS_FOLHA = { abrir };
})();
