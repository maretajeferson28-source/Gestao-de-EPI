(() => {
  'use strict';

  if (window.__EPI_DASHBOARD_SPEND_ORDER__) return;
  window.__EPI_DASHBOARD_SPEND_ORDER__ = true;

  function forceLargestAtTop() {
    if (!window.Chart) return false;

    const chart = Chart.getChart('cSpend');
    if (!chart) return false;

    chart.options.scales = chart.options.scales || {};
    chart.options.scales.y = chart.options.scales.y || {};

    if (chart.options.scales.y.reverse !== true) {
      chart.options.scales.y.reverse = true;
      chart.update('none');
    }

    return true;
  }

  function scheduleFix() {
    requestAnimationFrame(() => requestAnimationFrame(forceLargestAtTop));
    setTimeout(forceLargestAtTop, 80);
    setTimeout(forceLargestAtTop, 250);
    setTimeout(forceLargestAtTop, 700);
  }

  function start() {
    ['fDe','fAte','fColab','fEpi','fResp'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', scheduleFix);
    });

    const status = document.getElementById('statusText');
    if (status) {
      new MutationObserver(scheduleFix).observe(status, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    scheduleFix();

    let attempts = 0;
    const timer = setInterval(() => {
      forceLargestAtTop();
      attempts += 1;
      if (attempts >= 80) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
