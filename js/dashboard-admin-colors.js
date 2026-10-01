(() => {
  'use strict';

  if (window.__EPI_DASHBOARD_ADMIN_COLORS__) return;
  window.__EPI_DASHBOARD_ADMIN_COLORS__ = true;

  const ADMIN_MISSING_COLOR = '#ffb800';

  function isAdminUi() {
    const adminNav = document.getElementById('authzNavBtn');
    return !!adminNav && adminNav.hidden === false;
  }

  function applyQualityChartAccent() {
    if (!isAdminUi() || !window.Chart) return false;

    const chart = Chart.getChart('cQual');
    const dataset = chart?.data?.datasets?.[0];
    if (!chart || !dataset || !Array.isArray(dataset.backgroundColor) || dataset.backgroundColor.length < 2) return false;

    if (dataset.backgroundColor[1] !== ADMIN_MISSING_COLOR) {
      dataset.backgroundColor[1] = ADMIN_MISSING_COLOR;
      chart.update('none');
    }

    return true;
  }

  function scheduleApply() {
    requestAnimationFrame(() => requestAnimationFrame(applyQualityChartAccent));
  }

  function start() {
    ['fDe','fAte','fColab','fEpi','fResp'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', scheduleApply);
    });

    const status = document.getElementById('statusText');
    if (status) {
      new MutationObserver(scheduleApply).observe(status, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    const adminNav = document.getElementById('authzNavBtn');
    if (adminNav) {
      new MutationObserver(scheduleApply).observe(adminNav, {
        attributes: true,
        attributeFilter: ['hidden','style','class']
      });
    }

    let attempts = 0;
    const timer = setInterval(() => {
      const applied = applyQualityChartAccent();
      attempts += 1;
      if (applied || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
