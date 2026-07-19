import { buildTomatoDevSnapshotFromRaw, listRunningActivities } from './tomatodev-raw-domain.js';
import { fetchWithTomatoDevReaderAuth } from './tomatodev-reader-auth.js';

const TOMATODEV_FIREBASE_PROJECT_ID = process.env.TOMATODEV_FIREBASE_PROJECT_ID || 'tomatodev-arete';
const TOMATODEV_FIREBASE_API_KEY = process.env.TOMATODEV_FIREBASE_API_KEY || 'AIzaSyBG1MoX3cqkrqYnNI1l2E_KxabMiy6UX6g';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SETTING_IDS = Object.freeze({
  registry: 'tomatodev_season_registry_v3',
  dietPlan: 'diet_plan',
});

export async function fetchTomatoDevDaybirdSnapshot(ownerId, options = {}) {
  const rawSource = options.rawSource || await loadTomatoDevRawSource(ownerId, options);
  return normalizeTomatoDevDaybirdSnapshot(buildTomatoDevSnapshotFromRaw({
    ...rawSource,
    generatedAt: options.generatedAt || Date.now(),
    reason: options.reason || 'budget-refresh',
  }));
}

export async function loadTomatoDevRawSource(ownerId, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const projectId = options.projectId || TOMATODEV_FIREBASE_PROJECT_ID;
  const apiKey = options.apiKey || TOMATODEV_FIREBASE_API_KEY;
  const requestedOwner = String(ownerId || '').trim();
  if (!requestedOwner) throw unavailableError('TomatoDev owner is missing');
  const todayKey = options.todayKey || kstDateKey(options.now || Date.now());
  const context = {
    fetchImpl,
    projectId,
    apiKey,
    owner: requestedOwner,
    readerAuth: {
      fetchImpl,
      projectId,
      apiKey,
      email: options.readerEmail,
      password: options.readerPassword,
      env: options.env,
      tokenCache: options.readerTokenCache,
      nowEpochMs: options.readerNowEpochMs,
    },
  };
  if (['김_태우', '김_태우(guest)'].includes(requestedOwner)) {
    const accountDocument = await readDocument(context, ['_accounts', '김_태우']);
    if (!accountDocument) throw unavailableError('TomatoDev shared data owner is unresolved');
    context.owner = resolveTomatoDevOwnerFromAccount(requestedOwner, decodeFirestoreDocument(accountDocument));
  }
  const registry = await readRequiredSetting(context, SETTING_IDS.registry);
  if (!Array.isArray(registry?.seasons)) throw unavailableError('TomatoDev season registry is invalid');
  const activeSeason = registry.seasons.find(season => (
    DATE_KEY_PATTERN.test(String(season?.startDate || ''))
    && DATE_KEY_PATTERN.test(String(season?.endDate || ''))
    && season.startDate <= todayKey && todayKey <= season.endDate
  )) || null;
  const dietPlanPromise = readRequiredSetting(context, SETTING_IDS.dietPlan);
  let workoutPlan = null;
  let runningPlan = null;
  let board = null;
  if (activeSeason) {
    const seasonId = String(activeSeason.id || '').trim();
    if (!seasonId) throw unavailableError('TomatoDev active season id is missing');
    [workoutPlan, runningPlan, board] = await Promise.all([
      readRequiredSetting(context, `tomatodev_season_${seasonId}_workout_plan_v4`),
      readRequiredSetting(context, `tomatodev_season_${seasonId}_running_plan_v3`),
      readSeasonBoard(context, seasonId),
    ]);
  }
  const fromDate = activeSeason ? addDateDays(activeSeason.startDate, -28) : addDateDays(todayKey, -28);
  const toDate = activeSeason ? minDateKey(todayKey, activeSeason.endDate) : todayKey;
  const [dietPlan, primaryWorkouts] = await Promise.all([
    dietPlanPromise,
    readWorkoutRange(context, fromDate, toDate),
  ]);
  let workouts = primaryWorkouts;
  const missingRecentRuns = Math.max(0, 5 - listRunningActivities(workouts).length);
  if (missingRecentRuns > 0) {
    const olderTo = addDateDays(fromDate, -1);
    const olderFrom = addDateDays(todayKey, -730);
    if (olderFrom <= olderTo) {
      const older = await readWorkoutRange(context, olderFrom, olderTo, {
        direction: 'DESCENDING',
        limit: 120,
        minRunningActivities: missingRecentRuns,
      });
      workouts = { ...older, ...workouts };
    }
  }
  return { registry, workouts, workoutPlan, runningPlan, board, dietPlan, todayKey };
}

