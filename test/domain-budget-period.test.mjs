import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BUDGET_CYCLES,
  BUDGET_SETTINGS_VERSION,
  cycleDaysFor,
  cycleForViewMode,
  cycleOptionLabel,
  cycleUnitDays,
  cycleUnitLabel,
  normalizeBudgetCycle,
  normalizeCustomDays,
  migrateLegacyBudget,
  normalizeCycleUnit,
  periodLabelFor,
  periodViewMode,
  prorateMonthlyToCycle,
  resolveBudgetPeriod,
} from '../domain/budget/period.js';
import { cycleProgressForRange, cycleRangeForDate } from '../utils/cycles.js';
import { targetFor } from '../features/report/budget-summary/state.js';
import { buildSafeToSpendSummary } from '../domain/funds/provision.js';
import { weeklyBudgetFor } from '../domain/transactions/weekly.js';

test('budget cycles include the 2-week option and default to it', () => {
  assert.deepEqual(BUDGET_CYCLES, ['monthly', 'biweekly', 'weekly', 'custom']);
  assert.equal(normalizeBudgetCycle('biweekly'), 'biweekly');
  assert.equal(normalizeBudgetCycle(''), 'biweekly');
  assert.equal(normalizeBudgetCycle('nonsense'), 'biweekly');
  assert.equal(normalizeBudgetCycle('monthly'), 'monthly');
});

test('cycle length comes from the setting, not a hard-coded 14', () => {
  assert.equal(cycleUnitDays('biweekly'), 14);
  assert.equal(cycleUnitDays('weekly'), 7);
  assert.equal(cycleUnitDays('custom', 10), 10);
  assert.equal(cycleDaysFor({ cycle: 'biweekly' }), 14);
  assert.equal(cycleDaysFor({ cycle: 'custom', customDays: 21 }), 21);
  // 월 주기는 달력 월이라 고정 일수가 없다.
  assert.equal(cycleDaysFor({ cycle: 'monthly' }), 0);
  assert.equal(normalizeCustomDays(1), 2);
  assert.equal(normalizeCustomDays(999), 90);
  assert.equal(normalizeCustomDays('14'), 14);
});

test('view mode and labels are derived from the same budget setting', () => {
  assert.equal(periodViewMode({ cycle: 'biweekly' }), 'cycle');
  assert.equal(periodViewMode({ cycle: 'monthly' }), 'month');
  assert.equal(periodLabelFor({ cycle: 'biweekly' }), '이번 2주');
  assert.equal(periodLabelFor({ cycle: 'weekly' }), '이번 1주');
  assert.equal(periodLabelFor({ cycle: 'custom', customDays: 10 }), '이번 10일');
  assert.equal(periodLabelFor({ cycle: 'custom', customDays: 21 }), '이번 3주');
  assert.equal(periodLabelFor({ cycle: 'monthly' }), '이번 달');
  assert.equal(cycleUnitLabel('biweekly'), '2주');
  assert.equal(cycleOptionLabel('biweekly'), '2주마다');
  assert.equal(cycleOptionLabel('monthly'), '매월');
});

test('switching to the month view remembers the cycle unit to return to', () => {
  const weekly = { cycle: 'weekly', cycleUnit: 'weekly' };
  assert.equal(cycleForViewMode('month', weekly), 'monthly');
  // 월로 갔다가 되돌아오면 사용자가 고른 1주 주기로 복귀한다.
  const monthly = { cycle: 'monthly', cycleUnit: normalizeCycleUnit('weekly') };
  assert.equal(cycleForViewMode('cycle', monthly), 'weekly');
  // cycleUnit 기록이 없으면 2주가 기본.
  assert.equal(cycleForViewMode('cycle', { cycle: 'monthly' }), 'biweekly');
});

