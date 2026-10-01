(() => {
  'use strict';

  if (window.__EPI_DASHBOARD_SPEND_ORDER__) return;
  window.__EPI_DASHBOARD_SPEND_ORDER__ = true;

  function sortSpendChartDescending() {
    if (!window.Chart) return false;

    const chart = Chart.getChart('cSpend');
    const dataset = chart?.data?.datasets?.[0];
    const labels = chart?.data?.labels;
    const values = dataset?.data;

    if (!chart || !dataset || !Array.isArray(labels) || !Array.isArray(values) || labels.length !== values.length) {
      return false;
    }

    const rows = labels.map((label, index) => ({
      label,
      value: Number(values[index]) || 0
    }));

    const sorted = rows.slice().sort((a, b) => b.value - a.value);
    const alreadySorted = rows.every((row, index) => row.label === sorted[index].label && row.value === sorted[index].value);

    if (!alreadySorted) {
      chart.data.labels = sorted.map((row) => row.label);
      dataset.data = sorted.map((row) => row.value);
      chart.update('none');
    }

    return true;
  }

  function scheduleSort() {
    requestAnimationFrame(() => requestAnimationFrame(sortSpendChartDescending));
    setTimeout(sortSpendChartDescending, 80);
    setTimeout(sortSpendChartDescending, 250);
  }

  function start() {
    ['fDe','fAte','fColab','fEpi','fResp'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', scheduleSort);
    });

    const status = document.getElementById('statusText');
    if (status) {
      new MutationObserver(scheduleSort).observe(status, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    scheduleSort();

    let attempts = 0;
    const timer = setInterval(() => {
      const found = sortSpendChartDescending();
      attempts += 1;
      if ((found && attempts >= 4) || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