export function resolveTomatoDevOwnerFromAccount(requestedOwner, account = {}) {
  const requested = String(requestedOwner || '').trim();
  if (!['김_태우', '김_태우(guest)'].includes(requested)) return requested;
  const owner = String(account.dataOwnerId || '').trim();
  if (Number(account.dataOwnerVersion) < 2 || owner !== '김_태우') {
    throw unavailableError('TomatoDev shared data owner is unresolved');
  }
  return owner;
}

async function readSeasonBoard(context, seasonId) {
  const keyed = await readSetting(context, `tomatodev_season_${seasonId}_test_board_v3`);
  if (keyed) return keyed;
  const activeAlias = await readSetting(context, 'tomatodev_test_board_v3');
  if (activeAlias) return activeAlias;
  throw unavailableError(`TomatoDev season board is missing: ${seasonId}`);
}

async function readRequiredSetting(context, documentId) {
  const value = await readSetting(context, documentId);
  if (!isObject(value)) throw unavailableError(`TomatoDev setting is missing: ${documentId}`);
  return value;
}

async function readSetting(context, documentId) {
  const document = await readDocument(context, ['users', context.owner, 'settings', documentId]);
  if (!document) return null;
  const decoded = decodeFirestoreDocument(document);
  return isObject(decoded.value) ? decoded.value : null;
}

async function readWorkoutRange(context, fromDate, toDate, options = {}) {
  const projectPrefix = `projects/${context.projectId}/databases/(default)/documents`;
  const parent = `${projectPrefix}/users/${context.owner}`;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(context.projectId)}/databases/(default)/documents/users/${encodeURIComponent(context.owner)}:runQuery?key=${encodeURIComponent(context.apiKey)}`;
  const pageSize = Math.max(1, Math.min(500, Math.round(Number(options.limit) || 500)));
  const minRunningActivities = Math.max(0, Math.round(Number(options.minRunningActivities) || 0));
  const workouts = {};
  let cursorDocumentName = null;
  for (;;) {
    const structuredQuery = {
        select: {
          fields: [
            'workoutSessions', 'exercises', 'cf', 'stretching', 'swimming', 'running',
            'runDistance', 'runDurationMin', 'runDurationSec', 'runAvgPaceSecPerKm',
            'runStartedAt', 'runEndedAt', 'runPaceCheck', 'runRouteSummary',
            'bKcal', 'lKcal', 'dKcal', 'sKcal',
            'bProtein', 'lProtein', 'dProtein', 'sProtein',
            'bCarbs', 'lCarbs', 'dCarbs', 'sCarbs',
            'bFat', 'lFat', 'dFat', 'sFat',
          ].map(fieldPath => ({ fieldPath })),
        },
        from: [{ collectionId: 'workouts' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [fromDate, toDate].map((dateKey, index) => ({
              fieldFilter: {
                field: { fieldPath: '__name__' },
                op: index === 0 ? 'GREATER_THAN_OR_EQUAL' : 'LESS_THAN_OR_EQUAL',
                value: { referenceValue: `${parent}/workouts/${dateKey}` },
              },
            })),
          },
        },
        orderBy: [{ field: { fieldPath: '__name__' }, direction: options.direction || 'ASCENDING' }],
        limit: pageSize,
      };
    if (cursorDocumentName) {
      structuredQuery.startAt = {
        values: [{ referenceValue: cursorDocumentName }],
        before: false,
      };
    }
    const response = await fetchWithTomatoDevReaderAuth(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    }, context.readerAuth);
    const payload = await response.json().catch(() => []);
    if (!response.ok) throw unavailableError(`TomatoDev workouts read failed: ${response.status}`);
    if (!Array.isArray(payload)) throw unavailableError('TomatoDev workouts query response is invalid');
    const documentRows = payload.filter(row => row?.document);
    for (const row of documentRows) {
      const dateKey = String(row.document.name || '').split('/').at(-1);
      if (!DATE_KEY_PATTERN.test(dateKey)) continue;
      workouts[dateKey] = decodeFirestoreDocument(row.document);
    }
    if (minRunningActivities <= 0
      || listRunningActivities(workouts).length >= minRunningActivities
      || documentRows.length < pageSize) break;
    const nextCursor = String(documentRows.at(-1)?.document?.name || '');
    if (!nextCursor || nextCursor === cursorDocumentName) break;
    cursorDocumentName = nextCursor;
  }
  return workouts;
}

async function readDocument(context, segments) {
  const path = segments.map(segment => encodeURIComponent(String(segment || ''))).join('/');
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(context.projectId)}/databases/(default)/documents/${path}?key=${encodeURIComponent(context.apiKey)}`;
  const response = await fetchWithTomatoDevReaderAuth(
    endpoint,
    { method: 'GET', cache: 'no-store' },
    context.readerAuth,
  );
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw unavailableError(`TomatoDev Firestore read failed: ${response.status}`);
  return payload;
}

