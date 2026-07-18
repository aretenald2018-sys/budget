const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const DEFAULT_DIET_PLAN = Object.freeze({
  height: 0, weight: 0, bodyFatPct: 0, age: 0,
  targetWeight: 0, targetBodyFatPct: 0, activityFactor: 1.3,
  lossRatePerWeek: 0.009, refeedKcal: 5000, refeedDays: [0, 6],
  advancedMode: false, deficitProteinPct: 41, deficitCarbPct: 50, deficitFatPct: 9,
  refeedProteinPct: 29, refeedCarbPct: 60, refeedFatPct: 11,
  exerciseCalorieCredit: false, exerciseKcalGym: 250, exerciseKcalCF: 300,
  exerciseKcalSwimming: 200,
});

export function buildTomatoDevSnapshotFromRaw({
  registry,
  workouts = {},
  workoutPlan = null,
  runningPlan = null,
  board = null,
  dietPlan = null,
  todayKey,
  generatedAt = Date.now(),
  reason = 'scheduled',
} = {}) {
  if (!isObject(registry) || !Array.isArray(registry.seasons)) throw unavailable('TomatoDev season registry is invalid');
  if (!DATE_KEY_PATTERN.test(String(todayKey || ''))) throw unavailable('TomatoDev todayKey is invalid');
  if (!isObject(dietPlan)) throw unavailable('TomatoDev diet plan is missing');
  const season = registry.seasons.map(normalizeSeason).filter(Boolean)
    .find(row => row.startDate <= todayKey && todayKey <= row.endDate) || null;
  if (season && (!isObject(workoutPlan) || !isObject(runningPlan) || !isObject(board))) {
    throw unavailable('TomatoDev active-season settings are incomplete');
  }

  const activities = listRunningActivities(workouts);
  const recent = activities.slice().sort((left, right) => (
    right.dateKey.localeCompare(left.dateKey)
    || number(right.startedAt) - number(left.startedAt)
    || number(right.sessionIndex) - number(left.sessionIndex)
  )).slice(0, 5).map(activity => ({
    dateKey: activity.dateKey,
    distanceKm: round(activity.distanceKm, 2),
    paceSecPerKm: positiveIntegerOrNull(activity.avgPaceSecPerKm),
    avgHeartRateBpm: positiveIntegerOrNull(activity.avgHeartRateBpm),
    cadenceSpm: positiveIntegerOrNull(activity.cadenceSpm),
  }));
  const nutrition = buildNutrition(workouts[todayKey] || {}, dietPlan, todayKey);

  if (!season) {
    return {
      schemaVersion: 1,
      sourceEnvironment: 'tomatodev',
      generatedAt: Number(generatedAt) || Date.now(),
      reason: String(reason || 'scheduled').slice(0, 80),
      state: 'no-season',
      season: null,
      seasonGoals: [],
      running: { goal: collectingGoal(), recent },
      nutrition,
    };
  }

  const pace = evaluateRawRunningPaceGoal({ plan: runningPlan, activities, season, todayKey });
  const currentWeekStart = mondayOf(todayKey);
  const currentWeekEnd = addDays(currentWeekStart, 6);
  const currentActivities = activities.filter(row => currentWeekStart <= row.dateKey && row.dateKey <= todayKey);
  const currentRunning = summarizeRunning(currentActivities);
  const distanceTarget = nonNegative(runningPlan.weeklyDistanceKm);
  const sessionTarget = nonNegative(runningPlan.weeklySessions);
  const strength = buildStrength(workouts, workoutPlan, season, todayKey);
  const seasonGoals = buildSeasonGoals({
    season,
    board,
    workoutPlan,
    runningPlan,
    pace,
    workouts,
    activities,
    todayKey,
  });
  const streak = workoutStreak(workouts, season, todayKey);
  const remainingDistance = Math.max(0, distanceTarget - currentRunning.distanceKm);
  const firstBenchmark = activeBenchmarks(board)[0] || null;
  const activeCycle = firstBenchmark
    ? (board.cycles || []).filter(cycle => cycle.groupId === firstBenchmark.groupId && cycle.status === 'active')
      .sort((left, right) => String(right.startDate).localeCompare(String(left.startDate)))[0] || null
    : null;

  return {
    schemaVersion: 1,
    sourceEnvironment: 'tomatodev',
    generatedAt: Number(generatedAt) || Date.now(),
    reason: String(reason || 'scheduled').slice(0, 80),
    state: 'ready',
    season: {
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      daysRemaining: Math.max(0, daysBetween(todayKey, season.endDate)),
      week: activeCycle ? Math.max(1, Math.floor(daysBetween(mondayOf(activeCycle.startDate), currentWeekStart) / 7) + 1) : null,
    },
    seasonGoals,
    running: {
      distance: progress(currentRunning.distanceKm, distanceTarget),
      sessions: progress(currentRunning.activityCount, sessionTarget),
      trend: runningTrend(activities, season, todayKey),
      goal: {
        mode: String(pace.mode || 'collecting'),
        targetPaceSecPerKm: positiveIntegerOrNull(pace.targetPaceSecPerKm),
        baselinePaceSecPerKm: positiveIntegerOrNull(pace.baselinePaceSecPerKm),
        adaptiveRatePct: finiteOrNull(pace.adaptiveRatePct),
        actualPaceSecPerKm: positiveIntegerOrNull(pace.actualPaceSecPerKm),
        avgHeartRateBpm: positiveIntegerOrNull(pace.avgHeartRateBpm),
        heartRateCaution: !!pace.heartRateCaution,
        status: String(pace.status || 'collecting'),
      },
      recent,
    },
    nutrition,
    strength,
    streak: {
      ...streak,
      week: Array.from({ length: 7 }, (_, index) => {
        const dateKey = addDays(currentWeekStart, index);
        return {
          dateKey,
          inSeason: season.startDate <= dateKey && dateKey <= season.endDate,
          done: dateKey <= todayKey && exerciseDaySuccess(workouts[dateKey]),
          today: dateKey === todayKey,
          future: dateKey > todayKey,
        };
      }),
    },
    nextPlan: {
      health: firstBenchmark
        ? `${firstBenchmark.label || firstBenchmark.exerciseId || '헬스'}${firstBenchmark.program === 'wendler' ? ' 웬들러' : ''}`
        : '헬스 계획 확인',
      running: remainingDistance > 0 ? `러닝 ${round(remainingDistance, 1)}km 남음` : '러닝 주간 목표 완료',
    },
  };
}

