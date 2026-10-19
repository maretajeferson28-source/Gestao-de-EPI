(() => {
  'use strict';

  // Termo de responsabilidade do EPI. No computador é só consulta: o menu do
  // colaborador ("Ver termo de autorização") abre a declaração com a biometria
  // facial e a assinatura digital. Enquanto a assinatura no celular não existe,
  // fica ativo também para o colaborador de exemplo (EXEMPLO), como pendente.
  if (window.__EPI_TERMO__) return;
  window.__EPI_TERMO__ = true;

  const TEXTO = `Declaro, para os devidos fins, que recebi os EPI's relacionados ao meu cadastro e comprometo-me a:

* Usá-los apenas para a finalidade a que se destinam;
* Sempre que um destes equipamentos estiver e más condições ou fora do prazo, comunicar imediatamente ao responsável de SST;
* Permanecer responsável por estes equipamentos, zelando por sua guarda e conservação, sendo que deverei arcar com os custos para aquisição de novas peças, caso vir a extravia-los ou danifica-los devido ao uso inadequado ou fora das atividades a que se destina sem apresentar a devida justificativa;
* Caso vir a me desligar da empresa, devo devolver todos os itens a mim relacionados;
* Responsabilizar-me pela danificação do EPI devido ao seu uso inadequado ou fora das atividades a que se destina, bem como seu extravio;
* Declaro, também estar  ciente que o uso é obrigatório, sob pena de sanção disciplinar conforme lei nº 6.514, de 22.12.77 - artigo158 e demais normas vigentes.
* Declaro, ainda que recebi treinamento referente ao uso adequado do EPI e as Normas de Segurança do Trabalho.`;

  const BUCKET = 'termos-epi';
  const EXEMPLO = 'jeferson dos santos';
  const $ = (id) => document.getElementById(id);
  let termos = new Map(); // colaborador_id -> termo mais recente

  function db() { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } }
  function isAdmin() { try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; } catch (_) { return false; } }
  function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  function ehExemplo(colaboradorId) {
    try { return collaborators.some((c) => c.id === colaboradorId && norm(c.nome) === EXEMPLO); } catch (_) { return false; }
  }
  function icons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); }

  // Texto em parágrafos; linhas com "*" viram lista.
  function textoHtml(texto) {
    const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let html = '', lista = [];
    const fecha = () => { if (lista.length) { html += `<ul>${lista.map((l) => `<li>${escHtml(l)}</li>`).join('')}</ul>`; lista = []; } };
    for (const l of linhas) {
      if (l.startsWith('*')) lista.push(l.replace(/^\*\s*/, ''));
      else { fecha(); html += `<p>${escHtml(l)}</p>`; }
    }
    fecha();
    return html;
  }

  async function carregar() {
    const client = db();
    if (!client || !isAdmin()) { termos = new Map(); return; }
    const { data, error } = await client.from('termos_epi').select('id,colaborador_id,texto,selfie_path,assinatura_path,assinado_em').order('assinado_em', { ascending: false });
    if (error) { console.warn('[TERMO]', error); return; }
    termos = new Map();
    for (const t of data || []) if (!termos.has(t.colaborador_id)) termos.set(t.colaborador_id, t);
  }

  function montarModal() {
    if ($('termoModal')) return;
    const modal = document.createElement('div');
    modal.className = 'data-edit-modal hidden';
    modal.id = 'termoModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'termoTitle');
    modal.innerHTML = `
      <div class="data-edit-card termo-card">
        <button class="data-edit-close" id="termoClose" type="button" aria-label="Fechar"><i data-lucide="x" aria-hidden="true"></i></button>
        <div class="data-edit-head">
          <div class="data-edit-icon"><i data-lucide="file-text" aria-hidden="true"></i></div>
          <div>
            <span>TERMO DE AUTORIZAÇÃO</span>
            <h3 id="termoTitle">Termo de responsabilidade do EPI</h3>
            <p id="termoSub"></p>
          </div>
        </div>
        <div class="data-edit-body">
          <div class="termo-texto" id="termoTexto"></div>
          <div class="termo-provas">
            <figure><figcaption><i data-lucide="scan-face" aria-hidden="true"></i>Biometria facial</figcaption><div class="termo-img" id="termoSelfie"></div></figure>
            <figure><figcaption><i data-lucide="signature" aria-hidden="true"></i>Assinatura digital</figcaption><div class="termo-img termo-assinatura" id="termoAssinatura"></div></figure>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const fechar = () => modal.classList.add('hidden');
    $('termoClose').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) fechar(); });
  }

  async function imagem(boxId, path, alt) {
    const box = $(boxId);
    if (!path) { box.innerHTML = '<span>Não registrada</span>'; return; }
    box.innerHTML = '<span>Carregando…</span>';
    const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 600);
    box.innerHTML = error || !data?.signedUrl ? '<span>Não foi possível carregar</span>' : `<img src="${escHtml(data.signedUrl)}" alt="${escHtml(alt)}">`;
  }

  async function abrir(colaborador) {
    const termo = termos.get(colaborador?.id);
    if (!termo && !ehExemplo(colaborador?.id)) return;
    montarModal();
    $('termoTitle').textContent = colaborador.nome;
    $('termoSub').textContent = termo
      ? `Assinado no celular em ${new Date(termo.assinado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
      : 'Ainda não assinado no celular';
    $('termoTexto').innerHTML = textoHtml(termo?.texto || TEXTO);
    $('termoModal').classList.remove('hidden');
    icons();
    if (!termo) {
      $('termoSelfie').innerHTML = '<span>Aguardando assinatura no celular</span>';
      $('termoAssinatura').innerHTML = '<span>Aguardando assinatura no celular</span>';
      return;
    }
    imagem('termoSelfie', termo.selfie_path, `Foto de ${colaborador.nome}`);
    imagem('termoAssinatura', termo.assinatura_path, `Assinatura de ${colaborador.nome}`);
  }

  window.EPI_TERMO = {
    texto: TEXTO,
    bucket: BUCKET,
    temTermo: (colaboradorId) => termos.has(colaboradorId) || ehExemplo(colaboradorId),
    abrir,
    recarregar: carregar
  };

  window.addEventListener('epi:data-loaded', carregar);
  carregar();
})();