function kstDateKey(value) {
  return new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDateDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minDateKey(left, right) {
  return left < right ? left : right;
}

export function decodeFirestoreDocument(document = {}) {
  if (!isObject(document.fields)) throw unavailableError('TomatoDev DayBird snapshot has no Firestore fields');
  return Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

export function normalizeTomatoDevDaybirdSnapshot(value = {}) {
  if (!isObject(value)) throw unavailableError('TomatoDev DayBird snapshot must be an object');
  if (value.sourceEnvironment !== 'tomatodev') throw unavailableError('TomatoDev DayBird snapshot source is invalid');
  if (Number(value.schemaVersion) !== 1) throw unavailableError('TomatoDev DayBird snapshot schema is unsupported');
  if (!['ready', 'no-season'].includes(value.state)) throw unavailableError('TomatoDev DayBird snapshot state is invalid');
  const generatedAt = finiteNumber(value.generatedAt, 'generatedAt');
  if (generatedAt <= 0) throw unavailableError('TomatoDev DayBird snapshot timestamp is invalid');
  if (!(value.season === null || isObject(value.season))) throw unavailableError('TomatoDev DayBird snapshot season is invalid');
  if (!Array.isArray(value.seasonGoals)) throw unavailableError('TomatoDev DayBird snapshot seasonGoals are missing');
  if (!isObject(value.running) || !isObject(value.running.goal) || !Array.isArray(value.running.recent)) {
    throw unavailableError('TomatoDev DayBird snapshot running contract is incomplete');
  }
  if (!isObject(value.nutrition)) {
    throw unavailableError('TomatoDev DayBird snapshot nutrition contract is incomplete');
  }
  if (value.running.recent.length > 5) throw unavailableError('TomatoDev DayBird snapshot has more than five recent runs');

  const seasonGoals = value.seasonGoals.map((goal, index) => normalizeSeasonGoal(goal, index));
  const recent = value.running.recent.map((record, index) => normalizeRunRecord(record, index));
  const runningGoal = normalizeRunningGoal(value.running.goal);
  const normalized = {
    schemaVersion: 1,
    sourceEnvironment: 'tomatodev',
    generatedAt,
    reason: String(value.reason || '').trim().slice(0, 80),
    state: value.state,
    season: value.season === null ? null : safeClone(value.season, 'season'),
    seasonGoals,
    nutrition: normalizeNutrition(value.nutrition),
    running: {
      ...safeClone(value.running, 'running'),
      goal: runningGoal,
      recent,
    },
  };
  for (const key of ['strength', 'streak', 'nextPlan']) {
    if (value[key] === undefined) continue;
    if (!(value[key] === null || isObject(value[key]))) throw unavailableError(`TomatoDev DayBird snapshot ${key} is invalid`);
    normalized[key] = value[key] === null ? null : safeClone(value[key], key);
  }
  return normalized;
}

function normalizeNutrition(nutrition) {
  return {
    actualKcal: finiteNumberAtLeast(nutrition.actualKcal, 'nutrition.actualKcal', 0),
    targetKcal: finiteNumberAtLeast(nutrition.targetKcal, 'nutrition.targetKcal', 0),
    progress: finiteNumberBetween(nutrition.progress, 'nutrition.progress', 0, 100),
    proteinG: finiteNumberAtLeast(nutrition.proteinG, 'nutrition.proteinG', 0),
    carbsG: finiteNumberAtLeast(nutrition.carbsG, 'nutrition.carbsG', 0),
    fatG: finiteNumberAtLeast(nutrition.fatG, 'nutrition.fatG', 0),
  };
}

function normalizeSeasonGoal(goal, index) {
  if (!isObject(goal)) throw unavailableError(`TomatoDev season goal ${index + 1} is invalid`);
  for (const key of ['weekStart', 'weekEnd']) {
    if (!DATE_KEY_PATTERN.test(String(goal[key] || ''))) throw unavailableError(`TomatoDev season goal ${key} is invalid`);
  }
  if (!String(goal.seasonId || '').trim()) throw unavailableError('TomatoDev season goal seasonId is missing');
  if (!String(goal.state || '').trim()) throw unavailableError('TomatoDev season goal state is missing');
  if (!Array.isArray(goal.items)) throw unavailableError('TomatoDev season goal items are missing');
  return safeClone(goal, `seasonGoals[${index}]`);
}

function normalizeRunRecord(record, index) {
  if (!isObject(record) || !DATE_KEY_PATTERN.test(String(record.dateKey || ''))) {
    throw unavailableError(`TomatoDev recent run ${index + 1} is invalid`);
  }
  return {
    dateKey: record.dateKey,
    distanceKm: nullableFiniteNumber(record.distanceKm, `recent[${index}].distanceKm`, { required: true, min: 0 }),
    paceSecPerKm: nullableFiniteNumber(record.paceSecPerKm, `recent[${index}].paceSecPerKm`, { min: 0 }),
    avgHeartRateBpm: nullableFiniteNumber(record.avgHeartRateBpm, `recent[${index}].avgHeartRateBpm`, { min: 0 }),
    cadenceSpm: nullableFiniteNumber(record.cadenceSpm, `recent[${index}].cadenceSpm`, { min: 0 }),
  };
}

function normalizeRunningGoal(goal) {
  if (typeof goal.heartRateCaution !== 'boolean') {
    throw unavailableError('TomatoDev running.goal.heartRateCaution must be boolean');
  }
  const mode = String(goal.mode || '').trim().slice(0, 32);
  const status = String(goal.status || '').trim().slice(0, 32);
  if (!mode || !status) throw unavailableError('TomatoDev running goal mode/status is missing');
  return {
    mode,
    targetPaceSecPerKm: nullableFiniteNumber(goal.targetPaceSecPerKm, 'running.goal.targetPaceSecPerKm', { min: 0 }),
    baselinePaceSecPerKm: nullableFiniteNumber(goal.baselinePaceSecPerKm, 'running.goal.baselinePaceSecPerKm', { min: 0 }),
    adaptiveRatePct: nullableFiniteNumber(goal.adaptiveRatePct, 'running.goal.adaptiveRatePct'),
    actualPaceSecPerKm: nullableFiniteNumber(goal.actualPaceSecPerKm, 'running.goal.actualPaceSecPerKm', { min: 0 }),
    avgHeartRateBpm: nullableFiniteNumber(goal.avgHeartRateBpm, 'running.goal.avgHeartRateBpm', { min: 0 }),
    heartRateCaution: goal.heartRateCaution,
    status,
  };
}

function decodeFirestoreValue(value) {
  if (!isObject(value)) throw unavailableError('TomatoDev Firestore value is invalid');
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return String(value.stringValue);
  if ('booleanValue' in value) return !!value.booleanValue;
  if ('integerValue' in value) return finiteNumber(value.integerValue, 'integerValue');
  if ('doubleValue' in value) return finiteNumber(value.doubleValue, 'doubleValue');
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([key, child]) => [key, decodeFirestoreValue(child)]));
  }
  throw unavailableError('TomatoDev Firestore value type is unsupported');
}

