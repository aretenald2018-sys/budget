// ================================================================
// render-finance.js — long-term finance direction tab
// ================================================================

import {
  listFinanceGoals, saveFinanceGoal,
  listFinanceBenchmarks, saveFinanceBenchmark, deleteFinanceBenchmark,
  listFinanceActuals, saveFinanceActual, deleteFinanceActual,
  listFinanceAssetTracks, saveFinanceAssetTrack, deleteFinanceAssetTrack,
  getCategories,
} from './data.js';
import { compoundProjection, formatManwonFromKRW } from './utils/finance-goals.js';
import { $, escHtml } from './utils/dom.js';
import { showToast } from './utils/toast.js';
import { fmtMonthKey } from './utils/format.js';
import { fetchUsdKrwOnDate, loadMarketQuotes, marketSymbols, portfolioSnapshotWithFx } from './utils/market-data.js?v=20260507-kr-etf-symbol-fix';
import { searchLocalMarketSymbols } from './utils/market-symbol-catalog.js?v=20260503-cache-no-store';
import { hasServerApi } from './utils/runtime.js?v=20260505-github-pages';

const STATE = {
  editScenarioId: null,
  editActualId: null,
  actualSheetOpen: false,
  expandedActualId: null,
  cashflowOpen: false,
  scenarioManagerOpen: false,
  assetOpsOpen: false,
  editAssetTrackId: null,
  assetTrackMenuId: null,
  trackRenameId: null,
  chartTooltip: null,
  compareScenarioId: null,
  editHoldingTrackId: null,
  editHoldingIndex: null,
  assetImport: null,
  activeGoalId: null,
  activeGoalName: '',
  targetScenarioId: null,
  scenarios: [],
  assetTracks: [],
  panel: 'scenario',
};

const TARGET_PORTFOLIO = [
  { id: 'nasdaq', name: '나스닥100', target: 0.70, short: 'QQQM', buy: 'QQQM / KODEX 미국나스닥100TR' },
  { id: 'dividend', name: '배당성장', target: 0.10, short: 'SCHD', buy: 'SCHD / 미국배당다우존스 ETF' },
  { id: 'gold', name: '금', target: 0.15, short: 'IAU', buy: 'IAU / GLD / KRX 금' },
  { id: 'individual', name: '개별주', target: 0.05, short: 'M7', buy: 'M7 개별주 슬롯' },
];
const TARGET_BUCKET_IDS = new Set(TARGET_PORTFOLIO.map(item => item.id));

export async function renderFinance() {
  const root = $('#tab-finance');
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  const [goals, benchmarks, actuals, assetTracks] = await Promise.all([
    listFinanceGoals({ max: 10 }).catch(() => []),
    listFinanceBenchmarks({ max: 50 }).catch(() => []),
    listFinanceActuals({ max: 50 }).catch(() => []),
    listFinanceAssetTracks({ max: 50 }).catch(() => []),
  ]);
  const market = await loadMarketQuotes(marketSymbols(assetTracks)).catch(() => ({ quotes: {}, fx: 1450, updatedAt: null, source: '시세 연결 대기' }));
  const goal = goals.find(item => item.active !== false) || goals[0] || null;
  STATE.activeGoalId = goal?.id || null;
  STATE.activeGoalName = goal?.name || '';
  STATE.targetScenarioId = goal?.heroBenchmarkId || null;
  STATE.scenarios = benchmarks;
  STATE.assetTracks = assetTracks;
  const scenarioSeries = buildScenarioSeries(benchmarks, goal?.heroBenchmarkId);
  const actualSeries = buildActualSeries(actuals);
  const heroSeries = heroBasisSeries(goal, scenarioSeries);
  const chartTarget = heroSeries || scenarioSeries[0] || null;
  const compareSeries = STATE.compareScenarioId === chartTarget?.id
    ? null
    : scenarioSeries.find(item => item.id === STATE.compareScenarioId) || null;
  const categories = getCategories();
  const portfolio = portfolioSnapshotWithFx(assetTracks, market);
  const heroLast = heroSeries?.rows.at(-1)?.balance || 0;
  const gap = actualGapAtTargetYear(heroSeries, actuals);
  const hasActual = actuals.some(item => Number(item.cumulativeSaved) || Number(item.netWorth));
  const heroAmountText = gap == null
    ? (hasActual ? latestActualText(actuals) : '실적 입력')
    : `${gap >= 0 ? '+' : '-'}${formatPlainKRW(Math.abs(gap))}`;
  const heroAmountUnit = gap == null ? '' : '원';
  if (!['scenario', 'asset'].includes(STATE.panel)) STATE.panel = 'scenario';

  root.innerHTML = `
    <div class="finance-screen">
      <section class="hero finance-hero">
        <div>
          <div class="label">목표 자산까지</div>
          <div class="amount">${heroAmountText}<span class="unit">${heroAmountUnit}</span></div>
          <div class="sub">
            <span>현재 <b>${latestActualText(actuals)}</b></span>
            <span>목표 <b>${heroSeries ? formatManwonFromKRW(heroLast) : '-'}</b></span>
          </div>
          <div class="pace">${gap == null || gap < 0 ? '● 목표 기준 보정 필요' : '● 목표선보다 앞서가는 중'}</div>
        </div>
      </section>

      <div class="segmented finance-main-tabs">
        ${financePanelButton('scenario', '시나리오')}
        ${financePanelButton('asset', '자산')}
      </div>

      ${financePanelContent({ benchmarks, goal, chartTarget, actualSeries, compareSeries, portfolio, market, assetTracks, categories, heroSeries, actuals })}

      ${actualSheet(actuals, heroSeries, categories)}
      ${assetImportReviewSheet(assetTracks)}
      ${scenarioEditorModal(benchmarks)}
    </div>
  `;
  bindFinanceForms();
}

function financePanelContent(ctx) {
  if (STATE.panel === 'asset') {
    return `
      <section class="finance-card finance-asset-card">
        ${assetOperationsCard(ctx.portfolio, ctx.market, ctx.assetTracks)}
      </section>
    `;
  }
  if (STATE.panel === 'benchmark') {
    return `
      <section class="finance-card finance-benchmark-card">
        <div class="finance-card-head">
          <div>
            <div class="h">벤치마크</div>
            <div class="sub">20년 축적표와 하/중/상 경로를 영수증처럼 관리합니다.</div>
          </div>
          <button type="button" class="tds-btn sm secondary" onclick="window.financeToggleScenarioManager()">관리</button>
        </div>
        ${benchmarkScenarioPanel(ctx.benchmarks, ctx.goal)}
        <div class="finance-scenario-manager benchmark-manager">
          <button type="button" class="finance-card-head finance-card-toggle" onclick="window.financeToggleScenarioManager()">
            <div>
              <div class="h">시나리오 추가 / 수정</div>
              <div class="sub">수익률·납입액·기간 가정을 바꿉니다</div>
            </div>
            <span class="chev">${STATE.scenarioManagerOpen ? '⌃' : '⌄'}</span>
          </button>
          ${STATE.scenarioManagerOpen ? scenarioManagerBody(ctx.benchmarks, ctx.goal) : ''}
        </div>
      </section>
    `;
  }
  return `
      <section class="finance-card">
        <div class="finance-card-head">
          <div>
            <div class="h">시뮬레이션</div>
          </div>
          <button type="button" class="tds-btn sm secondary" onclick="window.financeOpenActualSheet()">실적 업데이트</button>
        </div>
        ${financeChart(ctx.chartTarget, ctx.actualSeries[0], ctx.compareSeries)}
        ${scenarioInsightPanel(ctx.chartTarget, STATE.scenarios)}
        <div class="finance-scenario-manager">
          <button type="button" class="finance-card-head finance-card-toggle" onclick="window.financeToggleScenarioManager()">
            <div>
              <div class="h">시뮬레이션 관리</div>
              <div class="sub">가정은 필요할 때만 펼쳐서 추가·수정하고, 목표 기준을 바꿉니다.</div>
            </div>
            <span class="chev">${STATE.scenarioManagerOpen ? '⌃' : '⌄'}</span>
          </button>
          ${STATE.scenarioManagerOpen ? scenarioManagerBody(ctx.benchmarks, ctx.goal) : scenarioManagerSummary(ctx.benchmarks, ctx.goal)}
        </div>
      </section>
  `;
}

function financePanelButton(id, label) {
  return `<button type="button" class="segmented-item ${STATE.panel === id ? 'active' : ''}" onclick="window.financeSelectPanel('${id}')">${label}</button>`;
}

function heroBasisSeries(goal, scenarioSeries) {
  if (goal?.heroBenchmarkId) return scenarioSeries.find(item => item.id === goal.heroBenchmarkId) || null;
  return null;
}

function buildScenarioSeries(benchmarks, targetId) {
  const now = new Date().getFullYear();
  const colors = ['var(--primary)', 'var(--review)', 'var(--gold)', 'var(--primary-dark)', 'var(--text-tertiary)'];
  return benchmarks.map((item, idx) => {
    const startYear = Number(item.startYear) || now;
    const startAmount = Number(item.initialPrincipal) || 0;
    const contributionSchedule = normalizeContributionSchedule(item.contributionSchedule);
    const annualContribution = Number(item.annualContribution) || firstScheduledContribution(contributionSchedule) || 0;
    const contributionTiming = contributionSchedule.length ? 'yearEnd' : (item.contributionTiming || 'monthly');
    const monthlyContribution = contributionTiming === 'yearEnd' ? 0 : Math.round(annualContribution / 12);
    const targetYear = startYear + Math.max(1, Number(item.periodYears) || 1) - 1;
    return {
      key: `scenario-${item.id}`,
      id: item.id,
      label: item.name || `시나리오 ${idx + 1}`,
      color: colors[idx % colors.length],
      target: item.id === targetId,
      inflationRate: Number(item.inflationRate) || 0,
      annualRate: Number(item.annualRate) || 0,
      annualContribution,
      contributionSchedule,
      contributionTiming,
      startAmount,
      monthlyContribution,
      startYear,
      rows: compoundProjection({
        startAmount,
        monthlyContribution,
        annualContribution,
        contributionSchedule,
        contributionTiming,
        annualRate: Number(item.annualRate) || 0,
        startYear,
        targetYear,
      }),
    };
  });
}

function actualGapAtTargetYear(targetSeries, actuals) {
  if (!targetSeries || !actuals.length) return null;
  const latest = actuals.slice().sort((a, b) => (b.year || 0) - (a.year || 0))[0];
  if (!latest) return null;
  const targetRow = targetSeries.rows.find(row => row.year === latest.year);
  if (!targetRow) return null;
  return Number(latest.cumulativeSaved || latest.netWorth || 0) - targetRow.balance;
}

function buildActualSeries(actuals) {
  const rows = actuals
    .slice()
    .sort((a, b) => a.year - b.year)
    .map(item => ({ year: item.year, balance: Number(item.cumulativeSaved || item.netWorth || 0) }));
  return rows.length ? [{ key: 'actuals', label: '실제', color: 'var(--text-tertiary)', actual: true, rows }] : [];
}

