(() => {
  'use strict';

  if (window.__EPI_NFE_BARCODE__) return;
  window.__EPI_NFE_BARCODE__ = true;

  const PATTERNS = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];

  function buildCode128C(value) {
    const digits = String(value || '').trim();
    if (!/^\d{44}$/.test(digits)) return null;

    const codes = [105]; // START C
    for (let i = 0; i < digits.length; i += 2) codes.push(Number(digits.slice(i, i + 2)));

    let checksum = codes[0];
    for (let i = 1; i < codes.length; i += 1) checksum += codes[i] * i;
    codes.push(checksum % 103, 106);

    const quiet = 10;
    let width = quiet * 2;
    codes.forEach((code) => {
      const pattern = PATTERNS[code];
      if (!pattern) return;
      width += [...pattern].reduce((sum, n) => sum + Number(n), 0);
    });

    let x = quiet;
    const bars = [];
    codes.forEach((code) => {
      const pattern = PATTERNS[code];
      let black = true;
      for (const unit of pattern) {
        const w = Number(unit);
        if (black) bars.push(`<rect x="${x}" y="0" width="${w}" height="46" fill="#000"/>`);
        x += w;
        black = !black;
      }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 46" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="Código de barras da chave de acesso ${digits}" shape-rendering="crispEdges"><rect width="${width}" height="46" fill="#fff"/>${bars.join('')}</svg>`;
  }

  function findAccessKey(box) {
    const candidates = [...box.querySelectorAll('strong,span')];
    for (const node of candidates) {
      const digits = String(node.textContent || '').replace(/\D/g, '');
      if (digits.length === 44) return digits;
    }
    return '';
  }

  function hydrate(root = document) {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll('.danfe-key-box .danfe-barcode').forEach((barcode) => {
      const box = barcode.closest('.danfe-key-box');
      if (!box) return;

      // Neutraliza o antigo gradiente decorativo mesmo quando a chave não for válida.
      barcode.style.background = '#fff';
      barcode.style.height = '46px';
      barcode.style.overflow = 'hidden';

      const key = findAccessKey(box);
      if (!/^\d{44}$/.test(key)) {
        barcode.removeAttribute('data-code128-key');
        barcode.innerHTML = '';
        return;
      }
      if (barcode.dataset.code128Key === key) return;

      const svg = buildCode128C(key);
      if (!svg) {
        barcode.removeAttribute('data-code128-key');
        barcode.innerHTML = '';
        return;
      }

      barcode.dataset.code128Key = key;
      barcode.innerHTML = svg;
    });
  }

  const observer = new MutationObserver(() => hydrate(document));

  function start() {
    hydrate(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
