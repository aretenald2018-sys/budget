import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  createPairingCode,
  DAYBIRD_DEFAULT_WEIGHTS,
  deviceAuthUid,
  normalizeDaybirdWeights,
  ownerUidFromPairingCode,
  pairingHash,
  requestDashboardRefresh,
} from '../api/_lib/daybird.js';
import {
  buildCanonicalWinePurchasePoints,
  kstMonthStartDate,
  persistCanonicalDashboardPoints,
  toKstPseudoLocalDate,
} from '../api/_lib/daybird-reward-points.js';
import {
  fetchTomatoDevDaybirdSnapshot,
  loadTomatoDevRawSource,
  normalizeTomatoDevDaybirdSnapshot,
  resolveTomatoDevOwnerFromAccount,
} from '../api/_lib/tomatodev-snapshot.js';
import {
  buildTomatoDevSnapshotFromRaw,
  calcTomatoDevExerciseCalorieCredit,
  evaluateRawRunningPaceGoal,
  listRunningActivities,
  tomatoDevWendlerPrescriptionForWeek,
} from '../api/_lib/tomatodev-raw-domain.js';
import { buildCanonicalBudgetDashboardSource, buildSpendingSnapshot } from '../api/_lib/daybird-budget-source.js';
import { buildRewardSavingsSummary } from '../domain/rewards/savings.js';
import { cycleRangeForDate } from '../utils/cycles.js';
import { loadFixture } from './helpers/fixtures.mjs';

const canonicalPointsFixture = await loadFixture('daybird-canonical-points.json', import.meta.url);
const kstMonthBoundaryFixture = await loadFixture('daybird-kst-month-boundary.json', import.meta.url);
const tomatoDevRawFixture = await loadFixture('tomatodev-raw-source.json', import.meta.url);
const runningGuardrailsFixture = await loadFixture('tomatodev-running-guardrails.json', import.meta.url);
const tomatoDevDomainGolden = await loadFixture('tomatodev-domain-golden.json', import.meta.url);
const readerTestEmail = 'daybird-reader@example.test';
const readerTestPassword = 'synthetic-test-password';
const { expected: tomatoDevExpected, ...tomatoDevRawSource } = tomatoDevRawFixture;
const tomatoDevSnapshot = normalizeTomatoDevDaybirdSnapshot(buildTomatoDevSnapshotFromRaw({
  ...tomatoDevRawSource,
  generatedAt: 1784368800000,
  reason: 'fixture',
}));
const canonicalBudgetSource = {
  sourceEnvironment: 'budget',
  spending: { monthSpent: 777000, twoWeek: { spent: 123000, target: 420000, todaySpent: 9000, todayTarget: 30000 } },
  wine: { name: 'Canonical Budget wine' },
  weights: { food: 25, health: 25, running: 20, spending: 20, wine: 10 },
};

test('pairing codes retain the owner without storing the raw secret', () => {
  const code = createPairingCode('budget-owner');
  assert.equal(ownerUidFromPairingCode(code), 'budget-owner');
  assert.equal(pairingHash(code).length, 64);
  assert.notEqual(pairingHash(code), code);
});

test('device auth UID is stable and contains no raw device identifier', () => {
  const first = deviceAuthUid('device-12345678');
  assert.equal(first, deviceAuthUid('device-12345678'));
  assert.equal(first.includes('device-12345678'), false);
  assert.notEqual(first, deviceAuthUid('device-12345678', 'another-owner'));
});

test('dashboard weights must be integers totaling 100', () => {
  assert.deepEqual(normalizeDaybirdWeights(DAYBIRD_DEFAULT_WEIGHTS), DAYBIRD_DEFAULT_WEIGHTS);
  assert.throws(() => normalizeDaybirdWeights({ ...DAYBIRD_DEFAULT_WEIGHTS, wine: 11 }), /total 100/);
  assert.throws(() => normalizeDaybirdWeights({ ...DAYBIRD_DEFAULT_WEIGHTS, wine: 9.5 }), /invalid weight/);
});