export function listRunningActivities(workouts = {}) {
  const activities = [];
  for (const [dateKey, day] of Object.entries(workouts || {}).sort(([left], [right]) => left.localeCompare(right))) {
    getSessions(day).forEach((session, sessionIndex) => {
      const summary = isObject(session.runRouteSummary) ? session.runRouteSummary : {};
      const durationSec = Math.max(0, Math.floor(number(session.runDurationMin) * 60 + number(session.runDurationSec)))
        || Math.max(0, Math.floor(number(summary.durationSec)));
      const distanceKm = positive(session.runDistance) ?? positive(summary.distanceKm) ?? 0;
      const hasRecord = session.running === true || durationSec > 0 || distanceKm > 0 || positive(summary.pointCount);
      if (!hasRecord || (durationSec <= 0 && distanceKm <= 0)) return;
      const avgPaceSecPerKm = positive(session.runAvgPaceSecPerKm)
        ?? positive(summary.avgPaceSecPerKm)
        ?? (distanceKm > 0 && durationSec > 0 ? Math.round(durationSec / distanceKm) : 0);
      activities.push({
        dateKey,
        sessionIndex,
        startedAt: number(session.runStartedAt ?? summary.startedAt) || null,
        distanceKm,
        durationSec,
        avgPaceSecPerKm,
        avgHeartRateBpm: positive(summary.avgHeartRateBpm),
        cadenceSpm: positive(summary.cadenceSpm),
        paceCheck: session.runPaceCheck === true || summary.paceCheck === true,
      });
    });
  }
  return activities;
}

function buildNutrition(day, rawPlan, todayKey) {
  const sum = suffix => ['b', 'l', 'd', 's'].reduce((total, prefix) => total + nonNegative(day?.[`${prefix}${suffix}`]), 0);
  const actualKcal = Math.round(sum('Kcal'));
  const targetKcal = Math.max(0, Math.round(dayTargetKcal(rawPlan, todayKey, day)));
  return {
    actualKcal,
    targetKcal,
    progress: targetKcal > 0 ? Math.min(100, Math.round((actualKcal / targetKcal) * 100)) : 0,
    proteinG: round(sum('Protein'), 1),
    carbsG: round(sum('Carbs'), 1),
    fatG: round(sum('Fat'), 1),
  };
}

function dayTargetKcal(rawPlan, todayKey, day) {
  const plan = { ...DEFAULT_DIET_PLAN, ...(rawPlan || {}) };
  const bmr = plan.bodyFatPct > 0
    ? Math.round(370 + 21.6 * (plan.weight * (1 - plan.bodyFatPct / 100)))
    : Math.round(10 * plan.weight + 6.25 * plan.height - 5 * plan.age + 5);
  const tdee = Math.ceil(Math.round(bmr * number(plan.activityFactor, 1.3)) / 100) * 100;
  const fatToLose = Math.max(0, plan.weight * (number(plan.bodyFatPct) - number(plan.targetBodyFatPct)) / 100);
  const fatFraction = plan.bodyFatPct >= 25 ? .82 : plan.bodyFatPct >= 20 ? .78 : plan.bodyFatPct >= 15 ? .75 : plan.bodyFatPct >= 10 ? .68 : .6;
  const totalLoss = Math.max(fatToLose / fatFraction, Math.max(number(plan.weight) - number(plan.targetWeight), 0));
  const weeklyLossKg = number(plan.weight) * number(plan.lossRatePerWeek, .009);
  const dailyDeficit = weeklyLossKg * (7700 / 7 / number(plan.activityFactor, 1.3));
  const weeklyKcal = Math.round((tdee - dailyDeficit) * 7);
  const refeedCount = Array.isArray(plan.refeedDays) && plan.refeedDays.length ? plan.refeedDays.length : 2;
  const deficitCount = 7 - refeedCount;
  const deficitKcal = deficitCount > 0 ? Math.round((weeklyKcal - number(plan.refeedKcal, 5000)) / deficitCount) : Math.round(weeklyKcal / 7);
  const refeedKcal = refeedCount > 0 ? Math.round(number(plan.refeedKcal, 5000) / refeedCount) : 0;
  const dayOfWeek = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  let target = (plan.refeedDays || []).includes(dayOfWeek) ? refeedKcal : deficitKcal;
  target += calcTomatoDevExerciseCalorieCredit(plan, day);
  void totalLoss;
  return target;
}

// Mirrors TomatoDev calc.js. Gym/CF/swimming credit is intentionally based on
// the root day record; only trusted running calories aggregate session summaries.
export function calcTomatoDevExerciseCalorieCredit(plan = {}, day = {}) {
  if (!plan.advancedMode || !plan.exerciseCalorieCredit || !day) return 0;
  let credit = 0;
  const hasGym = (Array.isArray(day.exercises) ? day.exercises : []).some(entry => (
    (Array.isArray(entry?.sets) ? entry.sets : []).some(set => (
      set && (set.done === true || (number(set.kg) > 0 && number(set.reps) > 0))
    ))
  ));
  if (hasGym) credit += number(plan.exerciseKcalGym) || 250;
  if (day.cf) credit += number(plan.exerciseKcalCF) || 300;
  if (day.swimming) credit += number(plan.exerciseKcalSwimming) || 200;
  let runningCredit = 0;
  for (const session of getSessions(day)) {
    const summary = session.runRouteSummary;
    if (!isObject(summary) || !positive(summary.calories)) continue;
    const trusted = ['wear', 'device', 'health-connect'].includes(String(summary.calorieSource || ''))
      || (summary.calorieSource === 'estimated' && summary.calorieMethod === 'acsm-speed-grade-v1'
        && number(summary.calorieWeightKg) >= 25 && number(summary.calorieWeightKg) <= 300);
    if (trusted) runningCredit += number(summary.calories);
  }
  return credit + Math.round(runningCredit);
}

