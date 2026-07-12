import { compoundProjection, formatManwonFromKRW } from '../../../utils/finance-goals.js';
import { escHtml } from '../../../utils/dom.js';

export function heroBasisSeries(goal, scenarioSeries) {
  if (goal?.heroBenchmarkId) return scenarioSeries.find(item => item.id === goal.heroBenchmarkId) || null;
  return null;
}

export function buildScenarioSeries(benchmarks, targetId) {
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

export function actualGapAtTargetYear(targetSeries, actuals) {
  if (!targetSeries || !actuals.length) return null;
  const latest = actuals.slice().sort((a, b) => (b.year || 0) - (a.year || 0))[0];
  if (!latest) return null;
  const targetRow = targetSeries.rows.find(row => row.year === latest.year);
  if (!targetRow) return null;
  return Number(latest.cumulativeSaved || latest.netWorth || 0) - targetRow.balance;
}

export function buildActualSeries(actuals) {
  const rows = actuals
    .slice()
    .sort((a, b) => a.year - b.year)
    .map(item => ({ year: item.year, balance: Number(item.cumulativeSaved || item.netWorth || 0) }));
  return rows.length ? [{ key: 'actuals', label: '실제', color: 'var(--text-tertiary)', actual: true, rows }] : [];
}

export function financeChart(targetSeries, actualSeries, compareSeries = null) {
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

export function chartTooltipSvg(tip, w, h, extraClass = '') {
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

export function financeAgeAt(year) {
  return 31 + (Number(year) - 2026);
}

export function simulationProfitAt(series, row) {
  const startYear = Number(series.startYear || series.rows?.[0]?.year || row.year);
  const invested = (Number(series.startAmount) || 0) + cumulativeContributionUntil(series, Number(row.year), startYear);
  return Math.round((Number(row.balance) || 0) - invested);
}

export function contributionForScenarioYear(series, year) {
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

export function cumulativeContributionUntil(series, targetYear, startYear = null) {
  const firstYear = Number(startYear || series?.startYear || series?.rows?.[0]?.year || targetYear);
  let total = 0;
  for (let year = firstYear; year <= targetYear; year += 1) {
    total += contributionForScenarioYear(series, year);
  }
  return total;
}

export function realRowsForSeries(item) {
  const inflationRate = Math.max(-0.99, Number(item.inflationRate) || 0) / 100;
  if (!inflationRate) return [];
  const firstYear = item.rows?.[0]?.year || new Date().getFullYear();
  return (item.rows || []).map(row => {
    const years = Math.max(0, row.year - firstYear + 1);
    return { year: row.year, balance: Math.round(row.balance / Math.pow(1 + inflationRate, years)) };
  });
}

export function milestoneRows(rows) {
  if (!rows.length) return [];
  const startYear = rows[0].year;
  const lastYear = rows.at(-1).year;
  const picked = rows.filter(row => row.year === startYear || row.year === lastYear || (row.year - startYear + 1) % 5 === 0);
  return picked.filter((row, idx, arr) => arr.findIndex(item => item.year === row.year) === idx);
}

export function valueTicks(max) {
  const top = niceCeil(max);
  return [top, top * 0.75, top * 0.5, top * 0.25].map(v => Math.round(v));
}

export function niceCeil(value) {
  const raw = Math.max(1, Number(value) || 1);
  const exp = Math.floor(Math.log10(raw));
  const unit = Math.pow(10, exp);
  const scaled = raw / unit;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * unit;
}

export function scenarioInsightPanel(series, scenarioSeries = []) {
  if (!series?.rows?.length) return '';
  const realRows = realRowsForSeries(series);
  const realByYear = new Map(realRows.map(row => [row.year, row.balance]));
  const hit = dividendTargetHit(series);
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

export function scenarioTabs(items, current) {
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

export function scenarioLevelBadge(series) {
  const text = `${series?.label || ''}`.toLowerCase();
  const rate = Number(series?.annualRate) || 0;
  if (/(^|\s)(low|하|보수|stress)(\s|$)/.test(text) || rate < 7.5) return '하';
  if (/(^|\s)(high|상|낙관|bull)(\s|$)/.test(text) || rate >= 10) return '상';
  return '중';
}

export function scenarioCompactLabel(series) {
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

export function compactScheduleText(series) {
  const schedule = normalizeContributionSchedule(series?.contributionSchedule);
  if (!schedule.length) return `연 ${formatManwonFromKRW(series?.annualContribution || 0)}`;
  const first = schedule[0];
  const last = schedule[schedule.length - 1];
  if (schedule.length === 1) return `연 ${formatManwonFromKRW(first.annualContribution)}`;
  return `${first.startYear} ${formatManwonFromKRW(first.annualContribution)}→${last.startYear} ${formatManwonFromKRW(last.annualContribution)}`;
}

export function dividendTargetHit(series) {
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


export function formatSignedManwonFromKRW(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? '+' : ''}${formatManwonFromKRW(n)}`;
}

export function formatPlainRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function normalizeContributionSchedule(entries = []) {
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

export function firstScheduledContribution(schedule) {
  return normalizeContributionSchedule(schedule)[0]?.annualContribution || 0;
}