function financeChart(targetSeries, actualSeries, compareSeries = null) {
  if (!targetSeries?.rows?.length) return '<div class="empty-state compact"><div>표시할 목표 시나리오가 없습니다</div></div>';
  const realRows = realRowsForSeries(targetSeries);
  const rows = (targetSeries.rows || []).concat(actualSeries?.rows || [], compareSeries?.rows || []);
  if (!rows.length) return '<div class="empty-state compact"><div>표시할 그래프 데이터가 없습니다</div></div>';
  const values = rows.map(row => row.balance).filter(v => v > 0);
  const max = Math.max(...values, 1);
  const minYear = Math.min(...rows.map(row => row.year));
  const maxYear = Math.max(...rows.map(row => row.year));
  const w = 320;
  const h = 184;
  const pad = { top: 14, right: 14, bottom: 22, left: 52 };
  const x = year => pad.left + ((year - minYear) / Math.max(1, maxYear - minYear)) * (w - pad.left - pad.right);
  const y = value => h - pad.bottom - (Math.max(0, value) / max) * (h - pad.top - pad.bottom);
  const ticks = valueTicks(max);
  const targetPoints = targetSeries.rows.map(row => `${x(row.year).toFixed(1)},${y(row.balance).toFixed(1)}`).join(' ');
  const comparePoints = compareSeries?.rows?.length
    ? compareSeries.rows.map(row => `${x(row.year).toFixed(1)},${y(row.balance).toFixed(1)}`).join(' ')
    : '';
  const actualPoints = actualSeries?.rows?.length
    ? actualSeries.rows.map(row => `${x(row.year).toFixed(1)},${y(row.balance).toFixed(1)}`).join(' ')
    : '';
  const markerYears = new Set(milestoneRows(targetSeries.rows).map(row => row.year));
  const compareMarkerYears = new Set(milestoneRows(compareSeries?.rows || []).map(row => row.year));
  const realLast = realRows.at(-1)?.balance || null;
  const targetPointNodes = targetSeries.rows.map(row => {
    const px = x(row.year).toFixed(1);
    const py = y(row.balance).toFixed(1);
    const profit = simulationProfitAt(targetSeries, row);
    const isMilestone = markerYears.has(row.year);
    const title = `${row.year}년 · 만 ${financeAgeAt(row.year)}세 · 이득 ${formatSignedManwonFromKRW(profit)}`;
    return `
      <circle class="finance-dot-target ${isMilestone ? 'milestone' : ''}" cx="${px}" cy="${py}" r="${isMilestone ? '2.8' : '1.7'}"></circle>
      <circle class="finance-point-hit" cx="${px}" cy="${py}" r="${isMilestone ? '7' : '6'}" tabindex="0" data-year="${row.year}" data-balance="${Math.round(row.balance)}" data-profit="${Math.round(profit)}" data-x="${px}" data-y="${py}">
        <title>${escHtml(title)}</title>
      </circle>
    `;
  }).join('');
  const comparePointNodes = compareSeries?.rows?.map(row => {
    const px = x(row.year).toFixed(1);
    const py = y(row.balance).toFixed(1);
    const profit = simulationProfitAt(compareSeries, row);
    const isMilestone = compareMarkerYears.has(row.year);
    const title = `${compareSeries.label} · ${row.year}년 · 만 ${financeAgeAt(row.year)}세 · 이득 ${formatSignedManwonFromKRW(profit)}`;
    return `
      <circle class="finance-dot-compare ${isMilestone ? 'milestone' : ''}" cx="${px}" cy="${py}" r="${isMilestone ? '2.8' : '1.7'}"></circle>
      <circle class="finance-point-hit compare" cx="${px}" cy="${py}" r="${isMilestone ? '7' : '6'}" tabindex="0" data-year="${row.year}" data-balance="${Math.round(row.balance)}" data-profit="${Math.round(profit)}" data-x="${px}" data-y="${py}">
        <title>${escHtml(title)}</title>
      </circle>
    `;
  }).join('') || '';
  return `
    <div class="finance-chart-wrap">
      <div class="finance-chart-legend">
        <span><i></i>${escHtml(targetSeries.label)}</span>
        ${comparePoints ? `<span><i class="compare"></i>${escHtml(compareSeries.label)}</span>` : ''}
        ${actualPoints ? '<span><i class="actual"></i>실제 실적</span>' : ''}
      </div>
      <div class="finance-chart-caption">
        <strong>목표 경로</strong>
        <span>${targetSeries.rows.at(-1)?.year}년 ${formatManwonFromKRW(targetSeries.rows.at(-1)?.balance)}${realLast ? ` · 실질 ${formatManwonFromKRW(realLast)}` : ''}</span>
      </div>
      <svg class="finance-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="재무 목표 그래프">
        ${ticks.map(tick => `
          <line x1="${pad.left}" y1="${y(tick).toFixed(1)}" x2="${w - pad.right}" y2="${y(tick).toFixed(1)}" class="finance-grid-line"></line>
          <text class="finance-y-label" x="${pad.left - 7}" y="${(y(tick) + 3).toFixed(1)}">${formatManwonFromKRW(tick)}</text>
        `).join('')}
        ${actualPoints ? `<polyline points="${actualPoints}" class="finance-line-actual"></polyline>` : ''}
        ${comparePoints ? `<polyline points="${comparePoints}" class="finance-line-compare"></polyline>` : ''}
        <polyline points="${targetPoints}" class="finance-line-target"></polyline>
        ${actualSeries?.rows?.map(row => `<circle class="finance-dot-actual" cx="${x(row.year).toFixed(1)}" cy="${y(row.balance).toFixed(1)}" r="2.4"></circle>`).join('') || ''}
        ${comparePointNodes}
        ${targetPointNodes}
        <g class="finance-chart-tip finance-chart-tip-live" style="display:none"></g>
      </svg>
      <div class="finance-chart-axis"><span>${minYear}</span><span></span><span>${maxYear}</span></div>
    </div>
  `;
}

function chartTooltipSvg(tip, w, h, extraClass = '') {
  const boxW = 132;
  const boxH = 58;
  const x0 = Math.max(54, Math.min(w - boxW - 8, Number(tip.x) - boxW / 2));
  const above = Number(tip.y) > boxH + 28;
  const yRaw = above ? Number(tip.y) - boxH - 10 : Number(tip.y) + 12;
  const y0 = Math.max(10, Math.min(h - boxH - 10, yRaw));
  const pointerX = Math.max(x0 + 12, Math.min(x0 + boxW - 12, Number(tip.x)));
  const pointer = above
    ? `M ${pointerX - 5} ${y0 + boxH - 1} L ${pointerX} ${y0 + boxH + 6} L ${pointerX + 5} ${y0 + boxH - 1} Z`
    : `M ${pointerX - 5} ${y0 + 1} L ${pointerX} ${y0 - 6} L ${pointerX + 5} ${y0 + 1} Z`;
  return `
    <g class="finance-chart-tip ${extraClass}">
      <rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${boxW}" height="${boxH}" rx="9"></rect>
      <path d="${pointer}"></path>
      <text x="${(x0 + 10).toFixed(1)}" y="${(y0 + 15).toFixed(1)}">${tip.year}년 · 만 ${financeAgeAt(tip.year)}세</text>
      <text x="${(x0 + 10).toFixed(1)}" y="${(y0 + 32).toFixed(1)}">누적 ${formatManwonFromKRW(tip.balance)}</text>
      <text x="${(x0 + 10).toFixed(1)}" y="${(y0 + 49).toFixed(1)}">이득 ${formatSignedManwonFromKRW(tip.profit)}</text>
    </g>
  `;
}

function financeAgeAt(year) {
  return 31 + (Number(year) - 2026);
}

function simulationProfitAt(series, row) {
  const startYear = Number(series.startYear || series.rows?.[0]?.year || row.year);
  const invested = (Number(series.startAmount) || 0) + cumulativeContributionUntil(series, Number(row.year), startYear);
  return Math.round((Number(row.balance) || 0) - invested);
}

function contributionForScenarioYear(series, year) {
  const schedule = normalizeContributionSchedule(series?.contributionSchedule);
  if (schedule.length) {
    const matched = schedule.find(entry => {
      const endYear = entry.endYear == null ? Infinity : Number(entry.endYear);
      return year >= entry.startYear && year <= endYear;
    });
    return Math.max(0, Math.round(Number(matched?.annualContribution ?? series?.annualContribution) || 0));
  }
  return Math.max(0, Math.round(Number(series?.annualContribution ?? (Number(series?.monthlyContribution) || 0) * 12) || 0));
}

function cumulativeContributionUntil(series, targetYear, startYear = null) {
  const firstYear = Number(startYear || series?.startYear || series?.rows?.[0]?.year || targetYear);
  let total = 0;
  for (let year = firstYear; year <= targetYear; year += 1) {
    total += contributionForScenarioYear(series, year);
  }
  return total;
}

function realRowsForSeries(item) {
  const inflationRate = Math.max(-0.99, Number(item.inflationRate) || 0) / 100;
  if (!inflationRate) return [];
  const firstYear = item.rows?.[0]?.year || new Date().getFullYear();
  return (item.rows || []).map(row => {
    const years = Math.max(0, row.year - firstYear + 1);
    return { year: row.year, balance: Math.round(row.balance / Math.pow(1 + inflationRate, years)) };
  });
}

function milestoneRows(rows) {
  if (!rows.length) return [];
  const startYear = rows[0].year;
  const lastYear = rows.at(-1).year;
  const picked = rows.filter(row => row.year === startYear || row.year === lastYear || (row.year - startYear + 1) % 5 === 0);
  return picked.filter((row, idx, arr) => arr.findIndex(item => item.year === row.year) === idx);
}

function valueTicks(max) {
  const top = niceCeil(max);
  return [top, top * 0.75, top * 0.5, top * 0.25].map(v => Math.round(v));
}

function niceCeil(value) {
  const raw = Math.max(1, Number(value) || 1);
  const exp = Math.floor(Math.log10(raw));
  const unit = Math.pow(10, exp);
  const scaled = raw / unit;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * unit;
}

