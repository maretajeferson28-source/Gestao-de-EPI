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
      <div class="os-folha-area" id="osFolhaArea"><article class="os-folha" id="osFolha"></article></div>`;
    document.body.appendChild(div);
    const fechar = () => { div.classList.add('hidden'); document.body.classList.remove('os-folha-aberta'); };
    div.querySelector('#osFolhaFechar').addEventListener('click', fechar);
    div.addEventListener('click', (e) => { if (e.target === div || e.target.id === 'osFolhaArea') fechar(); });
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

  function folha({ os, colaborador = {} }) {
    const secao = (n, titulo, corpo) => `<section class="os-sec"><h3><span>${n}</span>${esc(titulo)}</h3>${corpo}</section>`;
    const campo = (rot, val, largo) => `<div class="os-campo${largo ? ' is-largo' : ''}"><small>${esc(rot)}</small><strong>${esc(val || '—')}</strong></div>`;
    const agentes = (os.agentes || []).map((g) => `<tr>
        <th><span class="os-risco" style="--cor:${corRisco(g.grupo)}">${esc(g.grupo)}</span></th>
        <td>${(g.itens || []).length ? g.itens.map(esc).join('<i>·</i>') : '<em>Não identificado</em>'}</td></tr>`).join('');
    const epis = (os.epis || []).map((e) => `<li><span class="os-check" aria-hidden="true"></span>${esc(e.descricao)}</li>`).join('');
    const recs = (os.recomendacoes || []).map((r) => `<li>${esc(String(r).replace(/^[-•]\s*/, ''))}</li>`).join('');
    const ident = [colaborador.matricula ? 'Matrícula ' + colaborador.matricula : '', colaborador.cpf ? 'CPF ' + cpfFmt(colaborador.cpf) : ''].filter(Boolean).join(' · ');
    return `
      <header class="os-topo">
        <div class="os-marca"><img src="/assets/pdf-brand/logo.png" alt=""><div><b>GESTÃO DE <em>EPI</em></b><small>CONTROLE OPERACIONAL</small></div></div>
        <div class="os-doc"><b>ORDEM DE SERVIÇO (O.S.) POR FUNÇÃO</b><small>Segurança do Trabalho · NR-01</small></div>
      </header>
      <div class="os-titulo">
        <div><small>ORDEM DE SERVIÇO</small><h2>${esc(os.funcao)}</h2></div>
        <div class="os-selo"><span>Data</span><b>${esc(dataBR(os.data_os) || '—')}</b><span>Revisão</span><b>${esc(os.revisao ? 'Rev. ' + os.revisao : '—')}</b></div>
      </div>
      <div class="os-ident">
        ${campo('Funcionário', colaborador.nome, true)}
        ${campo('Função', os.funcao)}
        ${campo('Setor', os.setor)}
        ${ident ? campo('Identificação', ident, true) : ''}
      </div>
      ${os.descricao ? secao(1, 'Descrição da Função', `<p class="os-texto">${esc(os.descricao)}</p>`) : ''}
      ${secao(2, 'Agentes Associados às Atividades', agentes ? `<table class="os-riscos">${agentes}</table>` : '<p class="os-texto"><em>Não identificados.</em></p>')}
      ${secao(3, 'EPIs de Uso Obrigatório', epis ? `<ul class="os-epis">${epis}</ul>` : '<p class="os-texto"><em>Não se aplica.</em></p>')}
      ${recs ? secao(4, 'Recomendações', `<ul class="os-recs">${recs}</ul>`) : ''}
      <p class="os-frase">${esc(FRASE)}</p>
      ${os.procedimentos ? secao(5, 'Procedimentos em caso de acidentes', `<p class="os-texto">${esc(os.procedimentos)}</p>`) : ''}
      ${os.observacoes ? secao(6, 'Observações', `<p class="os-texto os-pequeno">${esc(os.observacoes)}</p>`) : ''}
      <div class="os-assinaturas">
        <div><span class="os-linha"></span><b>${esc(colaborador.nome || 'Funcionário')}</b><small>Assinatura do Funcionário</small><span class="os-data">Data: ____/____/______</span></div>
        <div><span class="os-linha"></span><b>&nbsp;</b><small>Assinatura do Responsável</small><span class="os-data">Data: ____/____/______</span></div>
      </div>
      <footer class="os-rodape"><span>Gestão de EPI · Controle Operacional</span><span>O.S. ${esc(os.funcao)}</span></footer>`;
  }

  function abrir(dados) {
    if (!dados?.os) return;
    montarJanela();
    atual = dados;
    document.getElementById('osFolha').innerHTML = folha(dados);
    document.getElementById('osFolhaUsar').hidden = typeof dados.usar !== 'function' || !(dados.os.epis || []).some((e) => e.epi_id);
    document.getElementById('osFolhaNome').textContent = `O.S. ${dados.os.funcao}${dados.colaborador?.nome ? ' · ' + dados.colaborador.nome : ''}`;
    const modal = document.getElementById('osFolhaModal');
    modal.classList.remove('hidden');
    document.body.classList.add('os-folha-aberta');
    document.getElementById('osFolhaArea').scrollTop = 0;
    window.lucide?.createIcons?.({ attrs: { 'aria-hidden': 'true' } });
  }

  window.EPI_OS_FOLHA = { abrir };
})();