test('DayBird wine points exactly match the canonical Budget domain, including negative history-only balances', () => {
  const input = {
    categories: canonicalPointsFixture.categories,
    rewardSettings: canonicalPointsFixture.rewardSettings,
    pointEntries: canonicalPointsFixture.pointEntries.map(entry => ({ ...entry, usedAt: new Date(entry.usedAt) })),
    now: new Date(canonicalPointsFixture.now),
  };
  const canonical = buildCanonicalWinePurchasePoints(input);
  const summary = buildRewardSavingsSummary({
    transactions: [],
    pointEntries: input.pointEntries,
    categoryNames: ['생활'],
    now: input.now,
    ...input.rewardSettings,
  });
  const winePurchase = summary.pointBuckets.find(bucket => bucket.key === 'winePurchase');

  assert.deepEqual(
    Object.fromEntries(Object.keys(canonicalPointsFixture.expected).map(key => [key, canonical[key]])),
    canonicalPointsFixture.expected,
  );
  assert.equal(canonical.balance, winePurchase.monthPoints);
  assert.equal(canonical.monthPoints, winePurchase.monthPoints);
  assert.ok(canonical.balance < 0, 'negative point balances must not be clamped');
});

test('DayBird canonical points use KST month boundaries even when the server clock is UTC', () => {
  const now = new Date(kstMonthBoundaryFixture.now);
  const points = buildCanonicalWinePurchasePoints({
    categories: kstMonthBoundaryFixture.categories,
    rewardSettings: kstMonthBoundaryFixture.rewardSettings,
    pointEntries: kstMonthBoundaryFixture.pointEntries,
    now,
  });

  assert.equal(kstMonthStartDate(now).toISOString(), kstMonthBoundaryFixture.expected.monthStartUtc);
  assert.equal(toKstPseudoLocalDate(now, 0).toISOString(), '2026-08-01T00:30:00.000Z');
  assert.equal(points.balance, kstMonthBoundaryFixture.expected.balance);
  assert.equal(points.spentMonthPoints, kstMonthBoundaryFixture.expected.spentMonthPoints);
  assert.equal(points.historyOnly, kstMonthBoundaryFixture.expected.historyOnly);
});

test('refresh uses only the validated TomatoDev source and the Budget canonical points', async () => {
  const canonicalPoints = buildCanonicalWinePurchasePoints({
    categories: canonicalPointsFixture.categories,
    rewardSettings: canonicalPointsFixture.rewardSettings,
    pointEntries: canonicalPointsFixture.pointEntries.map(entry => ({ ...entry, usedAt: new Date(entry.usedAt) })),
    now: new Date(canonicalPointsFixture.now),
  });
  let persisted;
  let notified;

  const result = await requestDashboardRefresh('budget-owner', 'reward-point-entry-update', {
    canonicalPoints,
    budgetSource: canonicalBudgetSource,
    tomatoDevSnapshot,
    persistPoints: async (ownerUid, points, options) => {
      persisted = { ownerUid, points, options };
      return { revision: 7 };
    },
    notifyDevices: async (ownerUid, revision) => {
      notified = { ownerUid, revision };
      return { sent: 1, failed: 0 };
    },
  });
  assert.equal(persisted.ownerUid, 'budget-owner');
  assert.deepEqual(persisted.points, canonicalPoints);
  assert.deepEqual(persisted.options.tomatoDevSnapshot, tomatoDevSnapshot);
  assert.equal(persisted.options.budgetSource.sourceEnvironment, 'budget');
  assert.equal(persisted.options.reason, 'reward-point-entry-update');
  assert.equal(result.queued, false);
  assert.equal(result.sourceEnvironment, 'tomatodev');
  assert.deepEqual(result.points, canonicalPoints);
  assert.deepEqual(notified, { ownerUid: 'budget-owner', revision: 7 });
  assert.deepEqual(result.notification, { sent: 1, failed: 0 });
});