function scenarioInsightPanel(series, scenarioSeries = []) {
  if (!series?.rows?.length) return '';
  const realRows = realRowsForSeries(series);
  const realByYear = new Map(realRows.map(row => [row.year, row.balance]));
  const hit = dividendTargetHit(series);
  const scheduleText = contributionScheduleText(series);
  const rows = series.rows.slice(0, 20);
  return `
    <div class="finance-scenario-insight">
      <div class="finance-insight-head">
        <div>
          <strong>20년 축적표</strong>
        </div>
        <div class="finance-dividend-target">${hit ? `${hit.year}년` : '추적 필요'}</div>
      </div>
      ${scenarioTabs(scenarioSeries, series)}
      <div class="finance-scenario-table-wrap">
        <table class="finance-scenario-table">
          <thead>
            <tr>
              <th>연도</th>
              <th>나이</th>
              <th>연 불입</th>
              <th>기말 잔액</th>
              <th>2026년 가치</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${row.year}</td>
                <td>${financeAgeAt(row.year)}</td>
                <td>${formatManwonFromKRW(contributionForScenarioYear(series, row.year))}</td>
                <td>${formatManwonFromKRW(row.balance)}</td>
                <td>${realByYear.has(row.year) ? formatManwonFromKRW(realByYear.get(row.year)) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function scenarioTabs(items, current) {
  const rows = (items || []).filter(item => item?.rows?.length);
  if (rows.length <= 1) return '';
  return `
    <div class="finance-scenario-tabs" aria-label="수익률 시나리오 선택">
      ${rows.map(item => `
        <button type="button" class="${item.id === current.id ? 'active' : ''}" onclick="window.financeSetTargetScenario('${escHtml(item.id)}')">
          <b>${escHtml(scenarioLevelBadge(item))}</b>
          <span>${formatPlainRate(item.annualRate)}%</span>
          <em>${item.id === current.id ? '선택' : ''}</em>
        </button>
      `).join('')}
    </div>
  `;
}

function scenarioLevelBadge(series) {
  const text = `${series?.label || ''}`.toLowerCase();
  const rate = Number(series?.annualRate) || 0;
  if (/(^|\s)(low|하|보수|stress)(\s|$)/.test(text) || rate < 7.5) return '하';
  if (/(^|\s)(high|상|낙관|bull)(\s|$)/.test(text) || rate >= 10) return '상';
  return '중';
}

function scenarioCompactLabel(series) {
  const badge = scenarioLevelBadge(series);
  const label = String(series?.label || '').replace(/\s+/g, ' ').trim();
  if (label) {
    const cleaned = label
      .replace(/20년|시나리오|Scenario|scenario/g, '')
      .replace(/\s*[-–—]\s*/g, ' ')
      .trim();
    return cleaned.length <= 12 ? cleaned : `${badge} ${formatPlainRate(series?.annualRate)}%`;
  }
  return `${badge} ${formatPlainRate(series?.annualRate)}%`;
}

function compactScheduleText(series) {
  const schedule = normalizeContributionSchedule(series?.contributionSchedule);
  if (!schedule.length) return `연 ${formatManwonFromKRW(series?.annualContribution || 0)}`;
  const first = schedule[0];
  const last = schedule[schedule.length - 1];
  if (schedule.length === 1) return `연 ${formatManwonFromKRW(first.annualContribution)}`;
  return `${first.startYear} ${formatManwonFromKRW(first.annualContribution)}→${last.startYear} ${formatManwonFromKRW(last.annualContribution)}`;
}

function dividendTargetHit(series) {
  const startYear = Number(series.startYear || series.rows?.[0]?.year || new Date().getFullYear());
  const rows = compoundProjection({
    startAmount: Number(series.startAmount) || 0,
    monthlyContribution: Number(series.monthlyContribution) || 0,
    annualContribution: Number(series.annualContribution) || 0,
    contributionSchedule: series.contributionSchedule || [],
    contributionTiming: series.contributionTiming || 'monthly',
    annualRate: Number(series.annualRate) || 0,
    startYear,
    targetYear: 2070,
  });
  const inflationRate = Math.max(-0.99, Number(series.inflationRate) || 0) / 100;
  const threshold = 1200000000;
  return rows.map(row => {
    const years = Math.max(0, row.year - startYear + 1);
    return { ...row, realBalance: inflationRate ? Math.round(row.balance / Math.pow(1 + inflationRate, years)) : row.balance };
  }).find(row => row.realBalance >= threshold) || null;
}

function cashflowPanel(actuals, heroSeries, categories) {
  const latest = latestCashflowActual(actuals);
  const targetAnnual = heroSeries ? contributionForScenarioYear(heroSeries, latest?.year || new Date().getFullYear()) : 0;
  const variableAnnual = annualVariableBudget(categories);
  if (!latest) {
    return `
      <button type="button" class="finance-cashflow-strip empty" onclick="window.financeOpenActualSheet()">
        <span>
          <strong>저축 가능액</strong>
          <em>연도별 순수입과 고정지출을 넣으면 계산됩니다.</em>
        </span>
        <b>입력</b>
      </button>
    `;
  }
  const flow = cashflowMath(latest, variableAnnual, targetAnnual);
  return `
    <div class="finance-cashflow-panel">
      <button type="button" class="finance-cashflow-strip" onclick="window.financeOpenActualSheet('${escHtml(latest.id || '')}')">
        <span>
          <strong>최근 실적 기준 저축 가능액</strong>
          <em>${latest.year}년 · 실적 업데이트에서 조정하는 순수입/고정비/생활비 기준</em>
        </span>
        <b class="${flow.gap == null || flow.gap >= 0 ? 'positive' : 'negative'}">${flow.gap == null ? formatManwonFromKRW(flow.savable) : flow.gap >= 0 ? `목표 후 ${formatManwonFromKRW(flow.gap)}` : `${formatManwonFromKRW(Math.abs(flow.gap))} 부족`}</b>
      </button>
    </div>
  `;
}

function assetOperationsCard(portfolio, market, tracks) {
  const updated = market.updatedAt
    ? new Date(market.updatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '시세 연결 전';
  return `
    <div class="asset-ops">
      <div class="asset-ops-summary">
        <div>
          <span>실제 총자산</span>
          <strong>${formatManwonFromKRW(portfolio.totalValue)}</strong>
        </div>
        <div>
          <span>운용자산</span>
          <strong>${formatManwonFromKRW(portfolio.operatingValue || 0)}</strong>
        </div>
        <div>
          <span>운용자산 수익률</span>
          <strong class="${(portfolio.operatingProfit || 0) >= 0 ? 'positive' : 'negative'}">${formatPct(portfolio.operatingReturnPct || 0)} · ${(portfolio.operatingProfit || 0) >= 0 ? '+' : ''}${formatManwonFromKRW(portfolio.operatingProfit || 0)}</strong>
        </div>
      </div>
      <div class="asset-ops-meta">${escHtml(updated)} · USD/KRW ${market.fx ? Math.round(market.fx).toLocaleString('ko-KR') : '-'} · ${escHtml(market.source || '시세 연결 대기')}</div>
      ${portfolioPolicyCard(portfolio)}
      <div class="asset-actions">
        <button type="button" class="tds-btn sm secondary" onclick="window.financeRefreshMarket()">시세 갱신</button>
        <label class="tds-btn sm secondary asset-import-button">
          사진으로 가져오기
          <input type="file" accept="image/*" onchange="window.financeImportAssetImage(this)">
        </label>
        <button type="button" class="tds-btn sm" onclick="window.financeNewAssetTrack()">트랙 추가</button>
      </div>
      ${STATE.assetOpsOpen ? `
        ${assetImportStatus()}
        ${assetNewTrackEditor(tracks)}
      ` : ''}
      <div class="asset-track-list">
        ${portfolio.rows.length ? portfolio.rows.map(row => assetTrackRow(row)).join('') : '<div class="empty-state compact"><div>아직 자산 트랙이 없습니다</div></div>'}
      </div>
      ${assetTrackActionSheet(portfolio.rows)}
    </div>
  `;
}

function benchmarkScenarioPanel(items = [], goal = null) {
  if (!items.length) return '<div class="empty-state compact"><div>아직 벤치마크가 없습니다</div></div>';
  const targetId = goal?.heroBenchmarkId;
  const sorted = items.slice().sort((a, b) => {
    if (a.id === targetId) return -1;
    if (b.id === targetId) return 1;
    return (Number(b.annualRate) || 0) - (Number(a.annualRate) || 0);
  });
  return `
    <div class="benchmark-path-summary-list">
      ${sorted.slice(0, 2).map(item => benchmarkPathSummary(item, item.id === targetId)).join('')}
    </div>
    <div class="benchmark-path-card-list">
      ${sorted.map(item => benchmarkPathCard(item, item.id === targetId)).join('')}
    </div>
  `;
}

function benchmarkPathSummary(item, isTarget) {
  const end = item.rows?.at(-1) || {};
  return `
    <button type="button" class="benchmark-path-summary ${isTarget ? 'selected' : ''}" data-scenario-preview="${escHtml(item.id || '')}">
      <span class="dot"></span>
      <span class="body">
        <strong>${escHtml(item.name || item.label || '시나리오')}${isTarget ? '<em>기준</em>' : ''}</strong>
        <small>연 ${formatPlainRate(item.annualRate)}% · ${escHtml(compactScheduleText(item))} · ${item.startYear || end.year || ''}~${end.year || ''}</small>
      </span>
      <b>${formatManwonFromKRW(end.balance || 0)}<small>${end.year || ''}년 목표</small></b>
    </button>
  `;
}

function benchmarkPathCard(item, isTarget) {
  const startYear = Number(item.startYear || item.rows?.[0]?.year || new Date().getFullYear());
  const end = item.rows?.at(-1) || {};
  const endBalance = Number(end.balance) || 0;
  const current = Math.max(0, Number(item.initialPrincipal) || 0);
  const progress = endBalance ? Math.min(100, Math.max(0, current / endBalance * 100)) : 0;
  const canPreview = item.id && !isTarget;
  const isPreviewing = STATE.compareScenarioId === item.id;
  return `
    <article class="benchmark-path-card ${isTarget ? 'selected' : ''}">
      <div class="benchmark-path-head">
        <div>
          <span class="dot"></span>
          <strong>${escHtml(item.name || item.label || '시나리오')}${isTarget ? '<em>기준</em>' : ''}</strong>
        </div>
        <b>연 ${formatPlainRate(item.annualRate)}%</b>
      </div>
      <div class="benchmark-path-metrics">
        <span><small>납입</small><strong>${escHtml(compactScheduleText(item).replace(/^연\s*/, ''))}</strong></span>
        <span><small>목표</small><strong>${formatManwonFromKRW(endBalance)}</strong></span>
        <span><small>달성년</small><strong>${end.year || '-'}</strong></span>
      </div>
      <div class="benchmark-path-progress">
        <i><b style="width:${progress.toFixed(1)}%"></b></i>
        <em>${startYear}년 시작</em>
        <em>${Math.round(progress)}% · 현재 ${formatManwonFromKRW(current)}</em>
      </div>
      <div class="benchmark-path-actions">
        ${!isTarget ? `<button type="button" onclick="window.financeSetTargetScenario('${escHtml(item.id || '')}')">기준으로</button>` : ''}
        ${canPreview ? `<button type="button" class="${isPreviewing ? 'active' : ''}" data-scenario-preview="${escHtml(item.id || '')}">${isPreviewing ? '비교 해제' : '그래프 비교'}</button>` : ''}
        <button type="button" onclick="window.financeEdit('scenario','${escHtml(item.id || '')}')">수정</button>
      </div>
    </article>
  `;
}

function portfolioPolicyCard(portfolio) {
  const alignment = portfolioAlignment(portfolio);
  if (!alignment.total) {
    return `
      <div class="portfolio-policy-card empty">
        <div class="portfolio-policy-head">
          <div>
            <strong>70/10/15/5 점검</strong>
            <span>운용자산이 입력되면 목표 포트폴리오와의 차이를 계산합니다.</span>
          </div>
        </div>
      </div>
    `;
  }
  const status = alignment.driftPct <= 5 ? '좋음' : alignment.driftPct <= 15 ? '조정 필요' : '크게 이탈';
  return `
    <div class="portfolio-policy-card">
      <div class="portfolio-policy-head">
        <div>
          <strong>70/10/15/5 포트폴리오 점검</strong>
          <span>전세금·보증금 제외 운용자산 기준 · ${alignment.sourceNote}</span>
        </div>
        <em class="${alignment.driftPct <= 5 ? 'positive' : alignment.driftPct <= 15 ? 'warning' : 'negative'}">${status}</em>
      </div>
      <div class="portfolio-policy-total">
        <span>운용자산 ${formatManwonFromKRW(alignment.total)}</span>
        <b>총 이탈 ${formatManwonFromKRW(alignment.driftAmount)} · ${formatSharePct(alignment.driftPct)}</b>
      </div>
      <div class="portfolio-bucket-list">
        ${alignment.buckets.map(bucket => portfolioBucketRow(bucket, alignment.moves)).join('')}
      </div>
      <div class="portfolio-move-box">
        <div class="portfolio-move-title">추천 이동</div>
        ${alignment.moves.length ? alignment.moves.map(move => `
          <div class="portfolio-move-row">
            <span title="${escHtml(move.from)}">${escHtml(compactPortfolioMoveName(move.from))}</span>
            <b>${formatManwonFromKRW(move.amount)}</b>
            <em title="${escHtml(move.to)}">→ ${escHtml(compactPortfolioMoveName(move.to))}</em>
          </div>
        `).join('') : '<div class="portfolio-move-empty">현재 비중은 목표 범위에 가깝습니다. 신규 불입금만 부족 버킷에 넣으면 됩니다.</div>'}
      </div>
    </div>
  `;
}

function portfolioBucketRow(bucket, moves = []) {
  const actual = formatSharePct(bucket.actualPct);
  const target = bucket.targetPct ? formatSharePct(bucket.targetPct) : '0.0%';
  const diff = bucket.diff;
  const diffClass = Math.abs(bucket.diffPct) < 0.5 ? '' : diff > 0 ? 'over' : 'under';
  const actualWidth = Math.min(100, Math.max(0, bucket.actualPct));
  const targetWidth = Math.min(100, Math.max(0, bucket.targetPct || 0));
  const actualClamped = Math.min(100, Math.max(0, actualWidth));
  const gapLeft = Math.min(actualWidth, targetWidth);
  const gapWidth = diffClass === 'under' ? Math.max(0, targetWidth - actualWidth) : 0;
  const moveText = portfolioBucketMoveText(bucket, moves);
  return `
    <div class="portfolio-bucket-row ${diffClass}">
      <div class="portfolio-bucket-main">
        <span><b>${escHtml(bucket.name)}</b><small>현재 ${actual} · 목표 ${target}</small></span>
        <strong>${formatManwonFromKRW(bucket.amount)}</strong>
      </div>
      <div class="portfolio-bucket-bar">
        <i class="actual" style="width:${actualClamped.toFixed(1)}%"></i>
        ${gapWidth > 0 ? `<i class="target-range" style="left:${gapLeft.toFixed(1)}%;width:${gapWidth.toFixed(1)}%"></i>` : ''}
        ${targetWidth > 0 ? `<i class="target-marker" style="left:${targetWidth.toFixed(1)}%"></i>` : ''}
      </div>
      <div class="portfolio-bucket-diff ${diffClass}">
        ${moveText}
      </div>
    </div>
  `;
}

function portfolioBucketMoveText(bucket, moves) {
  if (Math.abs(bucket.diff) < 10000) {
    return '<span>상태</span><strong>목표 근접</strong><em>조정 없음</em>';
  }
  const incoming = moves
    .filter(move => move.toBucketId === bucket.id)
    .reduce((sum, move) => sum + (Number(move.amount) || 0), 0);
  const outgoing = moves
    .filter(move => move.fromBucketId === bucket.id)
    .reduce((sum, move) => sum + (Number(move.amount) || 0), 0);
  if (bucket.diff < 0) {
    const amount = incoming || Math.abs(bucket.diff);
    return `<span>부족</span><strong>${formatManwonFromKRW(amount)} 추가</strong><em>목표까지 ${formatManwonFromKRW(Math.abs(bucket.diff))}</em>`;
  }
  const amount = outgoing || bucket.diff;
  return `<span>초과</span><strong>${formatManwonFromKRW(amount)} 이동</strong><em>초과 ${formatManwonFromKRW(bucket.diff)}</em>`;
}

function portfolioAlignment(portfolio) {
  const items = flattenPortfolioItems(portfolio);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const targetById = Object.fromEntries(TARGET_PORTFOLIO.map(item => [item.id, item]));
  const bucketMap = {};
  for (const target of TARGET_PORTFOLIO) {
    bucketMap[target.id] = { ...target, amount: 0, items: [] };
  }
  bucketMap.other = { id: 'other', name: '기타/미분류', target: 0, short: '기타', buy: '목표 버킷 재분류', amount: 0, items: [] };

  for (const item of items) {
    const bucketId = TARGET_BUCKET_IDS.has(item.bucketId) ? item.bucketId : 'other';
    bucketMap[bucketId].amount += item.amount;
    bucketMap[bucketId].items.push(item);
  }

  const buckets = [...TARGET_PORTFOLIO.map(target => bucketMap[target.id]), bucketMap.other]
    .map(bucket => {
      const targetAmount = Math.round(total * (Number(bucket.target) || 0));
      const targetPct = (Number(bucket.target) || 0) * 100;
      const actualPct = total ? bucket.amount / total * 100 : 0;
      return {
        ...bucket,
        targetAmount,
        targetPct,
        actualPct,
        diff: bucket.amount - targetAmount,
        diffPct: actualPct - targetPct,
      };
    });
  const driftAmount = buckets.reduce((sum, bucket) => sum + Math.abs(bucket.diff), 0) / 2;
  const moves = rebalanceMoves(buckets, targetById);
  const allocatedByWeight = items.some(item => item.allocatedByWeight);
  return {
    total,
    buckets,
    moves,
    driftAmount: Math.round(driftAmount),
    driftPct: total ? driftAmount / total * 100 : 0,
    sourceNote: allocatedByWeight ? '평가액 없는 종목은 입력 비중으로 배분' : '실시간/입력 평가액 기준',
  };
}

function flattenPortfolioItems(portfolio) {
  const items = [];
  for (const row of portfolio?.rows || []) {
    if (!isOperatingAssetRow(row)) continue;
    const holdings = row.holdings || [];
    const valuedHoldings = holdings.filter(item => Number(item.currentValueKRW) > 0);
    if (valuedHoldings.length) {
      for (const holding of valuedHoldings) addPolicyItem(items, row, holding, Number(holding.currentValueKRW) || 0, false);
      continue;
    }
    const weightedHoldings = holdings.filter(item => Number(item.weight) > 0);
    if (weightedHoldings.length && Number(row.currentValue) > 0) {
      const weightSum = weightedHoldings.reduce((sum, item) => sum + Number(item.weight || 0), 0) || weightedHoldings.length;
      for (const holding of weightedHoldings) {
        const share = Number(holding.weight || 0) || 1 / weightedHoldings.length;
        addPolicyItem(items, row, holding, Math.round(Number(row.currentValue) * share / weightSum), true);
      }
      continue;
    }
    if (Number(row.currentValue) > 0) {
      items.push({
        bucketId: classifyPolicyBucket(row),
        amount: Number(row.currentValue) || 0,
        label: row.name || row.id || '운용자산',
        trackName: row.name || '',
        allocatedByWeight: false,
      });
    }
  }
  return items.filter(item => item.amount > 0);
}

function addPolicyItem(items, row, holding, amount, allocatedByWeight) {
  const pieces = policyBucketPieces(holding);
  for (const piece of pieces) {
    items.push({
      bucketId: piece.bucketId,
      amount: Math.round(amount * piece.weight),
      label: holding.name || holding.symbol || row.name || '보유종목',
      trackName: row.name || '',
      symbol: holding.symbol || '',
      allocatedByWeight,
    });
  }
}

function policyBucketPieces(item) {
  const text = policyText(item);
  if (/438100|나스닥100미국채혼합50|나스닥.*미국채.*50/.test(text)) {
    return [{ bucketId: 'nasdaq', weight: 0.5 }, { bucketId: 'other', weight: 0.5 }];
  }
  return [{ bucketId: classifyPolicyBucket(item), weight: 1 }];
}

function classifyPolicyBucket(item) {
  const text = policyText(item);
  if (/(qqqm|qqq|nasdaq|나스닥|379810|133690|367380|448300|미국테크top10|테크top10)/.test(text)) return 'nasdaq';
  if (/(schd|dividend|배당|다우존스|dowjones|dow jones)/.test(text)) return 'dividend';
  if (/(gld|iau|gold|금|골드|krx금|금현물|411060|132030)/.test(text)) return 'gold';
  if (/(tsla|nvda|aapl|msft|amzn|googl|goog|meta|tesla|nvidia|apple|microsoft|amazon|alphabet|테슬라|엔비디아|애플|마이크로소프트|아마존|알파벳|메타|m7|개별)/.test(text)) return 'individual';
  return 'other';
}

function policyText(item) {
  return [item?.id, item?.symbol, item?.name, item?.market, item?.role, item?.desc, item?.broker]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function isOperatingAssetRow(row) {
  const text = `${row?.id || ''} ${row?.name || ''} ${row?.role || ''} ${row?.desc || ''}`.toLowerCase();
  return !/jeonse|전세|보증금|회수예정/.test(text);
}

function rebalanceMoves(buckets, targetById) {
  const sources = [];
  const destinations = buckets
    .filter(bucket => TARGET_BUCKET_IDS.has(bucket.id) && bucket.diff < -10000)
    .map(bucket => ({
      id: bucket.id,
      label: targetById[bucket.id]?.short || bucket.name,
      need: Math.abs(bucket.diff),
    }))
    .sort((a, b) => b.need - a.need);

  for (const bucket of buckets) {
    const excess = bucket.id === 'other' ? bucket.amount : Math.max(0, bucket.diff);
    if (excess <= 10000) continue;
    let remaining = excess;
    const sortedItems = (bucket.items || []).slice().sort((a, b) => b.amount - a.amount);
    for (const item of sortedItems) {
      if (remaining <= 10000) break;
      const amount = Math.min(remaining, item.amount);
      sources.push({
        label: item.symbol || item.label || item.trackName || '운용자산',
        bucketId: bucket.id,
        amount,
      });
      remaining -= amount;
    }
  }

  const moves = [];
  for (const source of sources) {
    let sourceLeft = source.amount;
    for (const dest of destinations) {
      if (sourceLeft <= 10000) break;
      if (dest.need <= 10000) continue;
      const amount = Math.min(sourceLeft, dest.need);
      moves.push({ from: source.label, to: dest.label, fromBucketId: source.bucketId, toBucketId: dest.id, amount: Math.round(amount) });
      sourceLeft -= amount;
      dest.need -= amount;
    }
  }
  return moves.filter(move => move.amount >= 10000).slice(0, 6);
}

function compactPortfolioMoveName(value) {
  const raw = String(value || '').trim();
  const text = raw
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*·\s*/g, '·')
    .replace(/\(.*?\)/g, '')
    .trim();
  const lower = text.toLowerCase();
  if (/438100\.ks|379810|133690|367380|448300|kodex.*나스닥|미국나스닥100tr|qqqm|qqq|nasdaq|나스닥/.test(lower)) return '나스닥100 ETF';
  if (/schd|배당|다우존스/.test(lower)) return '배당성장 ETF';
  if (/iau|gld|krx금|금현물|gold|골드|^금$/.test(lower)) return '금 ETF';
  if (/tsla|테슬라/.test(lower)) return '테슬라';
  if (/nvda|엔비디아/.test(lower)) return '엔비디아';
  if (/aapl|애플/.test(lower)) return '애플';
  if (/msft|마이크로소프트/.test(lower)) return '마이크로소프트';
  if (/amzn|아마존/.test(lower)) return '아마존';
  if (/googl|goog|알파벳|구글/.test(lower)) return '알파벳';
  if (/meta|메타/.test(lower)) return '메타';
  return text.length > 12 ? `${text.slice(0, 11)}…` : text;
}

function assetImportStatus() {
  const state = STATE.assetImport;
  if (!state) return '';
  if (state.status === 'loading') {
    return '<div class="asset-import-status"><div class="loading-spinner"></div><span>사진에서 자산 항목을 읽고 있습니다</span></div>';
  }
  if (state.status === 'done') {
    const added = state.added || 0;
    const skipped = state.skipped || 0;
    return `
      <div class="asset-import-status done">
        <strong>사진 반영 완료</strong>
        <span>${added}개 등록 · ${skipped}개 중복 제외</span>
      </div>
    `;
  }
  if (state.status === 'review') {
    const count = state.parsed?.positions?.length || 0;
    return `<div class="asset-import-status done"><strong>사진 분석 완료</strong><span>${count}개 항목의 저장 트랙을 선택해주세요</span></div>`;
  }
  if (state.status === 'error') {
    return `<div class="asset-import-status error"><strong>사진 분석 실패</strong><span>${escHtml(state.message || '다시 시도해주세요')}</span></div>`;
  }
  return '';
}

function assetImportReviewSheet(tracks) {
  const state = STATE.assetImport;
  if (state?.status !== 'review') return '';
  const positions = Array.isArray(state.parsed?.positions) ? state.parsed.positions : [];
  return `
    <div class="finance-sheet open" role="dialog" aria-modal="true">
      <div class="finance-sheet-panel">
        <div class="finance-sheet-handle"></div>
        <div class="finance-sheet-head">
          <div>
            <strong>사진에서 읽은 자산</strong>
            <span>저장할 트랙을 직접 골라주세요. 중복으로 보이는 항목은 저장 시 자동 제외합니다.</span>
          </div>
          <button type="button" onclick="window.financeCancelAssetImport()">닫기</button>
        </div>
        <form id="finance-asset-import-form" class="asset-import-review">
          ${positions.length ? positions.map((position, idx) => assetImportReviewRow(position, idx, tracks)).join('') : '<div class="empty-state compact"><div>읽어낸 항목이 없습니다</div></div>'}
          <button class="tds-btn full" type="submit" ${positions.length ? '' : 'disabled'}>선택한 트랙에 저장</button>
        </form>
      </div>
    </div>
  `;
}

function assetImportReviewRow(position, idx, tracks) {
  const suggested = pickTrackForPosition(position, tracks)?.id || tracks[0]?.id || '';
  const profit = Number(position.profitKRW);
  return `
    <div class="asset-import-row">
      <input type="hidden" name="positionIndex" value="${idx}">
      <div class="asset-import-row-main">
        <strong>${escHtml(position.name || position.symbol || '이름 없음')}</strong>
        <span>${formatManwonFromKRW(position.currentValueKRW || 0)}${Number.isFinite(profit) ? ` · ${profit >= 0 ? '+' : ''}${formatManwonFromKRW(profit)}` : ''}${Number.isFinite(Number(position.returnPct)) ? ` · ${formatPct(position.returnPct)}` : ''}</span>
        <em>${escHtml([position.broker, position.symbol, position.assetClass].filter(Boolean).join(' · '))}</em>
      </div>
      <label>
        <span>저장 트랙</span>
        <select name="trackId-${idx}">
          <option value="">저장 안 함</option>
          ${tracks.map(track => `<option value="${escHtml(track.id)}" ${track.id === suggested ? 'selected' : ''}>${escHtml(track.name || track.id)}</option>`).join('')}
        </select>
      </label>
    </div>
  `;
}

function assetNewTrackEditor(tracks) {
  if (STATE.editAssetTrackId !== '__new__') return '';
  const item = { order: tracks.length + 1 };
  return `
    <form id="finance-asset-track-form" class="finance-inline-form asset-editor">
      <input type="hidden" name="id" value="${escHtml(item.id || '')}">
      <div class="finance-goal-grid">
        ${inputField('트랙명', 'name', item.name || '', '예: 올웨더 실험')}
        ${inputField('역할', 'role', item.role || '', '예: 연금 계좌 운용')}
        ${inputField('설명', 'desc', item.desc || '', '예: 미국국채/금/나스닥')}
        ${inputField('순서', 'order', item.order || tracks.length + 1)}
      </div>
      <button class="tds-btn full" type="submit">트랙 추가</button>
    </form>
  `;
}

function assetTrackRow(row) {
  const holdings = row.holdings || [];
  const profit = Number(row.profit) || 0;
  return `
    <div class="asset-track" data-asset-track-id="${escHtml(row.id)}">
      <div class="asset-track-head">
        <div class="asset-track-title">
          <strong>${escHtml(row.name)}</strong>
        </div>
        <div class="asset-track-value">
          <b>${row.currentValue ? formatManwonFromKRW(row.currentValue) : '금액 설정 필요'}</b>
          <em>${row.returnPct == null ? '-' : `${formatPct(row.returnPct)} · ${profit >= 0 ? '+' : ''}${formatManwonFromKRW(profit)}`}</em>
        </div>
        <button type="button" class="asset-track-menu-btn" onclick="window.financeOpenAssetTrackMenu('${row.id}')" aria-label="${escHtml(row.name)} 설정">⚙</button>
      </div>
      ${holdings.length ? `
        <div class="asset-holding-list">
          ${holdings.map((item, idx) => holdingQuoteRow(row, item, idx)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function assetTrackActionSheet(rows = []) {
  const row = rows.find(item => item.id === STATE.assetTrackMenuId);
  if (!row) return '';
  const profit = Number(row.profit) || 0;
  const editingTrack = STATE.trackRenameId === row.id;
  const editingHolding = STATE.editHoldingTrackId === row.id;
  return `
    <div class="finance-sheet asset-track-action-sheet open" onclick="if(event.target===this) window.financeCloseAssetTrackMenu()">
      <div class="finance-sheet-panel">
        <div class="finance-sheet-handle"></div>
        <div class="asset-track-action-head">
          <div>
            <strong>${escHtml(row.name)}</strong>
            <span>${row.returnPct == null ? '수익률 대기' : `${formatPct(row.returnPct)} · ${profit >= 0 ? '+' : ''}${formatManwonFromKRW(profit)}`}</span>
          </div>
          <b>${row.currentValue ? formatManwonFromKRW(row.currentValue) : '금액 설정 필요'}</b>
        </div>
        <div class="asset-track-action-grid">
          <button type="button" onclick="window.financeEditAssetTrack('${row.id}')">트랙 수정</button>
          <button type="button" onclick="window.financeNewHolding('${row.id}')">종목 추가</button>
          <button type="button" class="danger" onclick="window.financeDeleteAssetTrack('${row.id}')">삭제</button>
        </div>
        ${editingTrack ? assetTrackRenameForm(row) : ''}
        ${editingHolding ? holdingEditor(row) : ''}
      </div>
    </div>
  `;
}

function assetTrackRenameForm(row) {
  return `
    <form id="finance-asset-track-rename-form" class="asset-rename-form">
      <input type="hidden" name="id" value="${escHtml(row.id)}">
      <input class="tds-input" name="name" value="${escHtml(row.name || '')}" placeholder="트랙명">
      <input class="tds-input" name="role" value="${escHtml(row.role || '')}" placeholder="역할">
      <input class="tds-input" name="desc" value="${escHtml(row.desc || '')}" placeholder="설명">
      <button type="submit">저장</button>
      <button type="button" onclick="window.financeCancelAssetTrackEdit()">취소</button>
    </form>
  `;
}

function holdingEditor(track) {
  const item = Number.isInteger(STATE.editHoldingIndex) ? (track.holdings || [])[STATE.editHoldingIndex] || {} : {};
  return `
    <form id="finance-holding-form" class="finance-inline-form asset-editor compact">
      <input type="hidden" name="trackId" value="${escHtml(track.id)}">
      <input type="hidden" name="holdingIndex" value="${Number.isInteger(STATE.editHoldingIndex) ? STATE.editHoldingIndex : ''}">
      <div class="asset-symbol-search">
        <input class="tds-input" id="asset-symbol-query" placeholder="티커 검색: QQQ, 438100, 금 ETF" value="${escHtml(item.symbol || '')}">
        <button type="button" class="tds-btn sm secondary" onclick="window.financeSearchTicker()">검색</button>
      </div>
      <div class="ticker-results" id="asset-ticker-results"></div>
      <div class="finance-goal-grid">
        ${inputField('티커', 'symbol', item.symbol || '', '예: QQQ 또는 438100.KS')}
        ${inputField('종목명', 'name', item.name || '', '예: Nasdaq ETF')}
        ${inputField('시장', 'market', item.market || 'KR', 'KR 또는 US')}
        ${inputField('수량', 'quantity', item.quantity || '')}
        ${inputField('매수가', 'avgPrice', item.avgPrice || '', 'USD 단가 / 원화 단가 / 총 매입금액')}
        ${inputField('매수일', 'purchaseDate', item.purchaseDate || '', '모르면 비워두기')}
        ${inputField('구매처', 'broker', item.broker || '', '예: 미래에셋, 토스증권')}
      </div>
      <button class="tds-btn full" type="submit">${Number.isInteger(STATE.editHoldingIndex) ? '종목 수정' : '종목 추가'}</button>
    </form>
  `;
}

function holdingQuoteRow(track, item, idx) {
  const returnPct = Number(item.returnPct);
  const dailyPct = Number(item.quote?.changePct);
  const lotMeta = [
    item.purchaseDate || '',
    item.broker || '',
    item.avgFx && item.currency === 'USD' ? `매수환율 ${Math.round(item.avgFx).toLocaleString('ko-KR')}원` : '',
    avgPriceModeLabel(item),
    item.quote?.price ? `현재가 ${formatQuotePrice(item.quote)}` : '',
    Number.isFinite(dailyPct) ? `전일 ${formatPct(dailyPct)}` : '',
    Number.isFinite(Number(item.portfolioWeight)) ? `비중 ${formatSharePct(item.portfolioWeight)}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="asset-holding" draggable="true" data-source-track-id="${escHtml(track.id)}" data-holding-index="${idx}">
      <span>${escHtml(item.name)} <small>${escHtml(item.symbol)}${lotMeta ? ` · ${escHtml(lotMeta)}` : ''}</small>${item.fxPnL ? `<small>환차익 ${formatManwonFromKRW(item.fxPnL)}</small>` : ''}</span>
      <strong>${item.currentValueKRW ? formatManwonFromKRW(item.currentValueKRW) : (item.quote?.price ? formatQuotePrice(item.quote) : '시세 대기')}</strong>
      <em>${Number.isFinite(returnPct) ? formatPct(returnPct) : '-'}</em>
      <button type="button" onclick="window.financeEditHolding('${track.id}',${idx})">수정</button>
      <button type="button" class="danger" onclick="window.financeDeleteHolding('${track.id}',${idx})">삭제</button>
    </div>
  `;
}

function avgPriceModeLabel(item) {
  if (item.avgPriceMode === 'BOND_PRICE_100') return '액면 100달러당 가격';
  if (item.avgPriceMode === 'TOTAL_KRW') return '총 매입금액 기준';
  if (item.avgPriceMode === 'KRW_UNIT' && item.currency === 'USD') return '원화 단가';
  if (item.avgPriceMode === 'USD_UNIT') return '달러 단가';
  return '';
}

function formatQuotePrice(quote) {
  const price = Number(quote.price) || 0;
  if (quote.currency === 'KRW') return `${Math.round(price).toLocaleString('ko-KR')}원`;
  if (quote.currency === 'USD') return `$${price.toFixed(2)}`;
  return price.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function formatSignedManwonFromKRW(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? '+' : ''}${formatManwonFromKRW(n)}`;
}

function formatPlainKRW(value) {
  return Math.round(Number(value) || 0).toLocaleString('ko-KR');
}

function latestActualText(actuals) {
  const latest = latestActualRecord(actuals);
  const value = Number(latest?.cumulativeSaved || latest?.netWorth || 0);
  return value ? formatManwonFromKRW(value) : '-';
}

function formatSharePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(1)}%`;
}

function formatPlainRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function normalizeContributionSchedule(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => {
      const startYear = Math.round(Number(entry.startYear) || 0);
      const rawEndYear = Number(entry.endYear);
      const endYear = rawEndYear ? Math.max(startYear, Math.round(rawEndYear)) : null;
      const annualContribution = Math.max(0, Math.round(Number(entry.annualContribution ?? entry.amount) || 0));
      return { startYear, endYear, annualContribution };
    })
    .filter(entry => entry.startYear && entry.annualContribution)
    .sort((a, b) => a.startYear - b.startYear);
}

function firstScheduledContribution(schedule) {
  return normalizeContributionSchedule(schedule)[0]?.annualContribution || 0;
}

function contributionScheduleText(series) {
  const schedule = normalizeContributionSchedule(series?.contributionSchedule);
  if (!schedule.length) return `연 ${formatManwonFromKRW(series?.annualContribution || 0)} 불입`;
  return schedule
    .map(entry => `${entry.startYear}${entry.endYear ? `~${entry.endYear}` : '~'} ${formatManwonFromKRW(entry.annualContribution)}`)
    .join(' · ');
}

function latestCashflowActual(actuals) {
  return actuals
    .filter(item => Number(item.inflow) || Number(item.fixedOutflow) || Number(item.monthlyExpense))
    .slice()
    .sort((a, b) => (a.year || 0) - (b.year || 0))
    .at(-1) || null;
}

function latestActualRecord(actuals) {
  return actuals
    .slice()
    .sort((a, b) => (a.year || 0) - (b.year || 0))
    .at(-1) || null;
}

function cashflowMath(actual, variableAnnual, targetAnnual) {
  const inflow = Number(actual.inflow) || 0;
  const fixed = Number(actual.fixedOutflow) || 0;
  const monthlyExpense = Number(actual.monthlyExpense) || 0;
  const effectiveVariableAnnual = monthlyExpense > 0 ? monthlyExpense * 12 : variableAnnual;
  const afterFixed = inflow - fixed;
  const savable = afterFixed - effectiveVariableAnnual;
  const gap = targetAnnual ? savable - targetAnnual : null;
  return {
    inflow,
    fixed,
    monthlyExpense,
    variableAnnual: effectiveVariableAnnual,
    budgetVariableAnnual: variableAnnual,
    variableSource: monthlyExpense > 0 ? '실적 입력 월 지출' : '예산 카테고리',
    afterFixed,
    savable,
    gap,
  };
}

function annualVariableBudget(categories) {
  const monthKey = fmtMonthKey(new Date());
  return (categories || [])
    .filter(cat => cat.kind === 'expense' && (cat.budgetRhythm || 'spread') !== 'fixed')
    .reduce((sum, cat) => sum + (Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0), 0) * 12;
}

function cashflowEquation(latest, variableAnnual, targetAnnual) {
  const flow = cashflowMath(latest, variableAnnual, targetAnnual);
  return `
    <div class="finance-cashflow-equation">
      <div class="finance-cashflow-help">계산 기준: 연간 순수입에서 고정비와 생활/감각 지출을 뺀 뒤, 목표 시나리오의 연간 저축액과 비교합니다. 생활/감각 지출은 ${escHtml(flow.variableSource)} 기준입니다.</div>
      ${equationRow('연간 순수입', flow.inflow, 'base')}
      ${equationRow('연간 고정비', -flow.fixed)}
      ${equationRow('생활/감각 지출', -flow.variableAnnual)}
      ${equationRow('저축 가능 예상액', flow.savable, 'result')}
      ${targetAnnual ? equationRow('시나리오 필요 저축액', -targetAnnual) : ''}
      ${targetAnnual ? equationRow('남거나 부족한 돈', flow.gap, 'final') : ''}
    </div>
  `;
}

function equationRow(label, amount, tone = '') {
  const sign = amount < 0 ? '-' : tone === 'base' ? '' : amount > 0 ? '+' : '';
  return `
    <div class="finance-equation-row ${tone}">
      <span>${label}</span>
      <strong>${sign}${formatManwonFromKRW(Math.abs(amount))}</strong>
    </div>
  `;
}

function cashflowHistory(rows, variableAnnual, targetAnnual) {
  const recent = rows.slice(-4).reverse();
  return `
    <div class="finance-cashflow-history" aria-label="최근 현실 여력">
      ${recent.map(item => {
        const flow = cashflowMath(item, variableAnnual, targetAnnual);
        return `
          <div class="finance-cashflow-year">
            <div class="finance-cashflow-year-head">
              <span>${item.year}</span>
              <strong>${formatManwonFromKRW(flow.savable)}</strong>
              <button type="button" onclick="window.financeEdit('actual','${item.id}')">수정</button>
            </div>
            <em>순수입 ${formatManwonFromKRW(flow.inflow)} - 고정비 ${formatManwonFromKRW(flow.fixed)} - 생활/감각 지출 ${formatManwonFromKRW(flow.variableAnnual)}</em>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function scenarioManagerSummary(items, goal) {
  const target = items.find(item => item.id === goal?.heroBenchmarkId);
  return `
    <div class="finance-scenario-summary">
      <span>${items.length ? `${items.length}개 시뮬레이션` : '아직 시뮬레이션 없음'}</span>
      <strong>${target ? `${escHtml(target.name || '목표 시뮬레이션')} 기준` : '목표 미설정'}</strong>
    </div>
  `;
}

function scenarioManagerBody(items, goal) {
  return `
    <div class="finance-scenario-manager-body">
      <button type="button" class="scenario-add-button" onclick="window.financeNewScenario()">시뮬레이션 추가</button>
      ${scenarioManagerSummary(items, goal)}
      ${scenarioManagerList(items, goal)}
    </div>
  `;
}

function scenarioManagerList(items, goal) {
  if (!items.length) return '<div class="empty-state compact"><div>아직 시뮬레이션이 없습니다</div></div>';
  return `
    <div class="scenario-manager-list">
      ${items.map(item => scenarioManagerRow(item, goal)).join('')}
    </div>
  `;
}

function scenarioManagerRow(item, goal) {
  const isTarget = goal?.heroBenchmarkId === item.id;
  const isPreviewing = STATE.compareScenarioId === item.id;
  const title = item.name || '시뮬레이션';
  const meta = `${item.startYear}년부터 ${item.periodYears}년 · ${contributionScheduleText(item)} · ${item.annualRate}%`;
  return `
    <article class="scenario-manager-row ${isTarget ? 'target' : ''}">
      <div>
        <strong>${escHtml(title)}${isTarget ? '<small class="target-badge">기준</small>' : ''}</strong>
        <span>${escHtml(meta)}</span>
      </div>
      <div class="scenario-manager-actions">
        ${!isTarget ? `<button type="button" class="primary" onclick="window.financeSetTargetScenario('${escHtml(item.id)}')">기준</button>` : ''}
        ${!isTarget ? `<button type="button" class="${isPreviewing ? 'active' : ''}" data-scenario-preview="${escHtml(item.id)}">${isPreviewing ? '해제' : '비교'}</button>` : ''}
        <button type="button" onclick="window.financeEdit('scenario','${escHtml(item.id)}')">수정</button>
        <button type="button" class="danger" onclick="window.financeDelete('scenario','${escHtml(item.id)}')">삭제</button>
      </div>
    </article>
  `;
}

function scenarioEditorModal(items) {
  if (!STATE.editScenarioId) return '';
  const item = items.find(x => x.id === STATE.editScenarioId) || {};
  return `
    <div class="finance-sheet finance-scenario-editor-sheet open" role="dialog" aria-modal="true" onclick="if(event.target===this)window.financeCloseScenarioEditor()">
      <div class="finance-sheet-panel" onclick="event.stopPropagation()">
        <div class="finance-sheet-handle"></div>
        <div class="finance-sheet-head">
          <div>
            <strong>${item.id ? '시뮬레이션 수정' : '시뮬레이션 추가'}</strong>
            <span>수익률, 기간, 불입 스케줄을 조정합니다.</span>
          </div>
          <button type="button" onclick="window.financeCloseScenarioEditor()">닫기</button>
        </div>
        ${scenarioEditor(items)}
      </div>
    </div>
  `;
}

function scenarioRow(item, targetAmount, targetId, chartTargetId) {
  const last = item.rows.at(-1)?.balance || 0;
  const realLast = item.target ? realRowsForSeries(item).at(-1)?.balance : null;
  const gap = last - targetAmount;
  const isTarget = item.id === targetId;
  const canPreview = item.id && item.id !== chartTargetId;
  const isPreviewing = STATE.compareScenarioId === item.id;
  return `
    <div class="scenario-row ${isTarget ? 'selected' : ''}">
      <span class="dot" style="background:${item.color}"></span>
      <span class="name">${escHtml(item.label)}${isTarget ? '<small>목표</small>' : ''}</span>
      <strong>${formatManwonFromKRW(last)}${realLast ? `<small>실질 ${formatManwonFromKRW(realLast)}</small>` : ''}</strong>
      <span class="scenario-row-tail">
        <em class="${gap >= 0 ? 'positive' : 'negative'}">${targetAmount ? `${gap >= 0 ? '+' : '-'}${formatManwonFromKRW(Math.abs(gap))}` : '-'}</em>
        ${canPreview ? `<button type="button" class="${isPreviewing ? 'active' : ''}" data-scenario-preview="${escHtml(item.id)}">${isPreviewing ? '보기 해제' : '그래프에서 보기'}</button>` : ''}
      </span>
    </div>
  `;
}

function scenarioEditor(items) {
  const item = items.find(x => x.id === STATE.editScenarioId) || {};
  return `
    <form id="finance-scenario-form" class="finance-inline-form">
      <input type="hidden" name="id" value="${escHtml(item.id || '')}">
      <div class="finance-goal-grid">
        ${inputField('이름', 'name', item.name || '', '예: 안정형 5%')}
        ${inputField('시작연도', 'startYear', item.startYear || new Date().getFullYear())}
        ${inputField('기간', 'periodYears', item.periodYears || 10)}
        ${inputField('연 수익률', 'annualRate', item.annualRate ?? 5)}
        ${inputField('물가상승률', 'inflationRate', item.inflationRate ?? 2.5)}
        ${inputField('초기 원금', 'initialPrincipal', krwToManwon(item.initialPrincipal))}
        ${inputField('기본 연간 불입금', 'annualContribution', krwToManwon(item.annualContribution), '스케줄을 비우면 이 금액을 매월 분산')}
      </div>
      ${contributionScheduleEditor(item)}
      <button class="tds-btn full" type="submit">${item.id ? '시뮬레이션 수정' : '시뮬레이션 추가'}</button>
    </form>
  `;
}

function contributionScheduleEditor(item) {
  const schedule = normalizeContributionSchedule(item.contributionSchedule);
  const rows = schedule.length ? schedule : [{ startYear: item.startYear || new Date().getFullYear(), endYear: '', annualContribution: '' }];
  return `
    <div class="finance-contribution-schedule">
      <div class="finance-contribution-head">
        <div>
          <strong>연도별 불입 스케줄</strong>
          <span>입력하면 해당 구간의 연간 불입금이 기말에 반영됩니다. 종료연도를 비우면 계속 적용됩니다.</span>
        </div>
        <button type="button" data-add-contribution-row>구간 추가</button>
      </div>
      <div class="finance-contribution-rows" id="finance-contribution-rows">
        ${rows.map(entry => contributionScheduleRow(entry)).join('')}
      </div>
    </div>
  `;
}

function contributionScheduleRow(entry = {}) {
  return `
    <div class="finance-contribution-row">
      <label>
        <span>시작</span>
        <input class="tds-input" name="scheduleStartYear" value="${escHtml(String(entry.startYear || ''))}" inputmode="numeric" placeholder="2026">
      </label>
      <label>
        <span>종료</span>
        <input class="tds-input" name="scheduleEndYear" value="${escHtml(String(entry.endYear || ''))}" inputmode="numeric" placeholder="비우면 계속">
      </label>
      <label>
        <span>연 불입(만원)</span>
        <input class="tds-input" name="scheduleContribution" value="${escHtml(String(entry.annualContribution ? krwToManwon(entry.annualContribution) : ''))}" inputmode="decimal" placeholder="2000">
      </label>
      <button type="button" data-remove-contribution-row>삭제</button>
    </div>
  `;
}

function actualEditor(items, heroSeries, categories) {
  const item = items.find(x => x.id === STATE.editActualId) || {};
  const variableAnnual = annualVariableBudget(categories);
  const targetAnnual = heroSeries ? contributionForScenarioYear(heroSeries, Number(item.year) || new Date().getFullYear()) : 0;
  return `
    <form id="finance-actual-form" class="finance-inline-form">
      <input type="hidden" name="id" value="${escHtml(item.id || '')}">
      <div class="finance-form-section-title">자산 실적</div>
      <div class="finance-goal-grid">
        ${inputField('연도', 'year', item.year || new Date().getFullYear())}
        ${inputField('누적 저축/투자', 'cumulativeSaved', krwToManwon(item.cumulativeSaved))}
        ${inputField('순자산', 'netWorth', krwToManwon(item.netWorth))}
        ${inputField('비상금', 'emergencyFund', krwToManwon(item.emergencyFund))}
      </div>
      <div class="finance-form-section-title">저축 가능액 계산</div>
      <div class="finance-goal-grid">
        ${inputField('연간 순수입', 'inflow', krwToManwon(item.inflow))}
        ${inputField('연간 고정지출', 'fixedOutflow', krwToManwon(item.fixedOutflow))}
        ${inputField('월 생활/감각 지출', 'monthlyExpense', krwToManwon(item.monthlyExpense), '비우면 예산 카테고리 기준')}
      </div>
      ${actualEditorPreview(item, variableAnnual, targetAnnual)}
      <button class="tds-btn full" type="submit">${item.id ? '실적 수정' : '실적 추가'}</button>
    </form>
  `;
}

function actualEditorPreview(item, variableAnnual, targetAnnual) {
  const hasInputs = Number(item.inflow) || Number(item.fixedOutflow) || Number(item.monthlyExpense);
  if (!hasInputs) {
    return `
      <div class="finance-actual-preview empty">
        <span>저축 가능액 미리보기</span>
        <strong>순수입·고정지출·월 생활/감각 지출을 입력하면 저장 후 계산됩니다.</strong>
      </div>
    `;
  }
  const flow = cashflowMath(item, variableAnnual, targetAnnual);
  return `
    <div class="finance-actual-preview">
      <span>${item.year || new Date().getFullYear()}년 저축 가능액 · ${escHtml(flow.variableSource)} 기준</span>
      <strong>${formatManwonFromKRW(flow.savable)}</strong>
      <em>${targetAnnual ? flow.gap >= 0 ? `목표 저축 후 ${formatManwonFromKRW(flow.gap)} 여유` : `목표 저축까지 ${formatManwonFromKRW(Math.abs(flow.gap))} 부족` : '목표 시나리오를 정하면 차이를 비교합니다'}</em>
    </div>
  `;
}

function actualNewEntryCard(actuals, heroSeries, categories) {
  if (STATE.editActualId === '__new__') {
    return `
      <div class="finance-actual-new open">
        <div class="finance-actual-new-head">
          <div>
            <strong>새 실적 입력</strong>
            <span>자산 그래프와 저축 가능액 기준에 반영할 연도별 실적을 추가합니다.</span>
          </div>
          <button type="button" onclick="window.financeCancelActualEdit()">닫기</button>
        </div>
        ${actualEditor(actuals, heroSeries, categories)}
      </div>
    `;
  }
  return `
    <button type="button" class="finance-actual-new" onclick="window.financeNewActual()">
      <span class="mark">+</span>
      <span class="body">
        <strong>새로 입력하기</strong>
        <em>연간 순수입, 고정비, 자산 실적을 한 번에 추가합니다.</em>
      </span>
      <span class="arrow">열기</span>
    </button>
  `;
}

function actualYearList(actuals, heroSeries, categories) {
  const rows = actuals
    .slice()
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  if (!rows.length) {
    return '<div class="empty-state compact"><div>아직 실적이 없습니다</div></div>';
  }
  return `<div class="finance-actual-list">${rows.map(item => actualYearCard(item, heroSeries, categories)).join('')}</div>`;
}

function actualYearCard(item, heroSeries, categories) {
  const year = Number(item.year) || new Date().getFullYear();
  const variableAnnual = annualVariableBudget(categories);
  const targetAnnual = heroSeries ? contributionForScenarioYear(heroSeries, year) : 0;
  const flow = cashflowMath(item, variableAnnual, targetAnnual);
  const isOpen = STATE.expandedActualId === item.id;
  const isEditing = STATE.editActualId === item.id;
  const flowTone = flow.gap == null || flow.gap >= 0 ? 'positive' : 'negative';
  const flowLabel = flow.gap == null
    ? formatManwonFromKRW(flow.savable)
    : flow.gap >= 0
      ? `목표 후 ${formatManwonFromKRW(flow.gap)}`
      : `${formatManwonFromKRW(Math.abs(flow.gap))} 부족`;
  return `
    <div class="finance-actual-year ${isOpen ? 'open' : ''}" data-actual-id="${escHtml(item.id || '')}">
      <button type="button" class="finance-actual-year-head" aria-expanded="${isOpen ? 'true' : 'false'}" onclick="window.financeToggleActualYear('${escHtml(item.id || '')}')">
        <span>
          <strong>${year}년 실적</strong>
          <em>순자산 ${formatManwonFromKRW(item.netWorth || 0)} · 누적 저축/투자 ${formatManwonFromKRW(item.cumulativeSaved || 0)}</em>
        </span>
        <b class="${flowTone}">${flowLabel}</b>
      </button>
      ${actualYearDetail(item, flow, variableAnnual, targetAnnual, heroSeries, categories, isEditing)}
    </div>
  `;
}

function actualYearDetail(item, flow, variableAnnual, targetAnnual, heroSeries, categories, isEditing) {
  if (isEditing) {
    return `
      <div class="finance-actual-year-detail editing">
        ${actualEditor([item], heroSeries, categories)}
      </div>
    `;
  }
  return `
    <div class="finance-actual-year-detail">
      <div class="finance-actual-metrics">
        ${actualMetric('순자산', item.netWorth)}
        ${actualMetric('누적 저축/투자', item.cumulativeSaved)}
        ${actualMetric('비상금', item.emergencyFund)}
        ${actualMetric(flow.variableSource, flow.variableAnnual)}
      </div>
      ${cashflowEquation(item, variableAnnual, targetAnnual)}
      <div class="finance-row-actions actual-actions">
        <button type="button" onclick="window.financeEditActual('${escHtml(item.id || '')}')">수정</button>
        <button type="button" class="danger" onclick="window.financeDelete('actual','${escHtml(item.id || '')}')">삭제</button>
      </div>
    </div>
  `;
}

function actualMetric(label, amount) {
  return `
    <div class="finance-actual-metric">
      <span>${escHtml(label)}</span>
      <strong>${formatManwonFromKRW(amount || 0)}</strong>
    </div>
  `;
}

function actualSheet(actuals, heroSeries, categories) {
  return `
    <div class="finance-sheet ${STATE.actualSheetOpen ? 'open' : ''}" id="finance-actual-sheet" onclick="if(event.target===this)window.financeCloseActualSheet()">
      <div class="finance-sheet-panel" onclick="event.stopPropagation()">
        <div class="finance-sheet-handle"></div>
        <div class="finance-card-head">
          <div>
            <div class="h">실제 실적 업데이트</div>
            <div class="sub">자산 그래프와 저축 가능액을 한 곳에서 관리합니다.</div>
          </div>
          <button type="button" class="tds-icon-btn sm" onclick="window.financeCloseActualSheet()">×</button>
        </div>
        ${actualNewEntryCard(actuals, heroSeries, categories)}
        ${actualYearList(actuals, heroSeries, categories)}
      </div>
    </div>
  `;
}

function actualSheetCashflowSummary(latest, variableAnnual, targetAnnual) {
  if (!latest) {
    return `
      <div class="finance-sheet-summary empty">
        <strong>저축 가능액 기준 없음</strong>
        <span>연간 순수입, 고정지출, 월 생활/감각 지출을 넣으면 목표 저축액과 바로 비교됩니다.</span>
      </div>
    `;
  }
  const flow = cashflowMath(latest, variableAnnual, targetAnnual);
  return `
    <div class="finance-sheet-summary">
      <div class="finance-sheet-summary-head">
        <div>
          <strong>최근 실적 기준 저축 가능액</strong>
          <span>${latest.year}년 · ${escHtml(flow.variableSource)} 기준</span>
        </div>
        <b class="${flow.gap == null || flow.gap >= 0 ? 'positive' : 'negative'}">${flow.gap == null ? formatManwonFromKRW(flow.savable) : flow.gap >= 0 ? `목표 후 ${formatManwonFromKRW(flow.gap)}` : `${formatManwonFromKRW(Math.abs(flow.gap))} 부족`}</b>
      </div>
      ${cashflowEquation(latest, variableAnnual, targetAnnual)}
    </div>
  `;
}

function itemList(items, type, goal = null) {
  if (!items.length) return '<div class="empty-state compact"><div>아직 기록이 없습니다</div></div>';
  return `<div class="finance-item-list">${items.map(item => financeItemRow(item, type, goal)).join('')}</div>`;
}

function financeItemRow(item, type, goal = null) {
  const isTarget = type === 'scenario' && goal?.heroBenchmarkId === item.id;
  const title = item.name || (type === 'actual' ? `${item.year}년 실적` : '기록');
  const meta = type === 'scenario'
    ? `${item.startYear}년부터 ${item.periodYears}년 · ${contributionScheduleText(item)} · ${item.annualRate}%`
    : `${formatManwonFromKRW(item.cumulativeSaved || item.netWorth || 0)} · 비상금 ${formatManwonFromKRW(item.emergencyFund || 0)}`;
  if (type === 'scenario') {
    return `
      <article class="cart-card finance-scenario-cart ${isTarget ? 'target' : ''}">
        <div class="cart-thumb scenario-thumb"><span>${isTarget ? '목표' : `${Number(item.annualRate) || 0}%`}</span></div>
        <div class="cart-info">
          <div class="meta">시나리오 · ${escHtml(contributionScheduleText(item))}</div>
          <h3>${escHtml(title)}${isTarget ? '<small class="target-badge">목표</small>' : ''}</h3>
          <p>${escHtml(meta)}</p>
        </div>
        <div class="cart-actions finance-row-actions">
          ${!isTarget ? `<button type="button" class="primary" onclick="window.financeSetTargetScenario('${item.id}')">목표로</button>` : ''}
          ${item.id !== goal?.heroBenchmarkId ? `<button type="button" class="${STATE.compareScenarioId === item.id ? 'primary' : ''}" data-scenario-preview="${escHtml(item.id)}">${STATE.compareScenarioId === item.id ? '비교 해제' : '그래프 비교'}</button>` : ''}
          <button type="button" onclick="window.financeEdit('${type}','${item.id}')">수정</button>
          <button type="button" class="danger" onclick="window.financeDelete('${type}','${item.id}')">삭제</button>
        </div>
      </article>
    `;
  }
  return `
    <div class="finance-item-row">
      <div>
        <strong>${escHtml(title)}${isTarget ? '<small class="target-badge">목표</small>' : ''}</strong>
        <span>${escHtml(meta)}</span>
      </div>
      <div class="finance-row-actions">
        ${type === 'scenario' && !isTarget ? `<button type="button" class="primary" onclick="window.financeSetTargetScenario('${item.id}')">목표로</button>` : ''}
        ${type === 'scenario' && item.id !== goal?.heroBenchmarkId ? `<button type="button" class="${STATE.compareScenarioId === item.id ? 'primary' : ''}" data-scenario-preview="${escHtml(item.id)}">${STATE.compareScenarioId === item.id ? '비교 해제' : '그래프 비교'}</button>` : ''}
        <button type="button" onclick="window.financeEdit('${type}','${item.id}')">수정</button>
        <button type="button" class="danger" onclick="window.financeDelete('${type}','${item.id}')">삭제</button>
      </div>
    </div>
  `;
}

function inputField(label, name, value, placeholder = '') {
  const textNames = ['name', 'role', 'desc', 'symbol', 'market', 'purchaseDate', 'broker'];
  const type = name === 'purchaseDate' ? 'date' : 'text';
  return `
    <label>
      <span>${label}</span>
      <input class="tds-input" type="${type}" name="${name}" value="${escHtml(String(value ?? ''))}" placeholder="${escHtml(String(placeholder))}" inputmode="${textNames.includes(name) ? 'text' : 'decimal'}">
    </label>
  `;
}

function bindFinanceForms() {
  bindContributionScheduleControls();
  bindScenarioForm();
  bindActualForm();
  bindFinanceChartInteractions();
  bindAssetTrackForm();
  bindAssetTrackRenameForm();
  bindHoldingForm();
  bindAssetImportForm();
  bindAssetHoldingDragDrop();
}

function bindFinanceChartInteractions() {
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
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      showLive();
      window.setTimeout(() => hideFinancePointTooltip(dot.closest('svg')), 900);
    });
    dot.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      showLive();
      window.setTimeout(() => hideFinancePointTooltip(dot.closest('svg')), 1200);
    });
  });
  document.querySelectorAll('[data-scenario-preview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-scenario-preview');
      STATE.compareScenarioId = STATE.compareScenarioId === id ? null : id;
      STATE.chartTooltip = null;
      renderFinance();
    });
  });
}

function bindContributionScheduleControls() {
  const rows = $('#finance-contribution-rows');
  const addButton = document.querySelector('[data-add-contribution-row]');
  if (addButton && rows) {
    addButton.addEventListener('click', () => {
      const lastStart = [...rows.querySelectorAll('input[name="scheduleStartYear"]')]
        .map(input => Number(input.value))
        .filter(Boolean)
        .at(-1);
      rows.insertAdjacentHTML('beforeend', contributionScheduleRow({
        startYear: lastStart ? lastStart + 1 : new Date().getFullYear(),
        endYear: '',
        annualContribution: '',
      }));
    });
  }
  rows?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-contribution-row]');
    if (!btn) return;
    const row = btn.closest('.finance-contribution-row');
    if (!row) return;
    if (rows.querySelectorAll('.finance-contribution-row').length <= 1) {
      row.querySelectorAll('input').forEach(input => { input.value = ''; });
      return;
    }
    row.remove();
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

function bindAssetTrackRenameForm() {
  $('#finance-asset-track-rename-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const existing = STATE.assetTracks.find(track => track.id === text(fd, 'id'));
    if (!existing) return;
    STATE.trackRenameId = null;
    await runSave(() => saveFinanceAssetTrack({
      ...existing,
      name: text(fd, 'name') || existing.name,
      role: text(fd, 'role'),
      desc: text(fd, 'desc'),
    }), '트랙명 저장됨');
  });
}

function bindAssetImportForm() {
  $('#finance-asset-import-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const assignments = {};
    for (const [key, value] of fd.entries()) {
      if (key.startsWith('trackId-')) assignments[key.replace('trackId-', '')] = String(value || '');
    }
    await runSave(async () => {
      const result = await mergeParsedAssetPositions(STATE.assetImport?.parsed || {}, assignments);
      STATE.assetImport = { status: 'done', ...result };
    }, '사진 자산을 저장했습니다');
  });
}

function bindAssetHoldingDragDrop() {
  document.querySelectorAll('.asset-holding[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      const payload = {
        sourceTrackId: row.dataset.sourceTrackId || '',
        holdingIndex: Number(row.dataset.holdingIndex),
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      e.dataTransfer.setData('text/plain', `${payload.sourceTrackId}:${payload.holdingIndex}`);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('.asset-track.drop-target').forEach(track => track.classList.remove('drop-target'));
    });
  });

  document.querySelectorAll('.asset-track[data-asset-track-id]').forEach(trackEl => {
    trackEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trackEl.classList.add('drop-target');
    });
    trackEl.addEventListener('dragleave', (e) => {
      if (!trackEl.contains(e.relatedTarget)) trackEl.classList.remove('drop-target');
    });
    trackEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      trackEl.classList.remove('drop-target');
      const payload = parseHoldingDragPayload(e.dataTransfer);
      const targetTrackId = trackEl.dataset.assetTrackId || '';
      if (!payload || !targetTrackId) return;
      await moveHoldingToTrack(payload.sourceTrackId, payload.holdingIndex, targetTrackId);
    });
  });
}

function parseHoldingDragPayload(dataTransfer) {
  try {
    const raw = dataTransfer.getData('application/json');
    if (raw) {
      const data = JSON.parse(raw);
      return {
        sourceTrackId: String(data.sourceTrackId || ''),
        holdingIndex: Number(data.holdingIndex),
      };
    }
  } catch {}
  const [sourceTrackId, index] = String(dataTransfer.getData('text/plain') || '').split(':');
  return { sourceTrackId, holdingIndex: Number(index) };
}

async function moveHoldingToTrack(sourceTrackId, holdingIndex, targetTrackId) {
  if (!sourceTrackId || sourceTrackId === targetTrackId || !Number.isInteger(holdingIndex)) return;
  const sourceTrack = STATE.assetTracks.find(item => item.id === sourceTrackId);
  const targetTrack = STATE.assetTracks.find(item => item.id === targetTrackId);
  const sourceHoldings = [...(sourceTrack?.holdings || [])];
  const targetHoldings = [...(targetTrack?.holdings || [])];
  const [holding] = sourceHoldings.splice(holdingIndex, 1);
  if (!sourceTrack || !targetTrack || !holding) return;
  targetHoldings.push(holding);
  await runSave(async () => {
    await saveFinanceAssetTrack({ ...sourceTrack, holdings: sourceHoldings });
    await saveFinanceAssetTrack({ ...targetTrack, holdings: targetHoldings });
  }, '종목을 다른 트랙으로 이동했습니다');
}

function bindScenarioForm() {
  $('#finance-scenario-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const contributionSchedule = scheduleFromFormData(fd);
    const fallbackAnnualContribution = manwonToKRWInput(fd.get('annualContribution'));
    await runSave(async () => {
      await saveFinanceBenchmark({
      id: text(fd, 'id') || null,
      name: text(fd, 'name') || '시뮬레이션',
      startYear: num(fd, 'startYear'),
      periodYears: num(fd, 'periodYears'),
      annualRate: decimal(fd, 'annualRate'),
      inflationRate: decimal(fd, 'inflationRate'),
      initialPrincipal: manwonToKRWInput(fd.get('initialPrincipal')),
      annualContribution: contributionSchedule[0]?.annualContribution || fallbackAnnualContribution,
      contributionTiming: contributionSchedule.length ? 'yearEnd' : 'monthly',
      contributionSchedule,
      });
      STATE.editScenarioId = null;
    }, '시나리오 저장됨');
  });
}

function bindActualForm() {
  $('#finance-actual-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await runSave(() => saveFinanceActual({
      id: text(fd, 'id') || null,
      year: num(fd, 'year'),
      cumulativeSaved: manwonToKRWInput(fd.get('cumulativeSaved')),
      netWorth: manwonToKRWInput(fd.get('netWorth')),
      emergencyFund: manwonToKRWInput(fd.get('emergencyFund')),
      monthlyExpense: manwonToKRWInput(fd.get('monthlyExpense')),
      inflow: manwonToKRWInput(fd.get('inflow')),
      fixedOutflow: manwonToKRWInput(fd.get('fixedOutflow')),
    }), '실적 저장됨');
    STATE.editActualId = null;
  });
}

function bindAssetTrackForm() {
  $('#finance-asset-track-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const existing = STATE.assetTracks.find(track => track.id === text(fd, 'id')) || {};
    STATE.editAssetTrackId = null;
    await runSave(() => saveFinanceAssetTrack({
      ...existing,
      id: text(fd, 'id') || null,
      name: text(fd, 'name') || '자산 트랙',
      role: text(fd, 'role'),
      desc: text(fd, 'desc'),
      order: num(fd, 'order'),
      holdings: existing.holdings || [],
    }), '자산 트랙 저장됨');
  });
}

function bindHoldingForm() {
  $('#finance-holding-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const trackId = text(fd, 'trackId');
    const track = STATE.assetTracks.find(item => item.id === trackId);
    if (!track) {
      showToast('트랙을 찾을 수 없습니다', 1800, 'error');
      return;
    }
    const idxRaw = text(fd, 'holdingIndex');
    const idx = idxRaw === '' ? -1 : Number(idxRaw);
    const holdings = [...(track.holdings || [])];
    const market = text(fd, 'market').toUpperCase() === 'US' ? 'US' : 'KR';
    const symbol = normalizeSymbol(text(fd, 'symbol'), market);
    if (!symbol) {
      showToast('티커를 입력해주세요', 1600, 'warning');
      return;
    }
    const purchaseDate = normalizeDateInput(text(fd, 'purchaseDate'));
    const avgFx = market === 'US' ? await resolvePurchaseFx(purchaseDate) : 1;
    const holding = {
      symbol,
      name: text(fd, 'name') || symbol,
      market,
      currency: market === 'US' ? 'USD' : 'KRW',
      quantity: decimal(fd, 'quantity'),
      avgPrice: decimal(fd, 'avgPrice'),
      avgPriceMode: isTreasuryBondSymbol(symbol) ? 'BOND_PRICE_100' : '',
      assetClass: isTreasuryBondSymbol(symbol) ? 'bond' : '',
      avgFx,
      purchaseDate,
      broker: text(fd, 'broker'),
    };
    if (idx >= 0) holdings[idx] = holding;
    else holdings.push(holding);
    STATE.editHoldingTrackId = null;
    STATE.editHoldingIndex = null;
    await runSave(() => saveFinanceAssetTrack({ ...track, holdings }), '종목 저장됨');
  });
}

async function runSave(fn, message) {
  try {
    await fn();
    showToast(message, 1400, 'success');
    await renderFinance();
  } catch (err) {
    showToast(err.message, 2600, 'error');
  }
}

function krwToManwon(value) {
  return Math.round((Number(value) || 0) / 10000);
}

function manwonToKRWInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0) * 10000);
}

function scheduleFromFormData(fd) {
  const starts = fd.getAll('scheduleStartYear');
  const ends = fd.getAll('scheduleEndYear');
  const amounts = fd.getAll('scheduleContribution');
  return starts.map((start, idx) => {
    const startYear = Math.round(Number(String(start || '').replace(/[^\d.-]/g, '')) || 0);
    const endYearRaw = Math.round(Number(String(ends[idx] || '').replace(/[^\d.-]/g, '')) || 0);
    const annualContribution = manwonToKRWInput(amounts[idx]);
    return {
      startYear,
      endYear: endYearRaw || null,
      annualContribution,
    };
  }).filter(entry => entry.startYear && entry.annualContribution)
    .sort((a, b) => a.startYear - b.startYear);
}

function num(fd, key) {
  return Math.round(Number(String(fd.get(key) || '').replace(/[^\d.-]/g, '')) || 0);
}

function decimal(fd, key) {
  return Number(String(fd.get(key) || '').replace(/[^\d.-]/g, '')) || 0;
}

function text(fd, key) {
  return String(fd.get(key) || '').trim();
}

function normalizeSymbol(symbol, market = 'KR') {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('.')) return raw;
  const compactKr = raw.match(/^(\d{6})(KS|KQ)$/);
  if (compactKr) return `${compactKr[1]}.${compactKr[2]}`;
  if (market === 'KR' && /^\d{6}$/.test(raw)) return `${raw}.KS`;
  return raw;
}

function isTreasuryBondSymbol(symbol) {
  return /^UST-\d{4}-\d{2}-\d{2}$/i.test(String(symbol || '').trim());
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

async function resolvePurchaseFx(purchaseDate) {
  if (!purchaseDate) return 0;
  try {
    const fx = await fetchUsdKrwOnDate(purchaseDate);
    if (Number(fx) > 0) return Number(fx);
  } catch (err) {
    console.warn('[finance] purchase fx fallback', err);
  }
  return 0;
}

window.financeEdit = (type, id) => {
  if (type === 'scenario') {
    STATE.editScenarioId = id;
    STATE.scenarioManagerOpen = true;
  }
  if (type === 'actual') {
    STATE.editActualId = id;
    STATE.expandedActualId = id;
    STATE.actualSheetOpen = true;
  }
  renderFinance();
};

window.financeNewScenario = () => {
  STATE.editScenarioId = '__new__';
  STATE.scenarioManagerOpen = true;
  renderFinance();
};

window.financeCloseScenarioEditor = () => {
  STATE.editScenarioId = null;
  renderFinance();
};

window.financeDelete = async (type, id) => {
  if (!confirm('삭제할까요?')) return;
  const action = type === 'scenario' ? deleteFinanceBenchmark : deleteFinanceActual;
  await runSave(async () => {
    await action(id);
    if (type === 'actual') {
      if (STATE.editActualId === id) STATE.editActualId = null;
      if (STATE.expandedActualId === id) STATE.expandedActualId = null;
    }
    if (type === 'scenario' && STATE.targetScenarioId === id) {
      await saveFinanceGoal({
        id: STATE.activeGoalId || null,
        name: STATE.activeGoalName || '목표 시나리오',
        targetYear: new Date().getFullYear(),
        startAmount: 0,
        targetAmount: 0,
        monthlyContributionTarget: 0,
        annualRate: 0,
        inflationRate: 0,
        heroBasisType: 'scenario',
        heroBenchmarkId: null,
      });
    }
  }, '삭제됨');
};

window.financeSetTargetScenario = async (id) => {
  const scenario = STATE.scenarios.find(item => item.id === id);
  if (!scenario) {
    showToast('시나리오를 찾을 수 없습니다', 1800, 'error');
    return;
  }
  const startYear = Number(scenario.startYear) || new Date().getFullYear();
  const periodYears = Math.max(1, Number(scenario.periodYears) || 1);
  const contributionSchedule = normalizeContributionSchedule(scenario.contributionSchedule);
  const annualContribution = Number(scenario.annualContribution) || firstScheduledContribution(contributionSchedule) || 0;
  const contributionTiming = contributionSchedule.length ? 'yearEnd' : (scenario.contributionTiming || 'monthly');
  const rows = compoundProjection({
    startAmount: Number(scenario.initialPrincipal) || 0,
    monthlyContribution: contributionTiming === 'yearEnd' ? 0 : Math.round(annualContribution / 12),
    annualContribution,
    contributionSchedule,
    contributionTiming,
    annualRate: Number(scenario.annualRate) || 0,
    startYear,
    targetYear: startYear + periodYears - 1,
  });
  const last = rows.at(-1) || {};
  await runSave(() => saveFinanceGoal({
    id: STATE.activeGoalId || null,
    name: scenario.name || STATE.activeGoalName || '목표 시나리오',
    targetYear: last.year || startYear + periodYears - 1,
    startAmount: Number(scenario.initialPrincipal) || 0,
    targetAmount: Number(last.balance) || 0,
    monthlyContributionTarget: Math.round(contributionForScenarioYear({ annualContribution, contributionSchedule, contributionTiming }, new Date().getFullYear()) / 12),
    annualRate: Number(scenario.annualRate) || 0,
    inflationRate: Number(scenario.inflationRate) || 0,
    heroBasisType: 'scenario',
    heroBenchmarkId: id,
  }), '목표 시나리오로 설정됨');
};

window.financeOpenActualSheet = () => {
  STATE.actualSheetOpen = true;
  STATE.expandedActualId = null;
  STATE.editActualId = null;
  renderFinance();
};

window.financeRefreshMarket = () => {
  localStorage.removeItem('budget_market_quotes_v1');
  localStorage.removeItem('budget_market_quotes_time_v1');
  showToast('시세를 다시 불러옵니다', 1200, 'success');
  return renderFinance();
};

window.financeNewActual = () => {
  STATE.editActualId = '__new__';
  STATE.expandedActualId = null;
  STATE.actualSheetOpen = true;
  renderFinance();
};

window.financeCloseActualSheet = () => {
  STATE.actualSheetOpen = false;
  STATE.editActualId = null;
  STATE.expandedActualId = null;
  renderFinance();
};

window.financeToggleActualYear = (id) => {
  STATE.actualSheetOpen = true;
  const wasEditing = !!STATE.editActualId;
  STATE.editActualId = null;
  STATE.expandedActualId = STATE.expandedActualId === id ? null : id;
  if (wasEditing) {
    renderFinance();
    return;
  }
  const sheet = document.getElementById('finance-actual-sheet');
  const cards = sheet ? Array.from(sheet.querySelectorAll('.finance-actual-year')) : [];
  if (!cards.length) {
    renderFinance();
    return;
  }
  for (const card of cards) {
    const isOpen = card.dataset.actualId === STATE.expandedActualId;
    card.classList.toggle('open', isOpen);
    card.querySelector('.finance-actual-year-head')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
};

window.financeEditActual = (id) => {
  STATE.actualSheetOpen = true;
  STATE.expandedActualId = id;
  STATE.editActualId = id;
  renderFinance();
};

window.financeCancelActualEdit = () => {
  STATE.editActualId = null;
  renderFinance();
};

window.financeToggleCashflow = () => {
  STATE.cashflowOpen = !STATE.cashflowOpen;
  renderFinance();
};

window.financeToggleScenarioManager = () => {
  STATE.scenarioManagerOpen = !STATE.scenarioManagerOpen;
  renderFinance();
};

window.financeToggleAssetOps = () => {
  STATE.assetOpsOpen = !STATE.assetOpsOpen;
  renderFinance();
};

window.financeSelectPanel = (panel) => {
  STATE.panel = ['scenario', 'asset'].includes(panel) ? panel : 'scenario';
  renderFinance();
};

window.financeNewAssetTrack = () => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = '__new__';
  STATE.assetTrackMenuId = null;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

window.financeOpenAssetTrackMenu = (id) => {
  STATE.assetTrackMenuId = id;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

window.financeCloseAssetTrackMenu = () => {
  STATE.assetTrackMenuId = null;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

window.financeEditAssetTrack = (id) => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = null;
  STATE.assetTrackMenuId = id;
  STATE.trackRenameId = id;
  STATE.editHoldingTrackId = null;
  STATE.editHoldingIndex = null;
  renderFinance();
};

window.financeCancelAssetTrackEdit = () => {
  STATE.trackRenameId = null;
  renderFinance();
};

window.financeDeleteAssetTrack = async (id) => {
  if (!confirm('이 자산 트랙을 삭제할까요?')) return;
  if (STATE.assetTrackMenuId === id) STATE.assetTrackMenuId = null;
  if (STATE.trackRenameId === id) STATE.trackRenameId = null;
  if (STATE.editHoldingTrackId === id) STATE.editHoldingTrackId = null;
  await runSave(() => deleteFinanceAssetTrack(id), '자산 트랙 삭제됨');
};

window.financeNewHolding = (trackId) => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = null;
  STATE.assetTrackMenuId = trackId;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = trackId;
  STATE.editHoldingIndex = null;
  renderFinance();
};

window.financeEditHolding = (trackId, index) => {
  STATE.assetOpsOpen = true;
  STATE.editAssetTrackId = null;
  STATE.assetTrackMenuId = trackId;
  STATE.trackRenameId = null;
  STATE.editHoldingTrackId = trackId;
  STATE.editHoldingIndex = index;
  renderFinance();
};

window.financeDeleteHolding = async (trackId, index) => {
  if (!confirm('이 종목을 삭제할까요?')) return;
  const track = STATE.assetTracks.find(item => item.id === trackId);
  if (!track) return;
  const holdings = [...(track.holdings || [])];
  holdings.splice(index, 1);
  await runSave(() => saveFinanceAssetTrack({ ...track, holdings }), '종목 삭제됨');
};

window.financeSearchTicker = async () => {
  const input = $('#asset-symbol-query');
  const box = $('#asset-ticker-results');
  const q = input?.value?.trim();
  if (!q || !box) return;
  box.innerHTML = '<div class="ticker-result muted">검색 중...</div>';
  try {
    const items = await searchTicker(q);
    box.innerHTML = items.length
      ? items.map(item => `
        <button
          type="button"
          class="ticker-result"
          data-symbol="${escHtml(item.symbol || '')}"
          data-name="${escHtml(item.name || '')}"
          data-exchange="${escHtml(item.exchange || item.type || '')}"
        >
          <strong>${escHtml(item.symbol)}</strong>
          <span>${escHtml(item.name)} · ${escHtml(item.exchange || item.type || '')}</span>
        </button>
      `).join('')
      : '<div class="ticker-result muted">검색 결과가 없습니다. Yahoo 티커를 직접 입력해도 됩니다.</div>';
    box.querySelectorAll('.ticker-result[data-symbol]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.financePickTicker(btn.dataset.symbol, btn.dataset.name, btn.dataset.exchange);
      });
    });
  } catch (err) {
    box.innerHTML = `<div class="ticker-result muted">검색 실패: ${escHtml(err.message)}</div>`;
  }
};

window.financeImportAssetImage = async (input) => {
  const file = input?.files?.[0];
  if (!file) return;
  STATE.assetOpsOpen = true;
  STATE.assetImport = { status: 'loading' };
  renderFinance();
  try {
    const dataUrl = await fileToDataUrl(file);
    const parsed = await parseAssetImage(dataUrl, file.type || 'image/jpeg');
    STATE.assetImport = { status: 'review', parsed };
    showToast('사진을 읽었습니다. 저장할 트랙을 골라주세요', 2200, 'success');
    await renderFinance();
  } catch (err) {
    STATE.assetImport = { status: 'error', message: err.message };
    showToast('사진 분석에 실패했습니다', 1800, 'error');
    renderFinance();
  } finally {
    if (input) input.value = '';
  }
};

window.financeCancelAssetImport = () => {
  STATE.assetImport = null;
  renderFinance();
};

async function parseAssetImage(dataUrl, mimeType) {
  if (!hasServerApi()) throw new Error('GitHub Pages에서는 사진 분석 API를 사용할 수 없습니다');
  const payload = { imageBase64: dataUrl, mimeType };
  const res = await postAssetImageParse('/api/asset-image-parse', payload);
  if (!res.ok) throw new Error(res.status === 404 || res.status === 501 ? '이미지 파싱 API에 연결할 수 없습니다' : `parse ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '사진 분석 실패');
  return data.parsed || {};
}

function postAssetImageParse(url, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function mergeParsedAssetPositions(parsed, assignments = {}) {
  const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
  let added = 0;
  let skipped = 0;
  const trackMap = new Map(STATE.assetTracks.map(track => [track.id, { ...track, holdings: [...(track.holdings || [])] }]));
  for (const [idx, position] of positions.entries()) {
    const assignedTrackId = assignments[String(idx)] || '';
    if (!assignedTrackId) {
      skipped += 1;
      continue;
    }
    const track = trackMap.get(assignedTrackId);
    if (!track) {
      skipped += 1;
      continue;
    }
    const holding = positionToHolding(position, parsed.asOf);
    if (isDuplicateHolding(track.holdings, holding)) {
      skipped += 1;
      continue;
    }
    track.holdings.push(holding);
    added += 1;
  }
  const changed = [...trackMap.values()].filter(track => {
    const original = STATE.assetTracks.find(item => item.id === track.id);
    return (original?.holdings || []).length !== track.holdings.length;
  });
  await Promise.all(changed.map(track => saveFinanceAssetTrack(track)));
  return { added, skipped };
}

function pickTrackForPosition(position, tracks) {
  const hint = String(position.trackHint || '').toLowerCase();
  const hay = `${position.name || ''} ${position.broker || ''} ${position.assetClass || ''}`.toLowerCase();
  const scored = tracks.map(track => {
    const text = `${track.id || ''} ${track.name || ''} ${track.role || ''} ${track.desc || ''}`.toLowerCase();
    let score = 0;
    if (hint && text.includes(hint)) score += 20;
    if (/irp|퇴직|연금|하나/.test(hay) && /irp|퇴직|연금/.test(text)) score += 30;
    if (/금|gold|국채|채권|bond|treasury/.test(hay) && /올웨더|분산|국채|금/.test(text)) score += 18;
    if (/tiger|ace|kodex|나스닥|주식|etf/.test(hay) && /주식|투자|적극|conviction|irp/.test(text)) score += 12;
    return { track, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].track : tracks.find(track => track.id !== 'deposit') || tracks[0] || null;
}

function positionToHolding(position, asOf) {
  const principal = Math.max(0, Math.round(Number(position.principalKRW) || Number(position.avgPrice) || 0));
  const currentValue = Math.max(0, Math.round(Number(position.currentValueKRW) || 0));
  const quantity = Math.max(0, Number(position.quantity ?? position.qty) || 0);
  const market = position.market === 'US' ? 'US' : 'KR';
  const currency = position.currency || (market === 'US' ? 'USD' : 'KRW');
  const avgPrice = quantity > 0 && principal > 0 ? Math.round(principal / quantity) : principal || currentValue;
  return {
    symbol: normalizeSymbol(String(position.symbol || '').trim().toUpperCase(), market),
    name: String(position.name || position.symbol || '').trim(),
    market,
    currency,
    quantity: quantity || 0,
    avgPrice,
    avgPriceMode: quantity > 0 ? 'KRW_UNIT' : 'TOTAL_KRW',
    principalKRW: principal || currentValue,
    currentValueKRW: currentValue,
    profitKRW: Math.round(Number(position.profitKRW) || (currentValue - principal) || 0),
    returnPct: Number.isFinite(Number(position.returnPct)) ? Number(position.returnPct) : null,
    broker: String(position.broker || '').trim(),
    assetClass: String(position.assetClass || '').trim(),
    source: 'asset-screenshot',
    snapshotAt: asOf || todayISO(),
  };
}

function isDuplicateHolding(holdings, candidate) {
  const key = holdingIdentity(candidate);
  return holdings.some(item => {
    if (holdingIdentity(item) !== key) return false;
    const valueA = Number(item.currentValueKRW) || Number(item.principalKRW) || Number(item.avgPrice) || 0;
    const valueB = Number(candidate.currentValueKRW) || Number(candidate.principalKRW) || Number(candidate.avgPrice) || 0;
    return nearMoney(valueA, valueB) || nearMoney(Number(item.principalKRW) || Number(item.avgPrice) || 0, Number(candidate.principalKRW) || 0);
  });
}

function holdingIdentity(item) {
  const symbol = String(item.symbol || '').toUpperCase().replace(/\s+/g, '');
  const name = normalizeAssetName(item.name || symbol);
  const broker = normalizeAssetName(item.broker || '');
  return `${symbol || name}|${broker}`;
}

function normalizeAssetName(value) {
  return String(value || '').toLowerCase().replace(/[\s._-]+/g, '');
}

function nearMoney(a, b) {
  if (!a || !b) return false;
  const diff = Math.abs(a - b);
  return diff <= Math.max(5000, Math.max(a, b) * 0.03);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

window.financePickTicker = (symbol, name, exchange = '') => {
  const symbolInput = document.querySelector('#finance-holding-form [name=symbol]');
  const nameInput = document.querySelector('#finance-holding-form [name=name]');
  const marketInput = document.querySelector('#finance-holding-form [name=market]');
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (symbolInput) symbolInput.value = normalizedSymbol;
  if (nameInput) nameInput.value = String(name || '').trim() || normalizedSymbol;
  if (marketInput) marketInput.value = inferMarketFromTicker(normalizedSymbol, exchange);
};

function inferMarketFromTicker(symbol, exchange = '') {
  const exchangeText = String(exchange || '').toUpperCase();
  if (/(\.KS|\.KQ)$/.test(symbol) || /^\d{6}$/.test(symbol)) return 'KR';
  if (/(KSC|KOSPI|KOSDAQ|KRX|KOREA|SEOUL)/.test(exchangeText)) return 'KR';
  return 'US';
}

async function searchTicker(q) {
  const localItems = searchLocalMarketSymbols(q, 8);
  if (!hasServerApi()) return localItems;
  try {
    const res = await fetch(`/api/market-symbol-search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`search ${res.status}`);
    const data = await res.json();
    return mergeSymbolItems(localItems, data.items || []).slice(0, 8);
  } catch {
    if (localItems.length) return localItems;
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
      const data = await proxyFetchJson(url);
      const yahooItems = (data.quotes || []).slice(0, 8).map(item => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchange || '',
        type: item.quoteType || '',
      }));
      return mergeSymbolItems(yahooItems).slice(0, 8);
    } catch {
      return [];
    }
  }
}

function mergeSymbolItems(...groups) {
  const seen = new Set();
  return groups.flat().filter(item => {
    const key = String(item.symbol || '').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function proxyFetchJson(url) {
  const proxies = [
    value => `https://corsproxy.io/?${encodeURIComponent(value)}`,
    value => `https://api.allorigins.win/raw?url=${encodeURIComponent(value)}`,
  ];
  for (const build of proxies) {
    try {
      const res = await fetch(build(url));
      if (res.ok) return await res.json();
    } catch {}
  }
  throw new Error('검색 프록시 실패');
}