export function evaluateRawRunningPaceGoal({ plan = {}, activities = [], season, todayKey }) {
  const mode = plan.paceMode === 'manual' ? 'manual' : 'adaptive-weekly';
  const referenceDistanceKm = Math.max(1, positive(plan.referenceDistanceKm) || 5);
  const adaptiveRatePct = [.5, 1, 1.5].includes(Number(plan.adaptiveRatePct)) ? Number(plan.adaptiveRatePct) : 1;
  const startDate = DATE_KEY_PATTERN.test(String(plan.startDate || '')) ? plan.startDate : season.startDate;
  const endDate = DATE_KEY_PATTERN.test(String(plan.endDate || '')) ? plan.endDate : season.endDate;
  const baselineActivities = activities.filter(row => (
    addDays(startDate, -28) <= row.dateKey && row.dateKey < startDate && comparableRun(row, referenceDistanceKm)
  ));
  const baselinePaceSecPerKm = positiveIntegerOrNull(plan.baselinePaceSecPerKm)
    || (baselineActivities.length >= 3 ? median(baselineActivities.map(row => row.avgPaceSecPerKm)) : null);
  let target = positiveIntegerOrNull(plan.targetPaceSecPerKm) || baselinePaceSecPerKm;
  if (!target) return { mode, status: 'collecting', adaptiveRatePct, baselinePaceSecPerKm, weeks: [] };
  const currentWeek = mondayOf(todayKey);
  const weeks = [];
  let misses = 0;
  let weekNumber = 1;
  for (let weekStart = mondayOf(startDate); weekStart <= endDate; weekStart = addDays(weekStart, 7)) {
    const weekEnd = minDateKey(addDays(weekStart, 6), endDate);
    const rows = activities.filter(row => maxDateKey(weekStart, startDate) <= row.dateKey && row.dateKey <= weekEnd);
    const comparable = rows.filter(row => comparableRun(row, referenceDistanceKm));
    const explicit = comparable.filter(row => row.paceCheck);
    const scheduled = comparable.filter(row => new Date(`${row.dateKey}T00:00:00Z`).getUTCDay() === Math.max(0, Math.min(6, Math.round(number(plan.paceCheckWeekday, 3)))));
    const check = (explicit.length ? explicit : scheduled).sort((a, b) => a.avgPaceSecPerKm - b.avgPaceSecPerKm)[0] || null;
    const completed = weekStart < currentWeek;
    const future = weekStart > currentWeek;
    const weekTarget = Math.round(target);
    const actual = positiveIntegerOrNull(check?.avgPaceSecPerKm);
    let state = future ? 'future' : completed ? 'missed' : 'planned';
    if (actual) state = actual <= weekTarget ? 'achieved' : 'attempted';
    const distanceKm = round(rows.reduce((sum, row) => sum + row.distanceKm, 0), 2);
    const recovery = mode === 'adaptive-weekly' && Math.max(0, Math.round(number(plan.recoveryEveryWeeks, 4))) > 0
      && weekNumber % Math.round(number(plan.recoveryEveryWeeks, 4)) === 0;
    const loadSpike = hasSingleRunDistanceSpike(activities, rows);
    const weeklyDistanceLoad = runningWeeklyDistanceLoad(activities, weekStart, { startDate, endDate });
    let holdReason = null;
    if (mode === 'adaptive-weekly' && completed) {
      if (recovery) { holdReason = 'recovery-week'; misses = 0; }
      else if (loadSpike) { holdReason = 'single-run-distance-spike'; misses = 0; }
      else if (weeklyDistanceLoad.spike) { holdReason = 'weekly-distance-spike'; misses = 0; }
      else if (!check) holdReason = 'insufficient-sample';
      else if (state === 'achieved') { target = Math.max(1, weekTarget - Math.min(5, Math.max(1, Math.round(weekTarget * adaptiveRatePct / 100)))); misses = 0; }
      else {
        misses += 1;
        holdReason = 'target-missed';
        if (misses >= 2) {
          const resetPace = recentComparableMedian(activities, referenceDistanceKm, weekEnd);
          if (resetPace) target = Math.max(target, resetPace);
          holdReason = 'two-miss-reset';
          misses = 0;
        }
      }
    }
    const avgHeartRateBpm = positiveIntegerOrNull(check?.avgHeartRateBpm);
    weeks.push({
      weekStart, weekEnd, weekNumber, state, targetPaceSecPerKm: weekTarget,
      nextTargetPaceSecPerKm: Math.round(target),
      actualPaceSecPerKm: actual, avgHeartRateBpm,
      heartRateCaution: !!(avgHeartRateBpm && positive(plan.heartRateCautionBpm) && avgHeartRateBpm >= plan.heartRateCautionBpm),
      adaptiveRatePct, mode, holdReason, distanceKm,
      previousWeekDistanceKm: weeklyDistanceLoad.previousDistanceKm,
      previousWeekComplete: weeklyDistanceLoad.previousWeekComplete,
      weeklyDistanceSpike: weeklyDistanceLoad.spike,
    });
    weekNumber += 1;
  }
  const current = weeks.find(row => row.weekStart === currentWeek) || weeks.find(row => row.weekStart > currentWeek) || weeks.at(-1);
  return {
    mode, status: current?.state || 'collecting', adaptiveRatePct, baselinePaceSecPerKm,
    startDate, endDate,
    targetPaceSecPerKm: current?.targetPaceSecPerKm || target,
    actualPaceSecPerKm: current?.actualPaceSecPerKm || null,
    avgHeartRateBpm: current?.avgHeartRateBpm || null,
    heartRateCaution: !!current?.heartRateCaution, weeks,
  };
}