test('canonical persistence keeps only Budget spending/wine and validated TomatoDev fields', async () => {
  const writes = [];
  const db = {
    doc: path => ({ path }),
    runTransaction: async callback => callback({
      get: async ref => ({
        exists: true,
        data: () => ref.path.endsWith('/dashboard/latest')
          ? {
              schemaVersion: 1,
              revision: 6,
              spending: { monthSpent: 456000 },
              wine: { name: 'Budget wine' },
              score: 91,
              domains: { running: { source: 'tomatofarm' } },
              points: { state: 'ready', earnedTwoWeek: 3456, balance: 999 },
            }
          : {},
      }),
      set: (ref, value, options) => writes.push({ path: ref.path, value, options }),
    }),
  };
  const points = { state: 'ready', label: '와인구매 포인트', balance: -12500, monthPoints: -12500, schemaVersion: 2 };

  await persistCanonicalDashboardPoints('budget-owner', points, {
    db,
    budgetSource: canonicalBudgetSource,
    tomatoDevSnapshot,
    updatedAtEpochMs: 123,
  });

  const latest = writes.find(write => write.path.endsWith('/dashboard/latest'));
  assert.equal(latest.options, undefined);
  assert.equal(latest.value.revision, 7);
  assert.deepEqual(latest.value.spending, canonicalBudgetSource.spending);
  assert.deepEqual(latest.value.wine, canonicalBudgetSource.wine);
  assert.equal(latest.value.points.balance, -12500);
  assert.equal(latest.value.points.monthPoints, -12500);
  assert.equal(latest.value.points.earnedTwoWeek, undefined);
  assert.equal(latest.value.score, undefined);
  assert.equal(latest.value.domains, undefined);
  assert.equal(latest.value.sourceEnvironment, 'tomatodev');
  assert.equal(latest.value.tomatoDevSnapshotMetadata.sourceEnvironment, 'tomatodev');
  assert.equal(latest.value.generatedAtEpochMs, 123);
  assert.deepEqual(latest.value.nutrition, tomatoDevSnapshot.nutrition);
  assert.deepEqual(latest.value.running.records, tomatoDevSnapshot.running.recent);
  assert.deepEqual(latest.value.seasonGoals, tomatoDevSnapshot.seasonGoals);
  assert.equal(latest.value.budgetPointsMetadata.source, 'budget-canonical');
});

test('canonical persistence creates revision one on first pairing without a TomatoFarm base', async () => {
  const writes = [];
  const db = {
    doc: path => ({ path }),
    runTransaction: async callback => callback({
      get: async () => ({ exists: false }),
      set: (ref, value) => writes.push({ path: ref.path, value }),
    }),
  };
  const result = await persistCanonicalDashboardPoints('budget-owner', { state: 'ready', balance: -1, monthPoints: -1 }, {
    db,
    budgetSource: canonicalBudgetSource,
    tomatoDevSnapshot,
    updatedAtEpochMs: 123,
  });
  const latest = writes.find(write => write.path.endsWith('/dashboard/latest'));
  assert.equal(result.revision, 1);
  assert.equal(latest.value.schemaVersion, 1);
  assert.equal(latest.value.revision, 1);
  assert.equal(latest.value.sourceEnvironment, 'tomatodev');
});

test('new Budget transactions and tastings refresh spending, points, and wine without TomatoFarm', () => {
  const now = new Date('2026-07-18T03:00:00.000Z');
  const categories = [{ id: 'living', name: '생활', kind: 'expense', budgetRhythm: 'variable', target: 840000 }];
  const history = Array.from({ length: 40 }, (_, index) => ({
    id: `history-${index}`,
    type: 'card_payment',
    categoryId: 'living',
    category: '생활',
    amount: 10000,
    occurredAt: new Date(now.getTime() - (index + 1) * 86400000),
  }));
  const appSettings = {
    biweeklyStartDate: '2026-07-06',
    rewardSavings: {
      enabled: true,
      pointItems: [{ id: 'winePurchase', label: '와인구매 포인트', rate: .3, targetAmount: 120000, enabled: true, order: 10 }],
    },
  };
  const base = buildCanonicalBudgetDashboardSource({
    transactions: history,
    categories,
    appSettings,
    tastings: [{ id: 'old', bottleId: 'b1', tastedAt: '2026-07-01T12:00:00Z', taewooScore: 3.5 }],
    bottles: [{ id: 'b1', name: 'Old wine' }, { id: 'b2', name: 'New wine' }],
    now,
  });
  const updated = buildCanonicalBudgetDashboardSource({
    transactions: [...history, {
      id: 'new-spend', type: 'card_payment', categoryId: 'living', category: '생활', amount: 5000,
      occurredAt: new Date('2026-07-18T02:00:00.000Z'),
    }],
    categories,
    appSettings,
    tastings: [
      { id: 'old', bottleId: 'b1', tastedAt: '2026-07-01T12:00:00Z', taewooScore: 3.5 },
      { id: 'new', bottleId: 'b2', tastedAt: '2026-07-18T01:00:00Z', taewooScore: 4.5 },
    ],
    bottles: [{ id: 'b1', name: 'Old wine' }, { id: 'b2', name: 'New wine' }],
    now,
  });

  assert.equal(updated.spending.monthSpent, base.spending.monthSpent + 5000);
  assert.equal(updated.spending.twoWeek.spent, base.spending.twoWeek.spent + 5000);
  assert.ok(updated.points.balance < base.points.balance);
  assert.equal(updated.wine.name, 'New wine');
});

