import {
  normalizeRunActivityRoute,
  normalizeRunActivitySummary,
} from './gps-route.js?v=20260710-gps-route-fidelity';
import { timeMs } from './gps-route-core.js?v=20260710-gps-route-fidelity';

export const DEFAULT_RUN_PREFERENCES = Object.freeze({
  weeklyGoalKm: 15,
  daysPerWeek: 3,
});

export function normalizeRunPreferences(value = {}) {
  return {
    weeklyGoalKm: clampNumber(value.weeklyGoalKm, 3, 200, DEFAULT_RUN_PREFERENCES.weeklyGoalKm),
    daysPerWeek: clampInteger(value.daysPerWeek, 1, 7, DEFAULT_RUN_PREFERENCES.daysPerWeek),
  };
}

export function buildRunInsights(activities = [], preferences = {}, now = new Date()) {
  const settings = normalizeRunPreferences(preferences);
  const rows = activities
    .map(activity => insightRow(activity))
    .filter(row => Number.isFinite(row.startedMs))
    .sort((a, b) => b.startedMs - a.startedMs);
  const weekStartMs = startOfWeekMs(now);
  const nextWeekMs = weekStartMs + 7 * 86400000;
  const previousWeekMs = weekStartMs - 7 * 86400000;
  const weekRows = rows.filter(row => row.startedMs >= weekStartMs && row.startedMs < nextWeekMs);
  const previousWeekRows = rows.filter(row => row.startedMs >= previousWeekMs && row.startedMs < weekStartMs);
  const weekDistanceKm = sum(weekRows, 'distanceKm');
  const previousWeekDistanceKm = sum(previousWeekRows, 'distanceKm');
  const weekDurationSeconds = sum(weekRows, 'durationSeconds');
  const progressPercent = settings.weeklyGoalKm > 0
    ? Math.min(100, Math.round((weekDistanceKm / settings.weeklyGoalKm) * 100))
    : 0;
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthDistanceKm = sum(rows.filter(row => row.startedMs >= monthStart.getTime()), 'distanceKm');
  const records = buildRecords(rows);
  const weeklyTrend = buildWeeklyTrend(rows, weekStartMs, 6);
  const schedule = buildTrainingSchedule(settings, weekRows.length, rows);
  const recommendation = buildRecommendation({
    rows,
    weekRows,
    weekDistanceKm,
    previousWeekDistanceKm,
    settings,
    schedule,
    now,
  });

  return {
    settings,
    weekDistanceKm,
    weekDurationSeconds,
    weekRunCount: weekRows.length,
    previousWeekDistanceKm,
    monthDistanceKm,
    progressPercent,
    remainingKm: Math.max(0, settings.weeklyGoalKm - weekDistanceKm),
    records,
    weeklyTrend,
    schedule,
    recommendation,
    totalActivityCount: rows.length,
  };
}

export function calculateRunSplits(activity = {}) {
  const route = normalizeRunActivityRoute(activity);
  const points = route.points;
  const routeMeters = route.routeDistanceMeters;
  if (points.length < 2 || routeMeters < 100) {
    return emptySplitAnalysis('GPS 좌표가 부족해 스플릿을 계산할 수 없습니다.');
  }

  const timing = timedRoutePoints(points, route.durationSeconds, routeMeters);
  if (timing.points.length < 2) {
    return emptySplitAnalysis('시간 정보가 부족해 스플릿을 계산할 수 없습니다.');
  }

  const splits = [];
  let startMeters = 0;
  let splitIndex = 1;
  while (startMeters < routeMeters - 1) {
    const endMeters = Math.min(startMeters + 1000, routeMeters);
    const distanceMeters = endMeters - startMeters;
    if (distanceMeters < 100 && splits.length) break;
    const startedSeconds = elapsedAtDistance(timing.points, startMeters);
    const endedSeconds = elapsedAtDistance(timing.points, endMeters);
    const durationSeconds = Math.max(0, endedSeconds - startedSeconds);
    if (durationSeconds > 0) {
      splits.push({
        index: splitIndex,
        distanceMeters,
        durationSeconds,
        paceSecondsPerKm: durationSeconds / (distanceMeters / 1000),
        isPartial: distanceMeters < 995,
      });
    }
    startMeters = endMeters;
    splitIndex += 1;
  }

  if (!splits.length) return emptySplitAnalysis('시간 정보가 부족해 스플릿을 계산할 수 없습니다.');
  const fullSplits = splits.filter(split => !split.isPartial);
  const fastestPace = Math.min(...(fullSplits.length ? fullSplits : splits).map(split => split.paceSecondsPerKm));
  splits.forEach(split => {
    split.isFastest = Math.abs(split.paceSecondsPerKm - fastestPace) < 0.5;
  });
  const maxPace = Math.max(...splits.map(split => split.paceSecondsPerKm));
  const minPace = Math.min(...splits.map(split => split.paceSecondsPerKm));
  splits.forEach(split => {
    const range = Math.max(1, maxPace - minPace);
    split.barPercent = Math.round(58 + ((maxPace - split.paceSecondsPerKm) / range) * 42);
  });

  const halfMeters = routeMeters / 2;
  const startElapsed = elapsedAtDistance(timing.points, 0);
  const halfElapsed = elapsedAtDistance(timing.points, halfMeters);
  const endElapsed = elapsedAtDistance(timing.points, routeMeters);
  const firstHalfPace = (halfElapsed - startElapsed) / (halfMeters / 1000);
  const secondHalfPace = (endElapsed - halfElapsed) / (halfMeters / 1000);
  const paceChangePercent = firstHalfPace > 0
    ? Math.round(((secondHalfPace - firstHalfPace) / firstHalfPace) * 100)
    : 0;

  return {
    available: true,
    estimated: timing.estimated,
    splits,
    firstHalfPace,
    secondHalfPace,
    paceChangePercent,
    insight: splitInsight(paceChangePercent, timing.estimated),
    message: '',
  };
}