function hasSingleRunDistanceSpike(activities, weekActivities) {
  return weekActivities.some(activity => {
    const distanceKm = positive(activity.distanceKm);
    if (!distanceKm || !DATE_KEY_PATTERN.test(String(activity.dateKey || ''))) return false;
    const lookbackStart = addDays(activity.dateKey, -30);
    const priorLongestKm = activities.filter(prior => (
      DATE_KEY_PATTERN.test(String(prior?.dateKey || ''))
      && lookbackStart <= prior.dateKey && prior.dateKey < activity.dateKey
    )).reduce((longest, prior) => Math.max(longest, positive(prior.distanceKm) || 0), 0);
    return priorLongestKm > 0 && distanceKm > priorLongestKm * 1.1;
  });
}

function runningWeeklyDistanceLoad(activities, weekStart, plan = {}) {
  const sumDistance = (fromDate, throughDate) => round(activities
    .filter(activity => fromDate <= activity.dateKey && activity.dateKey <= throughDate)
    .reduce((sum, activity) => sum + number(activity.distanceKm), 0), 2);
  const previousStart = addDays(weekStart, -7);
  const previousEnd = addDays(weekStart, -1);
  const previousWeekComplete = DATE_KEY_PATTERN.test(String(plan.startDate || ''))
    && DATE_KEY_PATTERN.test(String(plan.endDate || ''))
    && plan.startDate <= previousStart
    && previousEnd <= plan.endDate;
  const previousDistanceKm = sumDistance(previousStart, previousEnd);
  const currentDistanceKm = sumDistance(weekStart, addDays(weekStart, 6));
  return {
    previousDistanceKm,
    currentDistanceKm,
    previousWeekComplete,
    spike: previousWeekComplete && previousDistanceKm > 0 && currentDistanceKm > previousDistanceKm * 1.1,
  };
}

function recentComparableMedian(activities, referenceDistanceKm, throughDate) {
  const fromDate = addDays(throughDate, -27);
  const rows = activities.filter(activity => (
    fromDate <= activity.dateKey && activity.dateKey <= throughDate && comparableRun(activity, referenceDistanceKm)
  ));
  return rows.length >= 3 ? median(rows.map(activity => activity.avgPaceSecPerKm)) : null;
}

function intersectDateRange(left, right) {
  const startDate = maxDateKey(left.startDate, right.startDate);
  const endDate = minDateKey(left.endDate, right.endDate);
  return startDate <= endDate ? { startDate, endDate } : null;
}

function weeklyStrengthSessionDays(workouts, range) {
  if (!range) return 0;
  return Object.entries(workouts || {}).filter(([dateKey, day]) => (
    range.startDate <= dateKey
    && dateKey <= range.endDate
    && getSessions(day).some(session => strengthEntries(session).some(entry => completedSets(entry).length > 0))
  )).length;
}

function weeklyRunningSummary(activities, range) {
  if (!range) return { distanceKm: 0, sessions: 0 };
  const records = activities.filter(row => range.startDate <= row.dateKey && row.dateKey <= range.endDate);
  return {
    distanceKm: round(records.reduce((sum, row) => sum + number(row.distanceKm), 0), 2),
    sessions: records.length,
  };
}

function weeklyMetricGoal({ id, type, label, actual, target, unit, range, window, todayKey }) {
  const safeTarget = positive(target);
  if (!safeTarget) return null;
  const safeActual = Math.max(0, number(actual));
  const state = !range ? 'inactive'
    : safeActual >= safeTarget ? 'achieved'
      : todayKey < range.startDate ? 'future'
        : todayKey > range.endDate ? 'missed'
          : 'planned';
  return {
    id,
    type,
    label,
    state,
    detail: `${safeActual}/${safeTarget}${unit}`,
    actual: safeActual,
    target: safeTarget,
    unit,
    ratio: safeActual / safeTarget,
    attained: safeActual >= safeTarget,
    startDate: window?.startDate || null,
    endDate: window?.endDate || null,
    rangeStartDate: range?.startDate || null,
    rangeEndDate: range?.endDate || null,
  };
}