test('default DayBird two-week spending range exactly matches the canonical Budget cycle', () => {
  const now = new Date('2026-07-06T03:00:00.000Z');
  const spending = buildSpendingSnapshot({ now, appSettings: {}, transactions: [], categories: [] });
  const canonical = cycleRangeForDate(toKstPseudoLocalDate(now), '');
  const expected = {
    startDate: localDateKeyForTest(canonical.start),
    endDate: localDateKeyForTest(canonical.end),
  };

  assert.deepEqual(
    { startDate: spending.twoWeek.startDate, endDate: spending.twoWeek.endDate },
    expected,
  );
  assert.deepEqual(expected, { startDate: '2026-07-06', endDate: '2026-07-19' });
});

test('TomatoDev raw workouts and dev-only settings build the strict source snapshot contract', async () => {
  const fetched = await fetchTomatoDevDaybirdSnapshot('김_태우', {
    rawSource: tomatoDevRawSource,
    generatedAt: 1784368800000,
    reason: 'fixture',
  });
  assert.equal(tomatoDevSnapshot.sourceEnvironment, 'tomatodev');
  assert.equal(tomatoDevSnapshot.schemaVersion, 1);
  assert.equal(tomatoDevSnapshot.running.goal.targetPaceSecPerKm, 330);
  assert.equal(tomatoDevSnapshot.season.id, tomatoDevExpected.seasonId);
  assert.equal(tomatoDevSnapshot.season.week, tomatoDevExpected.seasonWeek);
  assert.equal(tomatoDevSnapshot.nutrition.actualKcal, tomatoDevExpected.actualKcal);
  assert.equal(tomatoDevSnapshot.nutrition.targetKcal, tomatoDevExpected.targetKcal);
  assert.equal(tomatoDevSnapshot.nutrition.progress, tomatoDevExpected.nutritionProgress);
  assert.equal(tomatoDevSnapshot.nutrition.proteinG, tomatoDevExpected.proteinG);
  assert.equal(tomatoDevSnapshot.running.distance.actual, tomatoDevExpected.runningDistanceKm);
  assert.equal(tomatoDevSnapshot.running.sessions.actual, tomatoDevExpected.runningSessions);
  assert.equal(tomatoDevSnapshot.running.trend.sampleWeeks, tomatoDevExpected.runningTrendSampleWeeks);
  assert.equal(tomatoDevSnapshot.strength.sessions.actual, tomatoDevExpected.strengthSessions);
  assert.equal(tomatoDevSnapshot.strength.totalVolumeKg, tomatoDevExpected.strengthVolumeKg);
  assert.equal(tomatoDevSnapshot.strength.volumeTrend.sampleWeeks, tomatoDevExpected.strengthTrendSampleWeeks);
  assert.equal(tomatoDevSnapshot.strength.liftDeltaKg, tomatoDevExpected.liftDeltaKg);
  assert.equal(tomatoDevSnapshot.streak.current, tomatoDevExpected.streakCurrent);
  assert.deepEqual(tomatoDevSnapshot.running.recent[0], {
    dateKey: tomatoDevExpected.recentDateKey,
    distanceKm: 4.8,
    paceSecPerKm: 360,
    avgHeartRateBpm: tomatoDevExpected.recentHeartRateBpm,
    cadenceSpm: 169,
  });
  const currentGoal = tomatoDevSnapshot.seasonGoals.find(goal => goal.weekStart === tomatoDevExpected.currentGoalWeekStart);
  assert.equal(currentGoal.state, tomatoDevExpected.currentGoalState);
  assert.equal(currentGoal.items.find(item => item.type === 'strength').state, tomatoDevExpected.currentStrengthState);
  for (const [id, expected] of [
    ['strength:weekly-sessions', tomatoDevExpected.currentWeeklyStrength],
    ['running:weekly-distance', tomatoDevExpected.currentWeeklyRunningDistance],
    ['running:weekly-sessions', tomatoDevExpected.currentWeeklyRunningSessions],
  ]) {
    const metric = currentGoal.items.find(item => item.id === id);
    assert.deepEqual(
      { actual: metric.actual, target: metric.target, state: metric.state },
      expected,
    );
    assert.equal(metric.attained, metric.actual >= metric.target);
    assert.equal(metric.ratio, metric.actual / metric.target);
  }
  assert.deepEqual(fetched, tomatoDevSnapshot);
});