function insightRow(activity) {
  const summary = normalizeRunActivitySummary(activity);
  return {
    activity,
    id: summary.id,
    title: summary.title,
    startedMs: activityStartedMs(summary.startedAt),
    distanceKm: Math.max(0, Number(summary.distanceKm) || 0),
    durationSeconds: Math.max(0, Number(summary.durationSeconds) || 0),
    paceSecondsPerKm: Math.max(0, Number(summary.route.paceSecondsPerKm) || 0),
  };
}

function buildRecords(rows) {
  const distanceRows = rows.filter(row => row.distanceKm > 0);
  const paceRows = rows.filter(row => row.paceSecondsPerKm >= 120 && row.paceSecondsPerKm <= 1200 && row.distanceKm >= 1);
  const longest = distanceRows.reduce((best, row) => (!best || row.distanceKm > best.distanceKm ? row : best), null);
  const fastest = paceRows.reduce((best, row) => (!best || row.paceSecondsPerKm < best.paceSecondsPerKm ? row : best), null);
  return { longest, fastest };
}

function buildWeeklyTrend(rows, currentWeekMs, count) {
  const weeks = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const startedMs = currentWeekMs - offset * 7 * 86400000;
    const endedMs = startedMs + 7 * 86400000;
    const date = new Date(startedMs);
    weeks.push({
      startedMs,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      distanceKm: sum(rows.filter(row => row.startedMs >= startedMs && row.startedMs < endedMs), 'distanceKm'),
      isCurrent: offset === 0,
    });
  }
  const maxDistanceKm = Math.max(1, ...weeks.map(week => week.distanceKm));
  return weeks.map(week => ({
    ...week,
    barPercent: Math.round((week.distanceKm / maxDistanceKm) * 100),
  }));
}

function buildTrainingSchedule(settings, completedCount, rows) {
  const templates = scheduleTemplates(settings.daysPerWeek);
  const recentDistances = rows.slice(0, 6).map(row => row.distanceKm).filter(value => value > 0);
  const recentAverageKm = recentDistances.length
    ? recentDistances.reduce((total, value) => total + value, 0) / recentDistances.length
    : settings.weeklyGoalKm / settings.daysPerWeek;
  const weights = templates.map(item => item.weight);
  const weightTotal = weights.reduce((total, value) => total + value, 0);
  return templates.map((item, index) => {
    const goalBasedKm = settings.weeklyGoalKm * (item.weight / weightTotal);
    const recentBasedKm = recentAverageKm * item.recentScale;
    return {
      ...item,
      targetKm: Math.max(1.5, Math.round(Math.min(goalBasedKm, recentBasedKm * 1.25) * 10) / 10),
      status: index < completedCount ? 'done' : index === completedCount ? 'next' : 'upcoming',
    };
  });
}

function scheduleTemplates(daysPerWeek) {
  const templates = [
    { type: 'easy', title: '이지 런', detail: '대화 가능한 편안한 강도', weight: 1, recentScale: 0.85 },
    { type: 'quality', title: '변속주', detail: '워밍업 10분 · 빠르게 1분/천천히 2분 × 6', weight: 0.9, recentScale: 0.8 },
    { type: 'long', title: '롱 이지 런', detail: '속도보다 일정한 호흡과 완주에 집중', weight: 1.35, recentScale: 1.2 },
  ];
  if (daysPerWeek === 1) return [templates[0]];
  if (daysPerWeek === 2) return [templates[0], templates[2]];
  const extras = [
    { type: 'recovery', title: '회복 런', detail: '아주 편안한 강도로 짧게 달리기', weight: 0.7, recentScale: 0.65 },
    { type: 'easy', title: '이지 런', detail: '리듬을 유지하며 여유 있게 달리기', weight: 0.9, recentScale: 0.8 },
    { type: 'recovery', title: '회복 런', detail: '피로가 남으면 걷기로 대체', weight: 0.65, recentScale: 0.6 },
    { type: 'easy', title: '이지 런', detail: '가벼운 페이스로 주간 빈도 채우기', weight: 0.85, recentScale: 0.75 },
  ];
  return [...extras.slice(0, daysPerWeek - 3), ...templates];
}