function buildSeasonGoals({ season, board, workoutPlan, runningPlan, pace, workouts, activities, todayKey }) {
  const goals = [];
  const todayWeek = mondayOf(todayKey);
  const seasonWindow = { startDate: season.startDate, endDate: season.endDate };
  const runningWindow = {
    startDate: DATE_KEY_PATTERN.test(String(runningPlan?.startDate || '')) ? runningPlan.startDate : season.startDate,
    endDate: DATE_KEY_PATTERN.test(String(runningPlan?.endDate || '')) ? runningPlan.endDate : season.endDate,
  };
  for (let weekStart = mondayOf(season.startDate); weekStart <= season.endDate; weekStart = addDays(weekStart, 7)) {
    const calendarWeekEnd = addDays(weekStart, 6);
    const weekEnd = minDateKey(calendarWeekEnd, season.endDate);
    const calendarWeek = { startDate: weekStart, endDate: calendarWeekEnd };
    const strengthRange = intersectDateRange(calendarWeek, seasonWindow);
    const runningRange = intersectDateRange(calendarWeek, runningWindow);
    const items = strengthGoals(board, workoutPlan, season, weekStart, weekEnd, todayWeek);
    const runningSummary = weeklyRunningSummary(activities, runningRange);
    items.push(...[
      weeklyMetricGoal({
        id: 'strength:weekly-sessions',
        type: 'strength-weekly',
        label: '주간 헬스 횟수',
        actual: weeklyStrengthSessionDays(workouts, strengthRange),
        target: workoutPlan.weeklySessionTarget,
        unit: '회',
        range: strengthRange,
        window: seasonWindow,
        todayKey,
      }),
      weeklyMetricGoal({
        id: 'running:weekly-distance',
        type: 'running-distance',
        label: '주간 러닝 거리',
        actual: runningSummary.distanceKm,
        target: runningPlan.weeklyDistanceKm,
        unit: 'km',
        range: runningRange,
        window: runningWindow,
        todayKey,
      }),
      weeklyMetricGoal({
        id: 'running:weekly-sessions',
        type: 'running-sessions',
        label: '주간 러닝 횟수',
        actual: runningSummary.sessions,
        target: runningPlan.weeklySessions,
        unit: '회',
        range: runningRange,
        window: runningWindow,
        todayKey,
      }),
    ].filter(Boolean));
    const runningWeek = pace.weeks.find(row => row.weekStart === weekStart);
    if (runningWeek) items.push({
      id: 'running:pace', type: 'running', label: '러닝 페이스', state: runningWeek.state,
      detail: `${formatPace(runningWeek.targetPaceSecPerKm)}${runningWeek.actualPaceSecPerKm ? ` · 실제 ${formatPace(runningWeek.actualPaceSecPerKm)}` : ''}`,
      targetPaceSecPerKm: runningWeek.targetPaceSecPerKm,
      actualPaceSecPerKm: runningWeek.actualPaceSecPerKm,
      avgHeartRateBpm: runningWeek.avgHeartRateBpm,
      heartRateCaution: runningWeek.heartRateCaution,
      holdReason: runningWeek.holdReason,
      adaptiveRatePct: runningWeek.adaptiveRatePct,
      mode: runningWeek.mode,
      startDate: pace.startDate,
      endDate: pace.endDate,
    });
    const active = items.filter(item => item.state !== 'inactive');
    const state = !active.length ? 'inactive'
      : active.some(item => item.state === 'missed') ? 'missed'
        : active.some(item => item.state === 'attempted') ? 'attempted'
          : active.every(item => item.state === 'achieved') ? 'achieved'
            : weekStart > todayWeek ? 'future' : 'planned';
    goals.push({
      weekStart, weekEnd, seasonId: season.id, state, items,
      runningPace: items.find(item => item.type === 'running') || null,
    });
  }
  return goals;
}

const W863_ORIGINAL_VERSION = 'w863-original-v1';
const WENDLER_531_TOP_SETS = Object.freeze([
  { pct: 85, reps: 5, amrap: true },
  { pct: 90, reps: 3, amrap: true },
  { pct: 95, reps: 1, amrap: true },
  { pct: 85, reps: 5, amrap: true },
  { pct: 90, reps: 3, amrap: true },
  { pct: 95, reps: 1, amrap: true },
]);
const W863_TOP_SET_PROFILES = Object.freeze({
  squat: Object.freeze({ referenceOneRmKg: 110, sets: [[80, 8, true], [85, 6, true], [90, 3, true], [80, 8, true], [85, 6, true], [90, 3, true], [65, 5, false]] }),
  ohp: Object.freeze({ referenceOneRmKg: 55, sets: [[40, 8, true], [40, 6, true], [45, 3, true], [40, 8, true], [45, 6, true], [45, 3, true], [35, 5, false]] }),
  deadlift: Object.freeze({ referenceOneRmKg: 120, sets: [[85, 8, true], [90, 6, true], [95, 3, true], [90, 8, true], [95, 6, true], [100, 3, true], [70, 5, false]] }),
  bench: Object.freeze({ referenceOneRmKg: 95, sets: [[70, 8, true], [70, 6, true], [75, 3, true], [70, 8, true], [75, 6, true], [80, 3, true], [50, 3, false]] }),
});

