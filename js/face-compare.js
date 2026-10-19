(() => {
  'use strict';

  // Compara o rosto da entrega com a foto do termo do colaborador, no próprio
  // aparelho (face-api: detector + pontos do rosto + "assinatura numérica" do
  // rosto). Só o resultado vai para o banco; a foto da entrega não é guardada.
  // A referência do termo (128 números, não a foto) fica guardada no aparelho
  // para comparar também sem internet.
  if (window.__EPI_FACE__) return;
  window.__EPI_FACE__ = true;

  const LIB = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js';
  const MODELOS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
  const LIMITE = 0.55; // distância máxima para considerar a mesma pessoa
  const REF_KEY = 'epi-face-ref-v1';

  let pronto = null;
  function carregar() {
    if (pronto) return pronto;
    pronto = (async () => {
      if (!window.faceapi) {
        await new Promise((ok, erro) => {
          const s = document.createElement('script');
          s.src = LIB; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar a leitura facial.'));
          document.head.appendChild(s);
        });
      }
      const f = window.faceapi;
      await Promise.all([
        f.nets.tinyFaceDetector.loadFromUri(MODELOS),
        f.nets.faceLandmark68TinyNet.loadFromUri(MODELOS),
        f.nets.faceRecognitionNet.loadFromUri(MODELOS)
      ]);
      return f;
    })();
    pronto.catch(() => { pronto = null; });
    return pronto;
  }

  async function descritor(blob) {
    const f = await carregar();
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Imagem inválida.')); i.src = url; });
      const r = await f.detectSingleFace(img, new f.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
        .withFaceLandmarks(true).withFaceDescriptor();
      return r ? Array.from(r.descriptor) : null;
    } finally { URL.revokeObjectURL(url); }
  }

  function refsSalvas() { try { return JSON.parse(localStorage.getItem(REF_KEY) || '{}'); } catch (_) { return {}; } }
  function salvarRef(colabId, termoId, d) {
    try { const refs = refsSalvas(); refs[colabId] = { termoId, d: d.map((v) => Math.round(v * 1e5) / 1e5) }; localStorage.setItem(REF_KEY, JSON.stringify(refs)); } catch (_) {}
  }

  // Referência do termo: a guardada no aparelho (se for do termo atual) ou,
  // com internet, calculada da foto do termo.
  async function referencia(colabId) {
    const termo = window.EPI_TERMO?.termoDe?.(colabId);
    const salva = refsSalvas()[colabId];
    if (salva && (!termo || !termo.id || salva.termoId === termo.id)) return { termoId: salva.termoId, d: salva.d };
    if (!termo?.selfie_path) return termo ? { semFoto: true } : { semTermo: true };
    if (!navigator.onLine) return { semRede: true };
    const { data, error } = await sb.storage.from(window.EPI_TERMO?.bucket || 'termos-epi').createSignedUrl(termo.selfie_path, 300);
    if (error || !data?.signedUrl) throw new Error('Não foi possível abrir a foto do termo.');
    const blob = await (await fetch(data.signedUrl)).blob();
    const d = await descritor(blob);
    if (!d) return { semRostoNoTermo: true };
    salvarRef(colabId, termo.id, d);
    return { termoId: termo.id, d };
  }

  // Resultado: { ok, semelhanca (0–1), termoId } ou { pendente } (sem internet e
  // sem referência guardada: compara ao sincronizar) ou { erro: 'mensagem' }.
  async function comparar(colabId, blob) {
    try {
      const ref = await referencia(colabId);
      if (ref.semRede) return { pendente: true };
      if (ref.semTermo) return { erro: 'Este colaborador não tem termo assinado para comparar.' };
      if (ref.semFoto || ref.semRostoNoTermo) return { erro: 'A foto do termo não serve para comparar. Colete um novo termo.' };
      const atual = await descritor(blob);
      if (!atual) return { erro: 'Não achei o rosto na foto. Tente de novo com mais luz.' };
      const dist = Math.sqrt(atual.reduce((s, v, i) => s + (v - ref.d[i]) ** 2, 0));
      const semelhanca = Math.max(0, Math.min(1, 1 - dist));
      return { ok: dist <= LIMITE, semelhanca: Math.round(semelhanca * 1000) / 1000, termoId: ref.termoId };
    } catch (err) {
      console.error('[FACE]', err);
      if (!navigator.onLine) return { pendente: true };
      return { erro: err.message || String(err) };
    }
  }

  // Baixa os modelos com antecedência (ficam guardados para o uso offline).
  function preparar() { return carregar().then(() => true).catch(() => false); }

  window.EPI_FACE = { comparar, preparar };
})();
