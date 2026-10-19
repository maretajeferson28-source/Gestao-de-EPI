(() => {
  'use strict';

  // Assinatura do termo no celular (botão "Termo" da barra de baixo):
  // 1) escolhe o colaborador; 2) captura de face com moldura oval — o detector
  // do MediaPipe roda no próprio aparelho; com o rosto no enquadramento a barra
  // enche em laranja e bate a foto, e se o rosto sai ela fica vermelha e recomeça;
  // 3) termo para ler e assinar com o dedo; 4) foto e assinatura vão para a pasta
  // privada termos-epi (R2) e o termo para a tabela termos_epi.
  if (window.__EPI_TERMO_CAPTURA__) return;
  window.__EPI_TERMO_CAPTURA__ = true;

  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODELO = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  const TEMPO_LEITURA = 1500; // ms com o rosto parado no oval para bater a foto
  const $ = (id) => document.getElementById(id);

  function db() { try { return typeof sb !== 'undefined' ? sb : null; } catch (_) { return null; } }
  function isAdmin() { try { return typeof currentIsAdmin !== 'undefined' && currentIsAdmin === true; } catch (_) { return false; } }
  function colaboradores() { try { return Array.isArray(collaborators) ? collaborators : []; } catch (_) { return []; } }
  function escHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function icons() { if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); }

  let tela = null;
  let colaborador = null;
  let stream = null;
  let detector = null;
  let loop = 0;
  let selfie = null; // Blob JPEG
  let cameraFrente = true; // câmera da frente (selfie) ou de trás

  // ---------- estrutura ----------
  function montar() {
    if (tela) return;
    tela = document.createElement('div');
    tela.className = 'tc-tela';
    tela.hidden = true;
    tela.innerHTML = `
      <section class="tc-passo" data-passo="colaborador">
        <header class="tc-topo"><button type="button" class="tc-x" data-tc-fechar aria-label="Fechar"><i data-lucide="x"></i></button><h2>Termo de autorização</h2></header>
        <p class="tc-ajuda">Escolha o colaborador que vai assinar.</p>
        <input type="search" class="tc-busca" id="tcBusca" placeholder="Buscar colaborador" autocomplete="off">
        <div class="tc-lista" id="tcLista"></div>
      </section>

      <section class="tc-passo tc-camera" data-passo="face">
        <header class="tc-topo"><button type="button" class="tc-x" data-tc-voltar aria-label="Voltar"><i data-lucide="x"></i></button><h2>Captura de face</h2></header>
        <button type="button" class="tc-cam-icone" id="tcGirar" aria-label="Girar câmera" title="Girar câmera"><i data-lucide="switch-camera"></i></button>
        <p class="tc-instrucao">Encaixe seu rosto no formato abaixo</p>
        <div class="tc-oval-area">
          <div class="tc-oval"><video id="tcVideo" playsinline muted autoplay></video></div>
          <svg class="tc-anel" viewBox="0 0 280 360" aria-hidden="true">
            <ellipse cx="140" cy="180" rx="134" ry="174" class="tc-anel-base"/>
            <path d="M140 6 A134 174 0 1 1 139.99 6" class="tc-anel-prog" id="tcAnel" pathLength="100"/>
          </svg>
        </div>
        <p class="tc-status" id="tcStatus">Abrindo a câmera…</p>
        <p class="tc-quem" id="tcQuem"></p>
      </section>

      <section class="tc-passo tc-termo" data-passo="termo">
        <header class="tc-topo"><button type="button" class="tc-x" data-tc-voltar aria-label="Voltar"><i data-lucide="x"></i></button><h2>Termo de autorização</h2></header>
        <div class="tc-termo-quem"><img id="tcSelfie" alt="Foto capturada"><div><strong id="tcNome"></strong><small>Biometria facial registrada</small></div></div>
        <div class="tc-texto" id="tcTexto"></div>
        <label class="tc-aceite"><input type="checkbox" id="tcAceite"><span>Li e concordo com o termo acima</span></label>
        <div class="tc-assinatura-topo"><span>Assine com o dedo</span><button type="button" class="btn compact" id="tcLimpar">Limpar</button></div>
        <canvas class="tc-assinatura" id="tcAssinatura"></canvas>
        <button type="button" class="btn primary tc-concluir" id="tcConcluir" disabled><i data-lucide="pen-line"></i>Assinar termo</button>
        <p class="tc-msg" id="tcMsg"></p>
      </section>`;
    document.body.appendChild(tela);

    tela.addEventListener('click', (e) => {
      if (e.target.closest('[data-tc-fechar]')) fechar();
      if (e.target.closest('[data-tc-voltar]')) passo(tela.dataset.passo === 'termo' ? 'face' : 'colaborador');
      const item = e.target.closest('[data-tc-colab]');
      if (item) { colaborador = colaboradores().find((c) => c.id === item.dataset.tcColab) || null; if (colaborador) passo('face'); }
    });
    $('tcBusca').addEventListener('input', renderLista);
    $('tcAceite').addEventListener('change', validar);
    $('tcLimpar').addEventListener('click', () => { assinatura.limpar(); validar(); });
    $('tcConcluir').addEventListener('click', salvar);
    $('tcGirar').addEventListener('click', () => {
      cameraFrente = !cameraFrente;
      pararCamera();
      iniciarCamera();
    });
    assinatura.iniciar($('tcAssinatura'));
    icons();
  }

  function passo(nome) {
    tela.dataset.passo = nome;
    tela.querySelectorAll('.tc-passo').forEach((p) => { p.hidden = p.dataset.passo !== nome; });
    if (nome === 'face') iniciarCamera(); else pararCamera();
    if (nome === 'colaborador') { $('tcBusca').value = ''; renderLista(); }
    if (nome === 'termo') abrirTermo();
  }

  function abrir() {
    if (!isAdmin()) return;
    montar();
    colaborador = null;
    tela.hidden = false;
    document.documentElement.classList.add('tc-aberto');
    passo('colaborador');
  }

  function fechar() {
    pararCamera();
    if (tela) tela.hidden = true;
    document.documentElement.classList.remove('tc-aberto');
  }

  // ---------- 1. colaborador ----------
  function renderLista() {
    const q = norm($('tcBusca').value.trim());
    const assinou = (id) => window.EPI_TERMO?.temAssinatura?.(id);
    const lista = colaboradores().filter((c) => c.ativo !== false && (!q || norm(c.nome).includes(q)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    $('tcLista').innerHTML = lista.length ? lista.map((c) => `
      <button type="button" class="tc-item" data-tc-colab="${escHtml(c.id)}">
        <span class="tc-item-nome">${escHtml(c.nome)}<small>${escHtml([c.cargo, c.setor].filter(Boolean).join(' • ') || 'Sem cargo informado')}</small></span>
        ${assinou(c.id) ? '<span class="tc-item-ok"><i data-lucide="badge-check"></i>Assinado</span>' : '<i data-lucide="chevron-right"></i>'}
      </button>`).join('') : '<p class="tc-ajuda">Nenhum colaborador encontrado.</p>';
    icons();
  }

  // ---------- 2. captura de face ----------
  async function carregarDetector() {
    if (detector) return detector;
    const vision = await import(`${MP}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODELO, delegate: 'CPU' },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5
    });
    return detector;
  }

  function status(texto, tipo = '') {
    const el = $('tcStatus');
    el.textContent = texto;
    el.dataset.tipo = tipo;
  }

  function anel(progresso, cor) {
    const el = $('tcAnel');
    el.style.strokeDasharray = `${Math.max(0, Math.min(100, progresso))} 100`;
    el.dataset.cor = cor || '';
  }

  async function iniciarCamera() {
    $('tcQuem').textContent = colaborador ? colaborador.nome : '';
    anel(0);
    status('Abrindo a câmera…');
    selfie = null;
    try {
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cameraFrente ? 'user' : 'environment', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      const video = $('tcVideo');
      video.classList.toggle('is-traseira', !cameraFrente); // só a da frente aparece espelhada
      video.srcObject = stream;
      await video.play().catch(() => {});
      status('Carregando a leitura facial…');
      await carregarDetector();
      if (tela.dataset.passo !== 'face') return;
      status('Nenhum rosto detectado', 'erro');
      lerFace();
    } catch (err) {
      console.error('[TERMO FACE]', err);
      status(err?.name === 'NotAllowedError' ? 'Permita o uso da câmera para continuar.' : 'Não foi possível abrir a câmera ou a leitura facial.', 'erro');
    }
  }

  function pararCamera() {
    clearTimeout(loop);
    loop = 0;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    const video = $('tcVideo');
    if (video) video.srcObject = null;
  }

  // Nitidez: variação do contorno (Laplaciano) no rosto reduzido. Valor baixo = desfocado.
  const nitidezCanvas = document.createElement('canvas');
  function nitidez(video, box) {
    const w = 64, h = 64;
    nitidezCanvas.width = w; nitidezCanvas.height = h;
    const g = nitidezCanvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, box.originX, box.originY, box.width, box.height, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const cinza = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) cinza[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
    let soma = 0, soma2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = cinza[i - w] + cinza[i + w] + cinza[i - 1] + cinza[i + 1] - 4 * cinza[i];
      soma += l; soma2 += l * l; n++;
    }
    const media = soma / n;
    return soma2 / n - media * media;
  }

  // O oval mostra o centro do vídeo (object-fit: cover). Converte a caixa do rosto
  // para coordenadas 0–1 dentro do oval e confere se está dentro e com bom tamanho.
  function enquadrado(video, box) {
    const oval = video.parentElement.getBoundingClientRect();
    const vw = video.videoWidth, vh = video.videoHeight;
    const escala = Math.max(oval.width / vw, oval.height / vh);
    const visW = oval.width / escala, visH = oval.height / escala;
    const x0 = (vw - visW) / 2, y0 = (vh - visH) / 2;
    const cx = (box.originX + box.width / 2 - x0) / visW;
    const cy = (box.originY + box.height / 2 - y0) / visH;
    const tam = box.width / visW;
    const dx = (cx - 0.5) / 0.5, dy = (cy - 0.5) / 0.5;
    const dentro = dx * dx + dy * dy <= 0.45 * 0.45; // centro do rosto perto do centro do oval
    return dentro && tam >= 0.22 && tam <= 1.1;
  }

  function lerFace() {
    const video = $('tcVideo');
    let progresso = 0, ultimo = performance.now(), vermelhoAte = 0;
    const tick = () => {
      if (tela.dataset.passo !== 'face' || !detector) return;
      const agora = performance.now();
      const dt = agora - ultimo; ultimo = agora;
      let ok = false, motivo = 'Nenhum rosto detectado';
      if (video.readyState >= 2 && video.videoWidth) {
        const res = detector.detectForVideo(video, agora);
        const face = res.detections?.[0];
        if (face && (face.categories?.[0]?.score ?? 0) >= 0.6) {
          if (!enquadrado(video, face.boundingBox)) motivo = 'Centralize o rosto no formato';
          else if (nitidez(video, face.boundingBox) < 12) motivo = 'Imagem desfocada — segure o celular parado';
          else ok = true;
        }
      }
      if (ok) {
        progresso += (dt / TEMPO_LEITURA) * 100;
        anel(progresso, 'laranja');
        status('Mantenha o rosto parado…', 'lendo');
        if (progresso >= 100) { capturar(video); return; }
      } else {
        if (progresso > 0) vermelhoAte = agora + 700; // saiu no meio: fica vermelho e recomeça
        progresso = 0;
        const vermelho = agora < vermelhoAte;
        anel(vermelho ? 100 : 0, vermelho ? 'vermelho' : '');
        status(vermelho ? 'Leitura interrompida — recomeçando' : motivo, 'erro');
      }
      loop = setTimeout(tick, 80);
    };
    loop = setTimeout(tick, 80);
  }

  function capturar(video) {
    const lado = Math.min(1080, Math.max(video.videoWidth, video.videoHeight));
    const k = lado / Math.max(video.videoWidth, video.videoHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(video.videoWidth * k);
    c.height = Math.round(video.videoHeight * k);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    status('Rosto capturado', 'ok');
    c.toBlob((blob) => { selfie = blob; passo('termo'); }, 'image/jpeg', 0.88);
  }

  // ---------- 3. termo e assinatura ----------
  const assinatura = {
    canvas: null, ctx: null, vazio: true, desenhando: false,
    iniciar(canvas) {
      this.canvas = canvas;
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); this.desenhando = true; const [x, y] = pos(e); this.ctx.beginPath(); this.ctx.moveTo(x, y); this.ctx.lineTo(x + 0.1, y + 0.1); this.ctx.stroke(); });
      canvas.addEventListener('pointermove', (e) => { if (!this.desenhando) return; e.preventDefault(); const [x, y] = pos(e); this.ctx.lineTo(x, y); this.ctx.stroke(); if (this.vazio) { this.vazio = false; validar(); } });
      const fim = () => { this.desenhando = false; };
      canvas.addEventListener('pointerup', fim);
      canvas.addEventListener('pointercancel', fim);
    },
    preparar() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.ctx = this.canvas.getContext('2d');
      this.ctx.scale(dpr, dpr);
      this.limpar();
    },
    limpar() {
      const r = this.canvas.getBoundingClientRect();
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
      Object.assign(this.ctx, { strokeStyle: '#111111', lineWidth: 2.4, lineCap: 'round', lineJoin: 'round' });
      this.vazio = true;
      void r;
    },
    blob() { return new Promise((ok) => this.canvas.toBlob(ok, 'image/png')); }
  };

  function textoHtml(texto) {
    const linhas = String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let html = '', lista = [];
    const fecha = () => { if (lista.length) { html += `<ul>${lista.map((l) => `<li>${escHtml(l)}</li>`).join('')}</ul>`; lista = []; } };
    for (const l of linhas) { if (l.startsWith('*')) lista.push(l.replace(/^\*\s*/, '')); else { fecha(); html += `<p>${escHtml(l)}</p>`; } }
    fecha();
    return html;
  }

  function abrirTermo() {
    $('tcNome').textContent = colaborador?.nome || '';
    if (selfie) $('tcSelfie').src = URL.createObjectURL(selfie);
    $('tcSelfie').classList.toggle('is-traseira', !cameraFrente);
    $('tcTexto').innerHTML = textoHtml(window.EPI_TERMO?.texto || '');
    $('tcAceite').checked = false;
    $('tcMsg').textContent = '';
    setTimeout(() => assinatura.preparar(), 30);
    validar();
  }

  function validar() {
    $('tcConcluir').disabled = !($('tcAceite').checked && !assinatura.vazio && selfie && colaborador);
  }

  // ---------- 4. salvar ----------
  async function salvar() {
    const client = db();
    const bucket = window.EPI_TERMO?.bucket || 'termos-epi';
    const botao = $('tcConcluir');
    const msg = $('tcMsg');
    botao.disabled = true;
    msg.textContent = 'Salvando o termo…';
    msg.dataset.tipo = '';
    const base = `${colaborador.id}/${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const enviados = [];
    try {
      const sig = await assinatura.blob();
      const up1 = await client.storage.from(bucket).upload(`${base}-selfie.jpg`, selfie, { contentType: 'image/jpeg', upsert: false });
      if (up1.error) throw up1.error;
      enviados.push(`${base}-selfie.jpg`);
      const up2 = await client.storage.from(bucket).upload(`${base}-assinatura.png`, sig, { contentType: 'image/png', upsert: false });
      if (up2.error) throw up2.error;
      enviados.push(`${base}-assinatura.png`);
      const { error } = await client.from('termos_epi').insert({
        colaborador_id: colaborador.id,
        texto: window.EPI_TERMO?.texto || '',
        selfie_path: `${base}-selfie.jpg`,
        assinatura_path: `${base}-assinatura.png`,
        dispositivo: navigator.userAgent.slice(0, 300)
      });
      if (error) throw error;
      await window.EPI_TERMO?.recarregar?.();
      msg.textContent = `Termo de ${colaborador.nome} assinado.`;
      msg.dataset.tipo = 'ok';
      setTimeout(fechar, 1400);
    } catch (err) {
      console.error('[TERMO SALVAR]', err);
      if (enviados.length) await client.storage.from(bucket).remove(enviados);
      msg.textContent = 'Não foi possível salvar: ' + (err.message || err);
      msg.dataset.tipo = 'erro';
      botao.disabled = false;
    }
  }

  window.EPI_TERMO_CAPTURA = { abrir, fechar };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tela && !tela.hidden) fechar(); });
})();
