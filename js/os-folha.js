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
      const texto = b.innerHTML;
      b.disabled = true;
      b.textContent = 'Gerando PDF…';
      try { await baixarPdf(); }
      catch (err) { console.error('[OS PDF]', err); alert('Não foi possível gerar o PDF: ' + (err.message || err)); }
      finally { b.disabled = false; b.innerHTML = texto; window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } }); }
    });
  }

  // PDF igual à folha: cada página A4 já montada na tela vira uma página do PDF.
  async function baixarPdf() {
    if (!window.jspdf?.jsPDF || !window.html2canvas) throw new Error('Gerador de PDF não carregado.');
    const paginas = [...document.querySelectorAll('#osFolhaArea .os-pagina')];
    if (!paginas.length) throw new Error('Abra a folha da OS primeiro.');
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    // No PDF sai a versão de impressão (sem fundo preto, gasta pouca tinta).
    const area = document.getElementById('osFolhaArea');
    area.classList.add('os-impressao');
    try {
      for (let i = 0; i < paginas.length; i += 1) {
        const canvas = await window.html2canvas(paginas[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        if (i) doc.addPage();
        doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
    } finally { area.classList.remove('os-impressao'); }
    const nome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
    doc.save(`OS_${nome(atual?.os?.funcao)}_${nome(atual?.colaborador?.nome) || 'modelo'}.pdf`);
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

  // Monta as partes da folha no padrão das OS originais (formulário com
  // quadros e faixas de título), com a identidade do app. O topo e o rodapé se
  // repetem em cada página; os blocos do meio são distribuídos por paginar().
  function partes({ os, colaborador = {} }) {
    const quadro = (n, titulo, corpo, lista) => `<section class="os-box"${lista ? ' data-quebra' : ''}><h3 class="os-barra"><span>${n}</span>${esc(titulo)}</h3><div class="os-box-corpo">${corpo}</div></section>`;
    const ident = [colaborador.matricula ? 'Matrícula ' + colaborador.matricula : '', colaborador.cpf ? 'CPF ' + cpfFmt(colaborador.cpf) : ''].filter(Boolean).join(' · ');
    const desc = topicos(os.descricao);
    const agentes = (os.agentes || []).map((g) => `<tr><th><i style="background:${corRisco(g.grupo)}"></i>${esc(g.grupo)}</th>
        <td>${(g.itens || []).length ? g.itens.map((i) => `<div>${esc(i)}</div>`).join('') : '<div class="os-vazio">Não identificado</div>'}</td></tr>`).join('');
    const epis = (os.epis || []).map((e) => `<li><span class="os-check" aria-hidden="true"></span>${esc(e.descricao)}</li>`).join('');
    const recs = (os.recomendacoes || []).map((r) => {
      const x = recomendacao(r);
      return `<li>${esc(x.principal)}${x.subs.length ? `<ul class="os-sub">${x.subs.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</li>`;
    }).join('');
    const proc = topicos(os.procedimentos);
    const obs = String(os.observacoes || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const iArt = obs.findIndex((l) => /^art\.?\s*\d+/i.test(l));
    const declara = iArt < 0 ? obs : obs.slice(0, iArt);
    const lei = iArt < 0 ? [] : obs.slice(iArt);
    const leiItens = lei.slice(1).join(' ').split(/\s(?=[a-z]\)\s)/);
    return {
      topo: `<header class="os-topo">
        <div class="os-marca"><img src="/assets/pdf-brand/logo.png" alt=""><div><b>GESTÃO DE <em>EPI</em></b><small>CONTROLE OPERACIONAL</small></div></div>
        <div class="os-doc"><b>ORDEM DE SERVIÇO (O.S.) POR FUNÇÃO</b><small>Segurança do Trabalho · NR-01</small></div>
      </header>`,
      rodape: (pag, total) => `<footer class="os-rodape"><span>Gestão de EPI · Controle Operacional · O.S. ${esc(os.funcao)}</span><span>Página ${pag} de ${total}</span></footer>`,
      blocos: [
        // Cabeçalho do formulário, como nas OS originais
        `<table class="os-form"><colgroup><col style="width:50%"><col><col style="width:150px"></colgroup>
          <tr><td class="os-form-titulo" colspan="2"><small>ORDEM DE SERVIÇO (O.S.) POR FUNÇÃO</small><b>${esc(os.funcao)}</b></td>
            <td class="os-form-data"><span>Data</span><b>${esc(dataBR(os.data_os) || '—')}</b><span>Revisão</span><b>${esc(os.revisao ? 'Rev. ' + os.revisao : '—')}</b></td></tr>
          <tr><td colspan="3"><span>Nome Funcionário:</span> <b>${esc(colaborador.nome || '—')}</b>${ident ? `<em>${esc(ident)}</em>` : ''}</td></tr>
          <tr><td><span>Função:</span> <b>${esc(os.funcao)}</b></td><td colspan="2"><span>Setor:</span> <b>${esc(os.setor || '—')}</b></td></tr>
        </table>`,
        desc.length ? quadro(1, 'Descrição da Função', `<ul class="os-lista" data-itens>${desc.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`, desc.length > 3) : '',
        quadro(2, 'Agentes Associados às Atividades', agentes ? `<table class="os-agentes">${agentes}</table>` : '<p class="os-vazio">Não identificados.</p>'),
        quadro(3, 'EPIs de Uso Obrigatório', epis ? `<ul class="os-epis" data-itens>${epis}</ul>` : '<p class="os-vazio">Não se aplica.</p>', !!epis),
        recs ? quadro(4, 'Recomendações', `<ul class="os-lista" data-itens>${recs}</ul>`, true) : '',
        `<p class="os-frase">${esc(FRASE)}</p>`,
        os.procedimentos ? quadro(5, 'Procedimentos em caso de acidentes', proc.map((l) => /^obs/i.test(l) ? `<p><b>OBS:</b> ${esc(l.replace(/^obs\.?:?\s*/i, ''))}</p>` : `<p>${esc(l)}</p>`).join('')) : '',
        os.observacoes ? quadro(6, 'Observações', `${declara.map((l, i) => `<p${i ? ' class="os-forte"' : ''}>${esc(l)}</p>`).join('')}
          ${lei.length ? `<div class="os-lei"><b>${esc(lei[0].replace(/^art\.?\s*/i, 'Art. '))}</b>${leiItens.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}`) : '',
        `<table class="os-form os-assina" data-junto>
          <tr><td><span>Assinatura do Funcionário:</span><div class="os-linha-ass"></div><b>${esc(colaborador.nome || '')}</b></td><td class="os-assina-data"><span>Data:</span> ____/____/______</td></tr>
          <tr><td><span>Assinatura do Responsável:</span><div class="os-linha-ass"></div></td><td class="os-assina-data"><span>Data:</span> ____/____/______</td></tr>
        </table>`
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