// Minimal port of TomatoDev board-core's authoritative Wendler cell path. It
// resolves the active cycle, program week, TM anchor and exact top-set weight.
export function tomatoDevWendlerPrescriptionForWeek(board, benchmark, weekStart) {
  if (benchmark?.program !== 'wendler' || !DATE_KEY_PATTERN.test(String(weekStart || ''))) return null;
  const cycle = (board?.cycles || []).filter(row => row.groupId === benchmark.groupId && row.status === 'active')
    .sort((left, right) => String(right.startDate || '').localeCompare(String(left.startDate || '')))[0] || null;
  if (!cycle || !DATE_KEY_PATTERN.test(String(cycle.startDate || ''))) return null;
  const config = isObject(benchmark.wendler) ? benchmark.wendler : {};
  const original = config.templateVersion === W863_ORIGINAL_VERSION || !['w531', 'custom'].includes(config.scheme);
  const cycleWeeks = original ? Math.max(7, Math.round(number(cycle.weeks))) : Math.max(1, Math.round(number(cycle.weeks, 6)));
  const cycleOffset = weeksBetween(cycle.startDate, weekStart);
  if (cycleOffset < 0 || cycleOffset >= cycleWeeks) return null;
  const rawProgramStart = [benchmark.programStartDate, config.programStartDate, benchmark.startDate, benchmark.cycleStartDate, cycle.startDate]
    .find(value => DATE_KEY_PATTERN.test(String(value || '')));
  const programStartDate = mondayOf(rawProgramStart);
  const programWeek = weeksBetween(programStartDate, weekStart) + 1;
  if (programWeek < 1) return null;
  const weeks = original ? 7 : 6;
  const cycleWeek = ((programWeek - 1) % weeks) + 1;
  const startWeek = Math.max(1, Math.min(weeks, Math.round(number(config.startWeek, 1))));
  const schemeWeek = ((cycleWeek - 1 + startWeek - 1) % weeks) + 1;
  const anchors = normalizeWendlerTmAnchors(config.tmAnchors, programStartDate, config.tmKg);
  const anchor = resolveWendlerTmAnchor(anchors, weekStart);
  const latestTmKg = anchors.at(-1)?.tmKg || positive(config.tmKg) || 0;
  const tmKg = anchor?.tmKg || latestTmKg || suggestedWendlerTm(benchmark, config.roundKg);

  if (original) {
    const profileId = inferW863Profile(benchmark, config);
    const profile = W863_TOP_SET_PROFILES[profileId];
    const configuredOneRm = positive(config.oneRmKg) || (positive(config.tmKg) ? number(config.tmKg) / .9 : profile.referenceOneRmKg);
    const oneRmKg = anchor?.tmKg && Math.abs(number(anchor.tmKg) - number(latestTmKg)) >= .001
      ? roundToPlate(number(anchor.tmKg) / .9, .5)
      : configuredOneRm;
    const [referenceKg, reps, amrap] = profile.sets[schemeWeek - 1];
    return {
      programStartDate, programWeek, cycleWeek, schemeWeek,
      tmAnchorWeekStart: anchor?.weekStart || null,
      tmKg: round(number(oneRmKg) * .9, 1),
      topSet: {
        kg: roundToPlate(referenceKg * number(oneRmKg) / profile.referenceOneRmKg, positive(config.roundKg) || 5),
        reps,
        amrap,
      },
    };
  }

  const sourceWeek = Array.isArray(config.weekMap) && config.weekMap.length
    ? config.weekMap[schemeWeek - 1]
    : null;
  const rawSets = Array.isArray(sourceWeek?.sets) && sourceWeek.sets.length ? sourceWeek.sets : null;
  const rawTopSet = rawSets?.at(-1) || WENDLER_531_TOP_SETS[schemeWeek - 1];
  const pct = Math.max(30, Math.min(110, number(rawTopSet?.pct, WENDLER_531_TOP_SETS[schemeWeek - 1].pct)));
  const reps = Math.max(1, Math.min(20, Math.round(number(rawTopSet?.reps, WENDLER_531_TOP_SETS[schemeWeek - 1].reps))));
  return {
    programStartDate, programWeek, cycleWeek, schemeWeek,
    tmAnchorWeekStart: anchor?.weekStart || null,
    tmKg,
    topSet: {
      kg: roundToPlate(tmKg * pct / 100, positive(config.roundKg) || 2.5),
      reps,
      amrap: rawTopSet?.amrap !== false,
    },
  };
}

function normalizeWendlerTmAnchors(rawAnchors, programStartDate, fallbackTmKg) {
  const source = Array.isArray(rawAnchors)
    ? rawAnchors
    : isObject(rawAnchors)
      ? Object.entries(rawAnchors).map(([weekStart, value]) => (isObject(value) ? { weekStart, ...value } : { weekStart, tmKg: value }))
      : [];
  const byWeek = new Map();
  for (const raw of source) {
    const rawKey = raw?.weekStart || raw?.startDate || raw?.date;
    const tmKg = round(raw?.tmKg ?? raw?.tm ?? raw?.kg, 1);
    if (!DATE_KEY_PATTERN.test(String(rawKey || '')) || tmKg <= 0) continue;
    const weekStart = mondayOf(rawKey);
    byWeek.set(weekStart, { weekStart, tmKg });
  }
  const fallback = round(fallbackTmKg, 1);
  if (programStartDate && fallback > 0 && !byWeek.has(programStartDate)) {
    byWeek.set(programStartDate, { weekStart: programStartDate, tmKg: fallback });
  }
  return Array.from(byWeek.values()).sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

function resolveWendlerTmAnchor(anchors, weekStart) {
  if (!anchors.length) return null;
  const week = mondayOf(weekStart);
  let chosen = null;
  for (const anchor of anchors) {
    if (weeksBetween(anchor.weekStart, week) >= 0) chosen = anchor;
    else break;
  }
  return chosen || anchors[0];
}

function suggestedWendlerTm(benchmark, roundKg) {
  const seed = benchmark?.seed?.volume || {};
  const kg = positive(seed.kg);
  const reps = positive(seed.reps);
  if (!kg || !reps) return 0;
  const oneRm = reps === 1 ? kg : kg * (1 + reps / 30);
  return roundToPlate(oneRm * .9, positive(roundKg) || 2.5);
}

function inferW863Profile(benchmark, config) {
  if (W863_TOP_SET_PROFILES[config.profileId]) return config.profileId;
  const raw = [benchmark.movementId, benchmark.exerciseId, benchmark.label, benchmark.name]
    .filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, '');
  if (/ohp|overhead|over_head|오버헤드|밀리터리|숄더프레스/.test(raw)) return 'ohp';
  if (/bench|벤치/.test(raw)) return 'bench';
  if (/dead|sumo|데드|스모/.test(raw)) return 'deadlift';
  if (/squat|스쿼트/.test(raw)) return 'squat';
  if (benchmark.groupId === 'chest') return 'bench';
  if (benchmark.groupId === 'shoulder') return 'ohp';
  if (benchmark.groupId === 'back') return 'deadlift';
  return 'squat';
}

function roundToPlate(kg, step = 2.5) {
  const safeStep = positive(step) || 2.5;
  return round(Math.round(number(kg) / safeStep) * safeStep, 1);
}

function weeksBetween(left, right) {
  return Math.round(daysBetween(mondayOf(left), mondayOf(right)) / 7);
}

