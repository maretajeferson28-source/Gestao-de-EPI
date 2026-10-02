(() => {
  'use strict';

  if (window.__EPI_ITEM_SAFETY_DOSSIER__) return;
  window.__EPI_ITEM_SAFETY_DOSSIER__ = true;

  const cache = new Map();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function injectStyles() {
    if (document.getElementById('itemSafetyDossierStyle')) return;
    const style = document.createElement('style');
    style.id = 'itemSafetyDossierStyle';
    style.textContent = `
      .item-safety-dossier{margin:18px 0 4px;border:1px solid #2b333d;border-radius:18px;overflow:hidden;background:#12171c;box-shadow:0 18px 45px rgba(0,0,0,.22)}
      .item-safety-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 22px;border-bottom:1px solid #252e37;background:linear-gradient(180deg,#171d23,#13191f)}
      .item-safety-kicker{display:block;margin-bottom:5px;color:#ff7a1a;font-size:10px;font-weight:900;letter-spacing:.13em}
      .item-safety-head h3{margin:0;color:#f4f7f9;font-size:20px;line-height:1.2}
      .item-safety-type{display:inline-flex;align-items:center;gap:7px;flex:none;padding:7px 10px;border:1px solid #3a4652;border-radius:999px;color:#d6dde4;background:#0f1419;font-size:10px;font-weight:800;letter-spacing:.08em}
      .item-safety-description{margin:0;padding:18px 22px 4px;color:#b8c2cc;font-size:13px;line-height:1.65}
      .item-safety-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:16px 22px 22px}
      .item-safety-section{border:1px solid #27313a;border-radius:14px;background:#0f1418;padding:15px 16px;min-width:0}
      .item-safety-section.full{grid-column:1/-1}
      .item-safety-section h4{display:flex;align-items:center;gap:8px;margin:0 0 12px;color:#f2f5f7;font-size:12px;letter-spacing:.04em}
      .item-safety-section h4 svg{width:15px;height:15px;color:#ff6600}
      .item-safety-rows{display:grid;gap:9px}
      .item-safety-row{display:grid;grid-template-columns:minmax(120px,.75fr) minmax(0,1.25fr);gap:12px;align-items:start;padding-top:9px;border-top:1px solid #202830}
      .item-safety-row:first-child{padding-top:0;border-top:0}
      .item-safety-row span{color:#788592;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}
      .item-safety-row strong{color:#dce3e8;font-size:12px;font-weight:650;line-height:1.45;word-break:break-word}
      .item-safety-text{margin:0;color:#c1c9d0;font-size:12px;line-height:1.6}
      .item-safety-tags{display:flex;flex-wrap:wrap;gap:7px}
      .item-safety-tag{padding:6px 8px;border:1px solid #34414d;border-radius:8px;background:#12191f;color:#dce3e8;font-size:11px;font-weight:700}
      .item-safety-source{display:flex;align-items:flex-start;gap:9px;padding:13px 22px 15px;border-top:1px solid #252e37;color:#77838e;font-size:10px;line-height:1.45}
      .item-safety-source svg{width:14px;height:14px;flex:none;color:#ff6600;margin-top:1px}
      .item-safety-loading{padding:24px;color:#8d99a4;font-size:12px;text-align:center}
      @media(max-width:760px){.item-safety-grid{grid-template-columns:1fr}.item-safety-section.full{grid-column:auto}.item-safety-head{flex-direction:column}.item-safety-row{grid-template-columns:1fr;gap:4px}}
    `;
    document.head.appendChild(style);
  }

  function ensureHost() {
    const card = document.querySelector('#epiDetailModal .epi-detail-card');
    const head = card?.querySelector('.epi-detail-head');
    if (!card || !head) return null;
    let host = document.getElementById('itemSafetyDossier');
    if (!host) {
      host = document.createElement('section');
      host.id = 'itemSafetyDossier';
      host.className = 'item-safety-dossier';
      host.hidden = true;
      head.insertAdjacentElement('afterend', host);
    }
    return host;
  }

  function setCaUiVisible(visible) {
    const selector = document.getElementById('epiCaSelectorWrap');
    const count = document.getElementById('epiDetailCount');
    const layout = document.querySelector('#epiDetailModal .epi-detail-layout');
    if (selector) selector.hidden = !visible;
    if (count) count.hidden = !visible;
    if (layout) layout.hidden = !visible;

    const kicker = document.querySelector('#epiDetailModal .epi-detail-kicker');
    if (kicker) kicker.textContent = visible ? 'CADASTRO TÉCNICO DO ITEM' : 'FICHA TÉCNICA DO ITEM';
  }

  function rowsHtml(entries) {
    return entries
      .filter(([,value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([label,value]) => `<div class="item-safety-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
      .join('');
  }

  function objectRows(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
    return rowsHtml(Object.entries(obj));
  }

  function renderFicha(host, ficha) {
    const dimensions = objectRows(ficha.dimensoes);
    const specs = objectRows(ficha.especificacoes);
    const norms = Array.isArray(ficha.normas) ? ficha.normas : [];

    host.innerHTML = `
      <div class="item-safety-head">
        <div>
          <span class="item-safety-kicker">ITEM DE SEGURANÇA • ${esc(ficha.tipo || 'ITEM')}</span>
          <h3>${esc(ficha.titulo || 'Ficha técnica')}</h3>
        </div>
        <span class="item-safety-type"><i data-lucide="clipboard-check" aria-hidden="true"></i>FICHA TÉCNICA</span>
      </div>

      ${ficha.descricao ? `<p class="item-safety-description">${esc(ficha.descricao)}</p>` : ''}

      <div class="item-safety-grid">
        <section class="item-safety-section">
          <h4><i data-lucide="badge-info" aria-hidden="true"></i>Identificação</h4>
          <div class="item-safety-rows">
            ${rowsHtml([
              ['Fabricante', ficha.fabricante || 'Não informado na ficha'],
              ['Material', ficha.material],
              ['Peso', ficha.peso],
              ['Classificação fiscal', ficha.classificacao_fiscal]
            ])}
          </div>
        </section>

        <section class="item-safety-section">
          <h4><i data-lucide="ruler" aria-hidden="true"></i>Dimensões</h4>
          <div class="item-safety-rows">${dimensions || '<p class="item-safety-text">Não informado.</p>'}</div>
        </section>

        <section class="item-safety-section full">
          <h4><i data-lucide="book-check" aria-hidden="true"></i>Normas e requisitos</h4>
          <div class="item-safety-tags">${norms.length ? norms.map((norm) => `<span class="item-safety-tag">${esc(norm)}</span>`).join('') : '<span class="item-safety-text">Não informado.</span>'}</div>
        </section>

        <section class="item-safety-section full">
          <h4><i data-lucide="route" aria-hidden="true"></i>Utilização</h4>
          <p class="item-safety-text">${esc(ficha.utilizacao || 'Não informado.')}</p>
        </section>

        <section class="item-safety-section">
          <h4><i data-lucide="sparkles" aria-hidden="true"></i>Conservação</h4>
          <div class="item-safety-rows">
            ${rowsHtml([
              ['Manutenção', ficha.manutencao],
              ['Armazenagem', ficha.armazenagem]
            ])}
          </div>
        </section>

        <section class="item-safety-section">
          <h4><i data-lucide="calendar-clock" aria-hidden="true"></i>Vida útil</h4>
          <div class="item-safety-rows">
            ${rowsHtml([
              ['Validade', ficha.validade],
              ['Vida útil', ficha.vida_util]
            ])}
          </div>
        </section>

        ${ficha.embalagem ? `<section class="item-safety-section full"><h4><i data-lucide="package" aria-hidden="true"></i>Embalagem</h4><p class="item-safety-text">${esc(ficha.embalagem)}</p></section>` : ''}

        ${specs ? `<section class="item-safety-section full"><h4><i data-lucide="list-checks" aria-hidden="true"></i>Especificações técnicas</h4><div class="item-safety-rows">${specs}</div></section>` : ''}
      </div>

      ${ficha.fonte ? `<div class="item-safety-source"><i data-lucide="file-text" aria-hidden="true"></i><span>Fonte do cadastro: ${esc(ficha.fonte)}</span></div>` : ''}
    `;
    host.hidden = false;
    setCaUiVisible(false);
    if (window.lucide?.createIcons) window.lucide.createIcons({attrs:{'aria-hidden':'true'}});
  }

  async function fetchFicha(epiId) {
    if (cache.has(epiId)) return cache.get(epiId);
    try {
      const {data,error} = await sb
        .from('item_fichas_tecnicas')
        .select('id,epi_id,tipo,titulo,fabricante,descricao,material,peso,dimensoes,normas,utilizacao,validade,vida_util,manutencao,armazenagem,embalagem,classificacao_fiscal,especificacoes,fonte,ativo')
        .eq('epi_id', epiId)
        .eq('ativo', true)
        .maybeSingle();
      if (error) throw error;
      cache.set(epiId, data || null);
      return data || null;
    } catch (error) {
      console.error('[ITEM SAFETY DOSSIER]', error);
      return null;
    }
  }

  async function syncFicha() {
    const modal = document.getElementById('epiDetailModal');
    const host = ensureHost();
    if (!modal || !host || modal.classList.contains('hidden')) return;

    let epi = null;
    try { epi = typeof selectedEpi !== 'undefined' ? selectedEpi : null; }
    catch (_) { epi = null; }

    if (!epi?.id) {
      host.hidden = true;
      setCaUiVisible(true);
      return;
    }

    host.hidden = false;
    host.innerHTML = '<div class="item-safety-loading">Carregando ficha técnica do item...</div>';

    const ficha = await fetchFicha(epi.id);
    if (!ficha) {
      host.hidden = true;
      setCaUiVisible(true);
      return;
    }

    renderFicha(host, ficha);
  }

  function start() {
    injectStyles();
    ensureHost();

    const modal = document.getElementById('epiDetailModal');
    if (!modal) return;

    new MutationObserver(() => {
      if (modal.classList.contains('hidden')) {
        const host = document.getElementById('itemSafetyDossier');
        if (host) host.hidden = true;
        setCaUiVisible(true);
        return;
      }
      setTimeout(syncFicha, 0);
    }).observe(modal, {attributes:true, attributeFilter:['class']});

    const title = document.getElementById('epiDetailTitle');
    if (title) {
      new MutationObserver(() => {
        if (!modal.classList.contains('hidden')) setTimeout(syncFicha, 0);
      }).observe(title, {childList:true, characterData:true, subtree:true});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