function buildRecommendation(context) {
  const { rows, weekDistanceKm, previousWeekDistanceKm, settings, schedule, now } = context;
  const next = schedule.find(item => item.status === 'next') || schedule[0];
  if (!rows.length) {
    return {
      eyebrow: '첫 러닝 추천',
      title: '20분 이지 런으로 시작',
      detail: '빠르게 달리기보다 3분 달리기와 1분 걷기를 반복해 편안하게 마치세요.',
      target: '20분',
      tone: 'fresh',
    };
  }
  const daysSinceLast = Math.max(0, (now.getTime() - rows[0].startedMs) / 86400000);
  const loadJump = previousWeekDistanceKm >= 3 && weekDistanceKm > previousWeekDistanceKm * 1.25;
  if (daysSinceLast < 1 || loadJump) {
    return {
      eyebrow: '부담 조절',
      title: '회복 런 또는 휴식',
      detail: loadJump
        ? '이번 주 거리가 지난주보다 크게 늘었습니다. 다음 운동은 편안한 강도로 조절하세요.'
        : '최근 러닝 후 하루가 지나지 않았습니다. 피로가 남으면 걷기나 휴식으로 바꾸세요.',
      target: '20–30분',
      tone: 'recovery',
    };
  }
  if (weekDistanceKm >= settings.weeklyGoalKm) {
    return {
      eyebrow: '주간 목표 달성',
      title: '가볍게 유지하거나 회복',
      detail: '이미 주간 거리 목표를 채웠습니다. 추가 거리를 쌓기보다 몸 상태에 맞춰 강도를 낮추세요.',
      target: '선택',
      tone: 'complete',
    };
  }
  return {
    eyebrow: '다음 추천',
    title: next.title,
    detail: next.detail,
    target: `${next.targetKm.toFixed(1)} km`,
    tone: next.type,
  };
}

function timedRoutePoints(points, durationSeconds, routeMeters) {
  const elapsedValues = points.map(point => Number(point.elapsedSeconds));
  const validElapsedCount = elapsedValues.filter(Number.isFinite).length;
  const firstTimestamp = points.map(point => timeMs(point.timestamp)).find(Number.isFinite);
  const timestampValues = points.map(point => timeMs(point.timestamp));
  const validTimestampCount = timestampValues.filter(Number.isFinite).length;
  let estimated = false;
  let lastElapsed = 0;
  const timed = points.map((point, index) => {
    let elapsed;
    if (validElapsedCount >= 2 && Number.isFinite(elapsedValues[index])) {
      elapsed = elapsedValues[index];
    } else if (validTimestampCount >= 2 && Number.isFinite(timestampValues[index]) && Number.isFinite(firstTimestamp)) {
      elapsed = (timestampValues[index] - firstTimestamp) / 1000;
    } else if (durationSeconds > 0 && routeMeters > 0) {
      elapsed = durationSeconds * (point.cumulativeMeters / routeMeters);
      estimated = true;
    } else {
      return null;
    }
    elapsed = Math.max(lastElapsed, elapsed);
    lastElapsed = elapsed;
    return { ...point, elapsedSeconds: elapsed };
  }).filter(Boolean);
  return { points: timed, estimated };
}

function elapsedAtDistance(points, targetMeters) {
  if (targetMeters <= 0) return points[0]?.elapsedSeconds || 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (next.cumulativeMeters < targetMeters) continue;
    const span = Math.max(0.001, next.cumulativeMeters - previous.cumulativeMeters);
    const ratio = Math.min(1, Math.max(0, (targetMeters - previous.cumulativeMeters) / span));
    return previous.elapsedSeconds + (next.elapsedSeconds - previous.elapsedSeconds) * ratio;
  }
  return points.at(-1)?.elapsedSeconds || 0;
}

function splitInsight(paceChangePercent, estimated) {
  if (estimated) return 'GPS 시간 정보가 없어 전체 시간 기준의 추정 스플릿입니다.';
  if (paceChangePercent <= -3) return `후반 페이스가 전반보다 ${Math.abs(paceChangePercent)}% 빨랐습니다. 안정적인 네거티브 스플릿입니다.`;
  if (paceChangePercent >= 5) return `후반 페이스가 전반보다 ${paceChangePercent}% 느려졌습니다. 초반 강도를 조금 낮춰보세요.`;
  return '전·후반 페이스 차이가 작아 흐름을 고르게 유지했습니다.';
}

function emptySplitAnalysis(message) {
  return {
    available: false,
    estimated: false,
    splits: [],
    firstHalfPace: 0,
    secondHalfPace: 0,
    paceChangePercent: 0,
    insight: '',
    message,
  };
}

function activityStartedMs(value) {
  if (value?.toDate) return value.toDate().getTime();
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
  return timeMs(value);
}

function startOfWeekMs(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.getTime();
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number * 10) / 10)) : fallback;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