function strengthGoals(board, workoutPlan, season, weekStart, weekEnd, todayWeek) {
  const rows = [];
  for (const benchmark of activeBenchmarks(board)) {
    const window = workoutPlan.exerciseSeasonWindowsByExercise?.[benchmark.exerciseId]
      || benchmark.seasonWindow || { startDate: season.startDate, endDate: season.endDate };
    const tracks = benchmark.program === 'wendler' ? ['volume'] : (benchmark.tracks || ['volume']);
    for (const track of tracks) {
      if (weekEnd < window.startDate || weekStart > window.endDate) {
        rows.push({ id: `strength:${benchmark.exerciseId || benchmark.id}:${track}`, type: 'strength', label: benchmark.label || benchmark.exerciseId || '운동', state: 'inactive', track, program: benchmark.program, startDate: window.startDate, endDate: window.endDate });
        continue;
      }
      const prescription = benchmark.program === 'wendler'
        ? tomatoDevWendlerPrescriptionForWeek(board, benchmark, weekStart)
        : null;
      const log = benchmark.program === 'wendler'
        ? benchmark.wendlerLog?.[weekStart]
        : stepForWeek(board, benchmark.id, track, weekStart)?.weekLog?.[weekStart];
      let state = benchmark.program === 'wendler' && !prescription ? 'inactive'
        : log?.paintedAt ? 'achieved' : log?.missed && (log.attempted || log.performed || log.actualKg || log.actualReps || log.amrapReps) ? 'attempted'
        : log?.missed ? 'missed' : weekStart < todayWeek ? 'missed' : weekStart > todayWeek ? 'future' : 'planned';
      const step = stepForWeek(board, benchmark.id, track, weekStart);
      const seed = benchmark.seed?.[track] || {};
      const wendlerDetail = `${number(prescription?.topSet?.kg)}kg ×${number(prescription?.topSet?.reps)}${prescription?.topSet?.amrap ? '+' : ''}`;
      rows.push({
        id: `strength:${benchmark.exerciseId || benchmark.id}:${track}`,
        type: 'strength', exerciseId: benchmark.exerciseId || null,
        label: benchmark.label || benchmark.exerciseId || '운동', track, program: benchmark.program,
        state,
        detail: benchmark.program === 'wendler'
          ? wendlerDetail
          : `${number(step?.kg ?? seed.kg)}kg · ${Math.max(1, Math.round(number(step?.sets ?? benchmark.setsByTrack?.[track] ?? benchmark.setsDefault, 4)))}세트 × ${number(step?.reps ?? seed.reps)}회`,
        startDate: window.startDate, endDate: window.endDate,
      });
    }
  }
  return rows;
}

function buildStrength(workouts, plan, season, todayKey) {
  const weekStart = maxDateKey(mondayOf(todayKey), season.startDate);
  const currentDays = Object.entries(workouts).filter(([dateKey]) => weekStart <= dateKey && dateKey <= todayKey);
  let totalVolumeKg = 0;
  const activeDays = new Set();
  const best = {};
  for (const [dateKey, day] of Object.entries(workouts).filter(([key]) => season.startDate <= key && key <= todayKey)) {
    for (const session of getSessions(day)) {
      for (const entry of strengthEntries(session)) {
        const sets = completedSets(entry);
        if (!sets.length) continue;
        if (dateKey >= weekStart) activeDays.add(dateKey);
        const exerciseId = String(entry.exerciseId || entry.movementId || entry.name || '').trim();
        for (const set of sets) {
          if (dateKey >= weekStart) totalVolumeKg += number(set.kg) * number(set.reps);
          if (exerciseId) best[exerciseId] = Math.max(best[exerciseId] || 0, number(set.kg) * (1 + number(set.reps) / 30));
        }
      }
    }
  }
  void currentDays;
  const completedWeeks = completedWeekRanges(season, todayKey, 2);
  let volumeTrend = { status: 'collecting', sampleWeeks: completedWeeks.length };
  if (completedWeeks.length === 2) {
    const previous = strengthWindow(workouts, completedWeeks[0]);
    const recent = strengthWindow(workouts, completedWeeks[1]);
    if (previous.totalVolumeKg > 0 && recent.totalVolumeKg > 0) {
      volumeTrend = {
        status: 'ready', sampleWeeks: 2,
        volumeDeltaPct: round((recent.totalVolumeKg - previous.totalVolumeKg) / previous.totalVolumeKg * 100, 1),
        previous, recent,
      };
    }
  }
  const liftDeltas = Object.entries(plan.startingOneRmByExercise || {}).map(([exerciseId, value]) => ({
    exerciseId,
    label: String(plan.exerciseLabels?.[exerciseId] || exerciseId),
    baselineOneRmKg: number(value),
    currentOneRmKg: best[exerciseId] || 0,
    deltaKg: best[exerciseId] > 0 ? round(best[exerciseId] - number(value), 1) : null,
  })).filter(row => row.baselineOneRmKg > 0);
  const ready = liftDeltas.filter(row => Number.isFinite(row.deltaKg)).sort((a, b) => Math.abs(b.deltaKg) - Math.abs(a.deltaKg));
  return {
    sessions: progress(activeDays.size, nonNegative(plan.weeklySessionTarget)),
    totalVolumeKg: Math.round(totalVolumeKg),
    volumeTrend,
    liftDeltaKg: ready[0]?.deltaKg ?? null,
    liftDeltas,
  };
}

function workoutStreak(workouts, season, todayKey) {
  const todayDone = exerciseDaySuccess(workouts[todayKey]);
  let current = 0;
  for (let cursor = todayDone ? todayKey : addDays(todayKey, -1); cursor >= season.startDate && exerciseDaySuccess(workouts[cursor]); cursor = addDays(cursor, -1)) current += 1;
  let best = 0;
  let run = 0;
  for (let cursor = season.startDate; cursor <= minDateKey(todayKey, season.endDate); cursor = addDays(cursor, 1)) {
    run = exerciseDaySuccess(workouts[cursor]) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best, todayDone };
}