test('TomatoDev calorie credit golden contract uses root gym/CF/swimming fields', () => {
  const golden = tomatoDevDomainGolden.calorieCredit;
  assert.equal(
    calcTomatoDevExerciseCalorieCredit(golden.plan, golden.rootDay),
    golden.expectedRootCredit,
  );
  assert.equal(
    calcTomatoDevExerciseCalorieCredit(golden.plan, golden.nestedOnlyDay),
    golden.expectedNestedOnlyCredit,
  );
  const todayKey = '2026-07-15';
  const dietBase = {
    height: 180, weight: 80, bodyFatPct: 20, age: 30,
    targetWeight: 75, targetBodyFatPct: 15, activityFactor: 1.3,
    lossRatePerWeek: .009, refeedKcal: 5000, refeedDays: [0, 6],
  };
  const rawBase = {
    registry: { schemaVersion: 2, seasons: [] },
    workouts: { [todayKey]: golden.rootDay },
    dietPlan: { ...dietBase, advancedMode: false },
    todayKey,
    generatedAt: 1,
  };
  const withoutCredit = buildTomatoDevSnapshotFromRaw(rawBase);
  const withCredit = buildTomatoDevSnapshotFromRaw({
    ...rawBase,
    dietPlan: { ...dietBase, ...golden.plan },
  });
  assert.equal(
    withCredit.nutrition.targetKcal - withoutCredit.nutrition.targetKcal,
    golden.expectedRootCredit,
  );
});

test('TomatoDev running goals retain the sport-specific pace window', () => {
  const golden = tomatoDevDomainGolden.runningWindow;
  const evaluation = evaluateRawRunningPaceGoal({
    plan: golden.plan,
    activities: [],
    season: golden.season,
    todayKey: golden.todayKey,
  });
  assert.equal(evaluation.startDate, golden.expectedStartDate);
  assert.equal(evaluation.endDate, golden.expectedEndDate);

  const snapshot = buildTomatoDevSnapshotFromRaw({
    registry: { schemaVersion: 2, seasons: [golden.season] },
    workouts: {},
    workoutPlan: {},
    runningPlan: golden.plan,
    board: { benchmarks: [], cycles: [], steps: [] },
    dietPlan: {},
    todayKey: golden.todayKey,
    generatedAt: 1,
  });
  const runningGoals = snapshot.seasonGoals.filter(week => week.runningPace);
  assert.deepEqual(runningGoals.map(week => week.weekStart), golden.expectedGoalWeeks);
  assert.equal(snapshot.seasonGoals.find(week => week.weekStart === golden.excludedGoalWeek)?.runningPace, null);
  for (const week of runningGoals) {
    assert.equal(week.runningPace.startDate, golden.expectedStartDate);
    assert.equal(week.runningPace.endDate, golden.expectedEndDate);
  }
});

test('TomatoDev Wendler golden prescriptions match board-core week and TM-anchor math', () => {
  const golden = tomatoDevDomainGolden.wendler;
  const [w531, w863] = golden.board.benchmarks;
  assert.deepEqual(
    pickPrescription(tomatoDevWendlerPrescriptionForWeek(golden.board, w531, golden.w531Week)),
    golden.w531Expected,
  );
  assert.deepEqual(
    pickPrescription(tomatoDevWendlerPrescriptionForWeek(golden.board, w531, golden.w531AnchoredWeek)),
    golden.w531AnchoredExpected,
  );
  assert.deepEqual(
    pickPrescription(tomatoDevWendlerPrescriptionForWeek(golden.board, w863, golden.w863Week)),
    golden.w863Expected,
  );

  const snapshot = buildTomatoDevSnapshotFromRaw({
    registry: { schemaVersion: 2, seasons: [golden.season] },
    workouts: {},
    workoutPlan: {},
    runningPlan: {
      paceMode: 'manual', targetPaceSecPerKm: 330,
      startDate: golden.season.startDate, endDate: golden.season.endDate,
    },
    board: golden.board,
    dietPlan: {},
    todayKey: '2026-07-18',
    generatedAt: 1,
  });
  const currentWeek = snapshot.seasonGoals.find(week => week.weekStart === golden.w531Week);
  const benchGoal = currentWeek.items.find(item => item.exerciseId === w531.exerciseId);
  assert.equal(benchGoal.detail, '90kg ×3+');
  assert.doesNotMatch(benchGoal.detail, /50kg/);
});