test('resolveBudgetPeriod exposes one snapshot for home and settings', () => {
  assert.deepEqual(resolveBudgetPeriod({ cycle: 'biweekly' }), {
    cycle: 'biweekly',
    cycleUnit: 'biweekly',
    customDays: 14,
    mode: 'cycle',
    cycleDays: 14,
    unitLabel: '2주',
    periodLabel: '이번 2주',
  });
  const monthly = resolveBudgetPeriod({ cycle: 'monthly', cycleUnit: 'weekly' });
  assert.equal(monthly.mode, 'month');
  assert.equal(monthly.periodLabel, '이번 달');
  // 월 모드에서도 세그먼트가 그릴 단위 라벨은 유지된다.
  assert.equal(monthly.unitLabel, '1주');
});

test('2-week proration keeps the previous half-of-month behaviour', () => {
  assert.equal(prorateMonthlyToCycle(300000, 14), 150000);
  assert.equal(prorateMonthlyToCycle(300000, 7), 75000);
  assert.equal(prorateMonthlyToCycle(300000, 28), 300000);
  const category = { name: '식비', target: 300000, budgetRhythm: 'spread' };
  assert.equal(targetFor(category, '2026-07', 'cycle'), 150000);
  assert.equal(targetFor(category, '2026-07', 'cycle', 7), 75000);
  assert.equal(targetFor(category, '2026-07', 'month'), 300000);
});

test('cycle ranges and progress follow the configured length', () => {
  const biweekly = cycleRangeForDate(new Date(2026, 6, 20), '2026-07-14', 14);
  assert.equal(biweekly.start.getDate(), 14);
  assert.equal(cycleProgressForRange(biweekly, new Date(2026, 6, 20)).totalDays, 14);
  assert.equal(cycleProgressForRange(biweekly, new Date(2026, 6, 20)).daysRemaining, 7);

  // 같은 앵커라도 주기가 7일이면 다음 주기(7/21~)로 넘어간다.
  const weekly = cycleRangeForDate(new Date(2026, 6, 22), '2026-07-14', 7);
  assert.equal(weekly.start.getDate(), 21);
  const progress = cycleProgressForRange(weekly, new Date(2026, 6, 22));
  assert.equal(progress.totalDays, 7);
  assert.equal(progress.dayN, 2);
  assert.equal(progress.daysRemaining, 5);
});

test('safe-to-spend prorates provisions and remaining days by the configured cycle', () => {
  const weeklyCycle = cycleRangeForDate(new Date(2026, 6, 20), '2026-07-20', 7);
  const summary = buildSafeToSpendSummary({
    budgetTotal: 300000,
    spentTotal: 100000,
    funds: [{ monthlyProvision: 100000, startMonthKey: '2026-07', active: true }],
    mode: 'cycle',
    monthKey: '2026-07',
    cycleRange: weeklyCycle,
    cycleDays: 7,
    now: new Date(2026, 6, 20),
  });
  assert.equal(summary.provisions, 25000); // 100000 * 7/28
  assert.equal(summary.amount, 175000);
  assert.equal(summary.daysRemaining, 6);
});

test('weekly report budget divides by the configured cycle length', () => {
  const range = { start: new Date(2026, 6, 20) };
  assert.equal(weeklyBudgetFor({ budgetAmount: 200000, cycle: 'biweekly', range }), 100000);
  assert.equal(weeklyBudgetFor({ budgetAmount: 200000, cycle: 'weekly', range }), 200000);
  assert.equal(weeklyBudgetFor({ budgetAmount: 200000, cycle: 'custom', cycleDays: 28, range }), 50000);
  assert.equal(weeklyBudgetFor({ budgetAmount: 310000, cycle: 'monthly', range }), 70000);
});

