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

  function applySpendDescendingOrder() {
    if (!window.Chart) return false;

    const chart = Chart.getChart('cSpend');
    const dataset = chart?.data?.datasets?.[0];
    const labels = chart?.data?.labels;
    if (!chart || !dataset || !Array.isArray(labels) || !Array.isArray(dataset.data) || labels.length !== dataset.data.length) return false;

    const rows = labels.map((label, index) => ({
      label,
      value: Number(dataset.data[index]) || 0
    })).sort((a, b) => b.value - a.value);

    const alreadyDescending = rows.every((row, index) =>
      row.label === labels[index] && row.value === (Number(dataset.data[index]) || 0)
    );

    if (!alreadyDescending) {
      chart.data.labels = rows.map((row) => row.label);
      dataset.data = rows.map((row) => row.value);
      chart.update('none');
    }

    return true;
  }

  function applyDashboardTweaks() {
    const qualityApplied = applyQualityChartAccent();
    const spendApplied = applySpendDescendingOrder();
    return qualityApplied || spendApplied;
  }

  function scheduleApply() {
    requestAnimationFrame(() => requestAnimationFrame(applyDashboardTweaks));
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
      const applied = applyDashboardTweaks();
      attempts += 1;
      if (applied || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