test('TomatoDev raw pace evaluator mirrors single-run and weekly load holds and really relaxes after two misses', () => {
  const spike = evaluateRawRunningPaceGoal({
    season: runningGuardrailsFixture.season,
    ...runningGuardrailsFixture.distanceSpike,
  });
  assert.equal(
    spike.weeks.find(week => week.weekStart === runningGuardrailsFixture.distanceSpike.weekStart).holdReason,
    runningGuardrailsFixture.distanceSpike.holdReason,
  );
  const weeklySpike = evaluateRawRunningPaceGoal({
    season: runningGuardrailsFixture.season,
    ...runningGuardrailsFixture.weeklyDistanceSpike,
  });
  const weeklySpikeWeek = weeklySpike.weeks.find(
    week => week.weekStart === runningGuardrailsFixture.weeklyDistanceSpike.weekStart,
  );
  assert.equal(weeklySpikeWeek.holdReason, runningGuardrailsFixture.weeklyDistanceSpike.holdReason);
  assert.equal(
    weeklySpikeWeek.previousWeekDistanceKm,
    runningGuardrailsFixture.weeklyDistanceSpike.previousWeekDistanceKm,
  );
  assert.equal(weeklySpikeWeek.distanceKm, runningGuardrailsFixture.weeklyDistanceSpike.distanceKm);
  assert.equal(weeklySpikeWeek.weeklyDistanceSpike, true);
  assert.equal(weeklySpikeWeek.nextTargetPaceSecPerKm, weeklySpikeWeek.targetPaceSecPerKm);
  const partialOpening = evaluateRawRunningPaceGoal({
    season: runningGuardrailsFixture.season,
    ...runningGuardrailsFixture.partialOpeningWeek,
  });
  const partialOpeningWeek = partialOpening.weeks.find(
    week => week.weekStart === runningGuardrailsFixture.partialOpeningWeek.weekStart,
  );
  assert.equal(partialOpeningWeek.previousWeekDistanceKm, runningGuardrailsFixture.partialOpeningWeek.previousWeekDistanceKm);
  assert.equal(partialOpeningWeek.distanceKm, runningGuardrailsFixture.partialOpeningWeek.distanceKm);
  assert.equal(partialOpeningWeek.previousWeekComplete, false);
  assert.equal(partialOpeningWeek.weeklyDistanceSpike, false);
  assert.equal(partialOpeningWeek.holdReason, null);
  assert.ok(partialOpeningWeek.nextTargetPaceSecPerKm < partialOpeningWeek.targetPaceSecPerKm);
  const reset = evaluateRawRunningPaceGoal({
    season: runningGuardrailsFixture.season,
    ...runningGuardrailsFixture.twoMissReset,
  });
  const resetWeek = reset.weeks.find(week => week.weekStart === runningGuardrailsFixture.twoMissReset.weekStart);
  assert.equal(resetWeek.holdReason, runningGuardrailsFixture.twoMissReset.holdReason);
  assert.equal(resetWeek.nextTargetPaceSecPerKm, runningGuardrailsFixture.twoMissReset.nextTargetPaceSecPerKm);
});