function nullableFiniteNumber(value, label, options = {}) {
  if (value === null || value === undefined || value === '') {
    if (options.required) throw unavailableError(`TomatoDev ${label} is missing`);
    return null;
  }
  const number = finiteNumber(value, label);
  if (options.min != null && number < options.min) throw unavailableError(`TomatoDev ${label} is out of range`);
  return number;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw unavailableError(`TomatoDev ${label} is not finite`);
  return number;
}

function finiteNumberAtLeast(value, label, min) {
  const number = finiteNumber(value, label);
  if (number < min) throw unavailableError(`TomatoDev ${label} is out of range`);
  return number;
}

function finiteNumberBetween(value, label, min, max) {
  const number = finiteNumber(value, label);
  if (number < min || number > max) throw unavailableError(`TomatoDev ${label} is out of range`);
  return number;
}

function safeClone(value, label) {
  assertJsonValue(value, label, 0);
  return JSON.parse(JSON.stringify(value));
}

function assertJsonValue(value, label, depth) {
  if (depth > 10) throw unavailableError(`TomatoDev ${label} is too deeply nested`);
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw unavailableError(`TomatoDev ${label} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 200) throw unavailableError(`TomatoDev ${label} contains too many items`);
    value.forEach(item => assertJsonValue(item, label, depth + 1));
    return;
  }
  if (!isObject(value)) throw unavailableError(`TomatoDev ${label} contains an unsupported value`);
  const entries = Object.entries(value);
  if (entries.length > 200) throw unavailableError(`TomatoDev ${label} contains too many fields`);
  entries.forEach(([, child]) => assertJsonValue(child, label, depth + 1));
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function unavailableError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}
