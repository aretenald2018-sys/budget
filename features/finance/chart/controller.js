import { chartTooltipSvg } from '../projection/index.js';
import { financeState as STATE } from '../state.js';

export function bindFinanceChartInteractions(renderFinance) {
  document.querySelectorAll('.finance-chart svg').forEach(svg => {
    svg.addEventListener('mouseleave', () => hideFinancePointTooltip(svg));
    svg.addEventListener('blur', () => hideFinancePointTooltip(svg), true);
  });
  document.querySelectorAll('.finance-point-hit').forEach(dot => {
    const showLive = () => showFinancePointTooltip(dot);
    dot.addEventListener('mouseenter', showLive);
    dot.addEventListener('focus', showLive);
    dot.addEventListener('mouseleave', () => hideFinancePointTooltip(dot.closest('svg')));
    dot.addEventListener('pointerdown', showLive);
    dot.addEventListener('pointerup', () => hideFinancePointTooltip(dot.closest('svg')));
    dot.addEventListener('click', event => {
      event.preventDefault();
      showLive();
      window.setTimeout(() => hideFinancePointTooltip(dot.closest('svg')), 900);
    });
    dot.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      showLive();
      window.setTimeout(() => hideFinancePointTooltip(dot.closest('svg')), 1200);
    });
  });
  document.querySelectorAll('[data-scenario-preview]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-scenario-preview');
      STATE.compareScenarioId = STATE.compareScenarioId === id ? null : id;
      STATE.chartTooltip = null;
      renderFinance();
    });
  });
}

function hideFinancePointTooltip(svg) {
  const tip = svg?.querySelector('.finance-chart-tip-live');
  if (tip) tip.setAttribute('style', 'display:none');
  STATE.chartTooltip = null;
}

function showFinancePointTooltip(dot) {
  const svg = dot.closest('svg');
  const liveTip = svg?.querySelector('.finance-chart-tip-live');
  if (!svg || !liveTip) return;
  const tip = {
    year: Number(dot.dataset.year),
    balance: Number(dot.dataset.balance),
    profit: Number(dot.dataset.profit),
    x: Number(dot.dataset.x),
    y: Number(dot.dataset.y),
  };
  const viewBox = svg.getAttribute('viewBox')?.split(/\s+/).map(Number) || [0, 0, 320, 184];
  const markup = chartTooltipSvg(tip, viewBox[2] || 320, viewBox[3] || 184, 'finance-chart-tip-live')
    .replace(/^\s*<g[^>]*>/, '')
    .replace(/<\/g>\s*$/i, '')
    .trim();
  liveTip.innerHTML = markup;
  liveTip.removeAttribute('style');
}