test('TomatoDev REST loader resolves the shared owner and reads only raw workouts plus dev settings', async () => {
  const settings = {
    tomatodev_season_registry_v3: tomatoDevRawSource.registry,
    tomatodev_season_summer_workout_plan_v4: tomatoDevRawSource.workoutPlan,
    tomatodev_season_summer_running_plan_v3: tomatoDevRawSource.runningPlan,
    tomatodev_season_summer_test_board_v3: tomatoDevRawSource.board,
    diet_plan: tomatoDevRawSource.dietPlan,
  };
  let queryBody;
  let signInCalls = 0;
  const firestoreAuthorizations = [];
  const fetchImpl = async (url, request = {}) => {
    if (isReaderSignIn(url)) {
      signInCalls += 1;
      return readerSignInResponse(request, 'loader-reader-token');
    }
    firestoreAuthorizations.push(request.headers?.Authorization);
    const decodedUrl = decodeURIComponent(url);
    if (decodedUrl.includes('/_accounts/김_태우?')) {
      return okJson(firestoreDocument('_accounts/김_태우', { dataOwnerVersion: 2, dataOwnerId: '김_태우' }));
    }
    if (decodedUrl.includes(':runQuery?')) {
      queryBody = JSON.parse(request.body);
      return okJson(Object.entries(tomatoDevRawSource.workouts).map(([dateKey, day]) => ({
        document: firestoreDocument(`users/김_태우/workouts/${dateKey}`, day),
      })));
    }
    const documentId = decodedUrl.split('?')[0].split('/').at(-1);
    if (settings[documentId]) {
      return okJson(firestoreDocument(`users/김_태우/settings/${documentId}`, { value: settings[documentId] }));
    }
    return { status: 404, ok: false, json: async () => ({}) };
  };

  const loaded = await loadTomatoDevRawSource('김_태우', {
    fetchImpl,
    todayKey: tomatoDevRawSource.todayKey,
    ...readerTestOptions(),
  });
  assert.deepEqual(loaded.registry, tomatoDevRawSource.registry);
  assert.deepEqual(loaded.workouts, tomatoDevRawSource.workouts);
  assert.equal(signInCalls, 1);
  assert.ok(firestoreAuthorizations.length > 1);
  assert.ok(firestoreAuthorizations.every(value => value === 'Bearer loader-reader-token'));
  assert.match(queryBody.structuredQuery.where.compositeFilter.filters[0].fieldFilter.value.referenceValue, /users\/김_태우\/workouts/);
});

test('TomatoDev sparse-run loader paginates past 120 non-running workout days', async () => {
  const settings = {
    tomatodev_season_registry_v3: tomatoDevRawSource.registry,
    tomatodev_season_summer_workout_plan_v4: tomatoDevRawSource.workoutPlan,
    tomatodev_season_summer_running_plan_v3: tomatoDevRawSource.runningPlan,
    tomatodev_season_summer_test_board_v3: tomatoDevRawSource.board,
    diet_plan: tomatoDevRawSource.dietPlan,
  };
  const queryBodies = [];
  const primaryRunDate = '2026-07-17';
  const olderNonRunningDates = Array.from({ length: 120 }, (_, index) => addDateDaysForTest('2026-06-02', -index));
  const olderRunDates = ['2026-01-27', '2026-01-20', '2026-01-13', '2026-01-06'];
  const runDay = (heartRate) => ({
    workoutSessions: [{
      running: true,
      runDistance: 5,
      runDurationMin: 30,
      runRouteSummary: { avgHeartRateBpm: heartRate, cadenceSpm: 170 },
    }],
  });
  let signInCalls = 0;
  const firestoreAuthorizations = [];
  const fetchImpl = async (url, request = {}) => {
    if (isReaderSignIn(url)) {
      signInCalls += 1;
      return readerSignInResponse(request, 'sparse-reader-token');
    }
    firestoreAuthorizations.push(request.headers?.Authorization);
    const decodedUrl = decodeURIComponent(url);
    if (decodedUrl.includes('/_accounts/김_태우?')) {
      return okJson(firestoreDocument('_accounts/김_태우', { dataOwnerVersion: 2, dataOwnerId: '김_태우' }));
    }
    if (decodedUrl.includes(':runQuery?')) {
      const body = JSON.parse(request.body);
      queryBodies.push(body);
      if (queryBodies.length === 1) {
        return okJson([{ document: firestoreDocument(`users/김_태우/workouts/${primaryRunDate}`, runDay(155)) }]);
      }
      if (queryBodies.length === 2) {
        return okJson(olderNonRunningDates.map(dateKey => ({
          document: firestoreDocument(`users/김_태우/workouts/${dateKey}`, { bKcal: 0 }),
        })));
      }
      if (queryBodies.length === 3) {
        return okJson(olderRunDates.map((dateKey, index) => ({
          document: firestoreDocument(`users/김_태우/workouts/${dateKey}`, runDay(150 - index)),
        })));
      }
      throw new Error('sparse runner pagination must stop after finding five runs');
    }
    const documentId = decodedUrl.split('?')[0].split('/').at(-1);
    if (settings[documentId]) {
      return okJson(firestoreDocument(`users/김_태우/settings/${documentId}`, { value: settings[documentId] }));
    }
    return { status: 404, ok: false, json: async () => ({}) };
  };

  const loaded = await loadTomatoDevRawSource('김_태우', {
    fetchImpl,
    todayKey: tomatoDevRawSource.todayKey,
    ...readerTestOptions(),
  });
  const cursor = queryBodies[2].structuredQuery.startAt;
  const expectedCursorName = `projects/tomatodev-arete/databases/(default)/documents/users/김_태우/workouts/${olderNonRunningDates.at(-1)}`;
  assert.equal(queryBodies.length, 3);
  assert.equal(signInCalls, 1);
  assert.ok(firestoreAuthorizations.every(value => value === 'Bearer sparse-reader-token'));
  assert.equal(cursor.before, false);
  assert.equal(cursor.values[0].referenceValue, expectedCursorName);
  assert.equal(listRunningActivities(loaded.workouts).length, 5);

  const snapshot = buildTomatoDevSnapshotFromRaw({ ...loaded, generatedAt: 1 });
  assert.deepEqual(snapshot.running.recent.map(run => run.dateKey), [primaryRunDate, ...olderRunDates]);
});