function runningTrend(activities, season, todayKey) {
  const ranges = completedWeekRanges(season, todayKey, 4);
  if (ranges.length < 4) return { status: 'collecting', sampleWeeks: ranges.length };
  const summarizeRanges = source => summarizeRunning(activities.filter(row => source.some(range => range.startDate <= row.dateKey && row.dateKey <= range.endDate)));
  const previous = summarizeRanges(ranges.slice(0, 2));
  const recent = summarizeRanges(ranges.slice(2));
  if (previous.distanceKm <= 0 || recent.distanceKm <= 0) return { status: 'collecting', sampleWeeks: 4 };
  return {
    status: 'ready', sampleWeeks: 4,
    distanceDeltaPct: round((recent.distanceKm - previous.distanceKm) / previous.distanceKm * 100, 1),
    paceImprovementSecPerKm: previous.avgPaceSecPerKm > 0 && recent.avgPaceSecPerKm > 0 ? previous.avgPaceSecPerKm - recent.avgPaceSecPerKm : null,
    previous, recent,
  };
}

function completedWeekRanges(season, todayKey, count) {
  const ranges = [];
  for (let weekStart = addDays(mondayOf(todayKey), -7); ranges.length < count && weekStart >= season.startDate; weekStart = addDays(weekStart, -7)) {
    const weekEnd = addDays(weekStart, 6);
    if (weekEnd <= season.endDate) ranges.unshift({ startDate: weekStart, endDate: weekEnd });
  }
  return ranges;
}

function strengthWindow(workouts, range) {
  let totalVolumeKg = 0;
  const activeDays = new Set();
  for (const [dateKey, day] of Object.entries(workouts)) {
    if (dateKey < range.startDate || dateKey > range.endDate) continue;
    for (const session of getSessions(day)) {
      for (const entry of strengthEntries(session)) {
        const sets = completedSets(entry);
        if (!sets.length) continue;
        activeDays.add(dateKey);
        totalVolumeKg += sets.reduce((sum, set) => sum + number(set.kg) * number(set.reps), 0);
      }
    }
  }
  return { sessions: activeDays.size, totalVolumeKg: Math.round(totalVolumeKg), bestOneRmByExercise: {} };
}

function summarizeRunning(rows) {
  const distanceKm = rows.reduce((sum, row) => sum + number(row.distanceKm), 0);
  const durationSec = rows.reduce((sum, row) => sum + number(row.durationSec), 0);
  return { activityCount: rows.length, distanceKm: round(distanceKm, 2), durationSec, avgPaceSecPerKm: distanceKm > 0 && durationSec > 0 ? Math.round(durationSec / distanceKm) : 0 };
}

function exerciseDaySuccess(day) {
  if (!day) return false;
  return getSessions(day).some(session => (
    strengthEntries(session).some(entry => completedSets(entry).length)
    || session.cf || session.swimming || session.running || session.stretching
    || positive(session.runDistance) || positive(session.runDurationMin) || positive(session.runDurationSec)
  ));
}

function getSessions(day = {}) {
  return Array.isArray(day.workoutSessions) && day.workoutSessions.length ? day.workoutSessions : [day];
}
function strengthEntries(session) { return Array.isArray(session?.exercises) ? session.exercises : []; }
function completedSets(entry) {
  return (Array.isArray(entry?.sets) ? entry.sets : []).filter(set => set && set.setType !== 'warmup'
    && (set.done === true || (set.done !== false && positive(set.kg) && positive(set.reps))));
}
function activeBenchmarks(board) { return (board?.benchmarks || []).filter(row => row.status === 'active').sort((a, b) => number(a.order) - number(b.order)); }
function stepForWeek(board, benchmarkId, track, weekStart) {
  return (board?.steps || []).find(step => step.benchmarkId === benchmarkId && step.track === track
    && step.weekStart <= weekStart && weekStart < addDays(step.weekStart, Math.max(1, number(step.span, 1)) * 7));
}
function comparableRun(row, reference) { return positive(row.distanceKm) && positive(row.avgPaceSecPerKm) && row.distanceKm >= reference * .75 && row.distanceKm <= reference * 1.25; }
function formatPace(value) { const seconds = positiveIntegerOrNull(value); return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/km` : '설정 전'; }
function collectingGoal() { return { mode: 'collecting', targetPaceSecPerKm: null, baselinePaceSecPerKm: null, adaptiveRatePct: null, actualPaceSecPerKm: null, avgHeartRateBpm: null, heartRateCaution: false, status: 'collecting' }; }
function normalizeSeason(value) {
  if (!isObject(value) || !String(value.id || '').trim() || !String(value.name || '').trim()
    || !DATE_KEY_PATTERN.test(String(value.startDate || '')) || !DATE_KEY_PATTERN.test(String(value.endDate || '')) || value.startDate > value.endDate) return null;
  return { ...value, id: String(value.id), name: String(value.name) };
}
function progress(actual, target) { return { actual: nonNegative(actual), target: nonNegative(target), ratio: target > 0 ? nonNegative(actual) / target : null, percent: target > 0 ? Math.round(nonNegative(actual) / target * 100) : null }; }
function mondayOf(key) { const date = new Date(`${key}T00:00:00Z`); const day = date.getUTCDay(); date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day)); return date.toISOString().slice(0, 10); }
function addDays(key, days) { const date = new Date(`${key}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function daysBetween(left, right) { return Math.round((Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) / DAY_MS); }
function median(values) { const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b); const middle = Math.floor(rows.length / 2); return rows.length % 2 ? rows[middle] : Math.round((rows[middle - 1] + rows[middle]) / 2); }
function maxDateKey(left, right) { return left > right ? left : right; }
function minDateKey(left, right) { return left < right ? left : right; }
function round(value, digits = 1) { const factor = 10 ** digits; return Math.round(number(value) * factor) / factor; }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function nonNegative(value) { return Math.max(0, number(value)); }
function positive(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function positiveIntegerOrNull(value) { const parsed = positive(value); return parsed == null ? null : Math.round(parsed); }
function finiteOrNull(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function unavailable(message) { const error = new Error(message); error.statusCode = 503; return error; }