test('v1 budget migrates only when the amount basis period changes', () => {
  // 'monthly'는 v1·v2 모두 월 기준 → 금액 그대로.
  const monthly = migrateLegacyBudget({ amount: 1940000, cycle: 'monthly', startDay: 1, rollover: 'reset' });
  assert.equal(monthly.changed, true);
  assert.equal(monthly.prorated, false);
  assert.equal(monthly.budget.amount, 1940000);
  assert.equal(monthly.budget.cycle, 'monthly');
  assert.equal(monthly.budget.schemaVersion, BUDGET_SETTINGS_VERSION);

  // 'weekly'는 v1에서도 1주 금액이었고 v2 주기도 1주 → 금액 그대로.
  const weekly = migrateLegacyBudget({ amount: 200000, cycle: 'weekly' });
  assert.equal(weekly.prorated, false);
  assert.equal(weekly.budget.amount, 200000);
  assert.equal(weekly.budget.cycle, 'weekly');

  // 'custom'은 v1에서 월 기준이었고 v2에서 주기(기본 14일)가 된다 → 안분.
  const custom = migrateLegacyBudget({ amount: 1940000, cycle: 'custom' });
  assert.equal(custom.prorated, true);
  assert.equal(custom.budget.amount, 970000);
  assert.equal(custom.budget.cycle, 'custom');
  assert.equal(custom.budget.customDays, 14);

  // cycle이 없는 문서는 v1에서 월로 읽혔고 v2 기본은 2주 → 안분.
  const noCycle = migrateLegacyBudget({ amount: 1940000 });
  assert.equal(noCycle.prorated, true);
  assert.equal(noCycle.budget.amount, 970000);
  assert.equal(noCycle.budget.cycle, 'biweekly');
});

test('migration carries the legacy custom start date into the shared anchor', () => {
  const migrated = migrateLegacyBudget({ amount: 0, cycle: 'custom', customStartDate: '2026-07-14' });
  assert.equal(migrated.biweeklyStartDate, '2026-07-14');
  // 이미 홈에서 쓰던 앵커가 있으면 그걸 유지한다(홈 값이 우선).
  const keepsExisting = migrateLegacyBudget(
    { amount: 0, cycle: 'custom', customStartDate: '2026-07-14' },
    { biweeklyStartDate: '2026-07-06' },
  );
  assert.equal(keepsExisting.biweeklyStartDate, '2026-07-06');
});

test('migration is idempotent and skips already-migrated documents', () => {
  const first = migrateLegacyBudget({ amount: 1940000, cycle: 'custom' });
  assert.equal(first.changed, true);
  // 이관 결과를 다시 넣으면 버전 때문에 건너뛴다 — 이중 안분 없음.
  assert.equal(migrateLegacyBudget(first.budget).changed, false);
  // 쓰기 실패로 원본이 남아도 같은 입력 → 같은 결과(멱등).
  assert.equal(migrateLegacyBudget({ amount: 1940000, cycle: 'custom' }).budget.amount, first.budget.amount);
});

test('settings repository migrates the raw document before normalizing', async () => {
  const source = await readFile(new URL('../data/repositories/settings.js', import.meta.url), 'utf8');
  assert.match(source, /const migrated = await migrateBudgetSchema\(ref, raw\)/);
  assert.match(source, /normalizeAppSettings\(migrated\)/);
  assert.match(source, /schemaVersion: BUDGET_SETTINGS_VERSION/);
});

test('settings and home write the same period fields', async () => {
  const settingsScreen = await readFile(new URL('../features/settings/screens/budget-overall.js', import.meta.url), 'utf8');
  const periodModal = await readFile(new URL('../features/report/period-modal.js', import.meta.url), 'utf8');
  for (const source of [settingsScreen, periodModal]) {
    assert.match(source, /saveAppSettings\(/);
    assert.match(source, /cycleUnit:/);
    assert.match(source, /customDays/);
    // 주기 시작 앵커는 두 화면이 공유하는 필드 하나뿐이다.
    assert.match(source, /biweeklyStartDate/);
  }
  // 설정 화면에 2주 선택지가 실제로 있어야 한다(불일치의 원인).
  assert.match(settingsScreen, /radioHtml\('cycle', 'biweekly', '2주'/);
  assert.match(periodModal, /cycleOption\('biweekly', '2주'\)/);
});

test('report state derives the view mode from the stored budget cycle', async () => {
  const source = await readFile(new URL('../render-report.js', import.meta.url), 'utf8');
  assert.match(source, /const budgetPeriod = resolveBudgetPeriod\(appSettings\.budget\)/);
  assert.match(source, /STATE\.viewMode = budgetPeriod\.mode/);
  assert.match(source, /cycleRangeForDate\(new Date\(\), biweeklyStartDate, cycleDays\)/);
});