test('TomatoDev raw REST bridge fails closed on missing settings or a falsely-labelled source', async () => {
  assert.throws(
    () => resolveTomatoDevOwnerFromAccount('김_태우', {
      dataOwnerVersion: 2,
      dataOwnerId: '김_태우(guest)',
    }),
    /owner is unresolved/,
  );
  assert.throws(
    () => resolveTomatoDevOwnerFromAccount('김_태우', { dataOwnerVersion: 1, dataOwnerId: '김_태우' }),
    /owner is unresolved/,
  );
  await assert.rejects(
    fetchTomatoDevDaybirdSnapshot('김_태우', {
      fetchImpl: async (url, request = {}) => (isReaderSignIn(url)
        ? readerSignInResponse(request, 'missing-source-reader-token')
        : { status: 404, ok: false, json: async () => ({ error: { code: 404 } }) }),
      ...readerTestOptions(),
    }),
    /owner is unresolved/,
  );
  assert.throws(
    () => normalizeTomatoDevDaybirdSnapshot({ ...tomatoDevSnapshot, sourceEnvironment: 'tomatofarm' }),
    /source is invalid/,
  );
  assert.throws(
    () => normalizeTomatoDevDaybirdSnapshot({ ...tomatoDevSnapshot, nutrition: undefined }),
    /nutrition contract is incomplete/,
  );
});

test('DayBird refresh has no production Tomato endpoint or public aggregate-document fallback', async () => {
  const [refreshSource, tomatoDevSource] = await Promise.all([
    fs.readFile(new URL('../api/_lib/daybird.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../api/_lib/tomatodev-snapshot.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(refreshSource, /TOMATO_DASHBOARD_REFRESH_URL|DASHBOARD_INTERNAL_HMAC/);
  assert.doesNotMatch(tomatoDevSource, /tomatodev_daybird_snapshot/);
  assert.match(tomatoDevSource, /collectionId: 'workouts'/);
  assert.match(tomatoDevSource, /tomatodev_season_registry_v3/);
});

function localDateKeyForTest(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function pickPrescription(value) {
  return {
    programWeek: value.programWeek,
    cycleWeek: value.cycleWeek,
    schemeWeek: value.schemeWeek,
    tmAnchorWeekStart: value.tmAnchorWeekStart,
    tmKg: value.tmKg,
    topSet: value.topSet,
  };
}

function addDateDaysForTest(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readerTestOptions() {
  return {
    readerEmail: readerTestEmail,
    readerPassword: readerTestPassword,
    readerTokenCache: new Map(),
  };
}

function isReaderSignIn(url) {
  return String(url).startsWith('https://identitytoolkit.googleapis.com/');
}

function readerSignInResponse(request, idToken) {
  assert.deepEqual(JSON.parse(request.body), {
    email: readerTestEmail,
    password: readerTestPassword,
    returnSecureToken: true,
  });
  return okJson({ idToken, expiresIn: '3600' });
}

function okJson(value) {
  return { status: 200, ok: true, json: async () => value };
}

function firestoreDocument(path, value) {
  return {
    name: `projects/tomatodev-arete/databases/(default)/documents/${path}`,
    fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
  };
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])) } };
}
