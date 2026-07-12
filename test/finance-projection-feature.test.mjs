import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actualGapAtTargetYear,
  buildActualSeries,
  buildScenarioSeries,
  financeChart,
  normalizeContributionSchedule,
  scenarioInsightPanel,
} from '../features/finance/projection/index.js';

test('finance projection feature keeps schedules, target gaps, and series deterministic', () => {
  const schedule = normalizeContributionSchedule([
    { startYear: 2030, annualContribution: 30000000 },
    { startYear: 2026, endYear: 2029, amount: 20000000 },
  ]);
  assert.deepEqual(schedule, [
    { startYear: 2026, endYear: 2029, annualContribution: 20000000 },
    { startYear: 2030, endYear: null, annualContribution: 30000000 },
  ]);

  const [series] = buildScenarioSeries([{
    id: 'base',
    name: '기준',
    startYear: 2026,
    periodYears: 3,
    annualRate: 0,
    inflationRate: 0,
    initialPrincipal: 50000000,
    contributionSchedule: schedule,
  }], 'base');
  assert.equal(series.target, true);
  assert.deepEqual(series.rows.map(row => row.year), [2026, 2027, 2028]);
  assert.equal(actualGapAtTargetYear(series, [{ year: 2027, cumulativeSaved: series.rows[1].balance + 5000000 }]), 5000000);
  assert.equal(buildActualSeries([{ year: 2027, cumulativeSaved: 95000000 }])[0].rows[0].balance, 95000000);
});

test('finance projection view preserves accessible chart and accumulation table', () => {
  const [series] = buildScenarioSeries([{
    id: 'base',
    name: '기준',
    startYear: 2026,
    periodYears: 3,
    annualRate: 8,
    inflationRate: 2.5,
    initialPrincipal: 50000000,
    annualContribution: 20000000,
    contributionTiming: 'yearEnd',
  }], 'base');
  const chart = financeChart(series, null);
  assert.match(chart, /role="img" aria-label="재무 목표 그래프"/);
  assert.match(chart, /finance-point-hit/);
  const table = scenarioInsightPanel(series, [series]);
  assert.match(table, /20년 축적표/);
  assert.match(table, /기말 잔액/);
});
