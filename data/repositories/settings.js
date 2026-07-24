import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import {
  firestoreDb as _db,
  scope as _scope,
  sessionCache as _cache,
} from '../core/firebase.js';
import { fixtureActive } from '../core/fixtures.js';
import { queueDaybirdRefresh } from '../../utils/daybird-sync.js';

// ================================================================
// app settings — local UX preferences backed by Firestore
// ================================================================
const DEFAULT_APP_SETTINGS = {
  theme: 'dark',
  planSegment: 'want',
  homeManagedCategoryIds: [],
  biweeklyStartDate: '',
  // 설정 10화면 (docs/ai/flows/2026-07-24-settings-10-screens.md)
  budget: {
    amount: 0,            // 전체 예산(원). 0이면 카테고리 monthlyTargets 합계 사용
    cycle: 'monthly',     // 'monthly' | 'weekly' | 'custom'
    startDay: 1,          // 매월 시작일 (1~28)
    customStartDate: '',  // cycle==='custom'일 때 ISO date
    rollover: 'reset',    // 'carryover'(이월) | 'reset'(초기화) | 'deduct_over'(초과분만 차감)
  },
  budgetAlerts: {
    total: { warn70: true, warn90: true, over: true },   // 01 전체 예산 안내 토글
    categoryDefault: { warn: 70, alert: 90, over: 100 }, // 03 기본 경고 단계
    basis: 'common',                                     // 'common' | 'per_category'
    categoryOverrides: {},                               // { [categoryId]: { warn, alert, over } }
  },
  missions: {
    autoJoin: true,
    difficulty: 'normal', // 'normal' | 'high'
    items: [],            // domain/rewards/missions.js 스키마
  },
  homeCards: [],          // 07 — { id, visible, variant('detailed'|'simple'), order }
  autoClassify: {
    enabled: true,
    method: 'high_confidence', // 'all' | 'high_confidence'
    confidence: 'balanced',    // 'strict' | 'balanced' | 'loose'
    rules: [],                 // 배열 순서 = 우선순위. domain/transactions/classify.js 스키마
  },
  backup: {
    auto: false,
    intervalDays: 7,
    wifiOnly: true,
    skipLowBattery: true,
    lastBackupAt: '',
    lastBackupSize: 0,
    scope: { transactions: true, budgets: true, rules: true, homeSettings: true },
  },
  exportPrefs: {
    format: 'csv', // 'csv' | 'excel' | 'pdf'
    includeMemo: true,
    includePayment: true,
    includeCanceled: false,
  },
  safeToSpend: {
    enabled: true,
    pacingMode: 'period',
  },
  rewardSavings: {
    enabled: true,
    lookbackDays: 180,
    allocationRate: 0.3,
    pointRates: {
      winePurchase: 0.3,
      premiumIngredients: 0,
      travelFund: 0,
    },
    pointItems: [
      { id: 'winePurchase', label: '와인구매 포인트', rate: 0.3, targetAmount: 120000, enabled: true, order: 10 },
      { id: 'premiumIngredients', label: '고급재료 포인트', rate: 0, targetAmount: 80000, enabled: true, order: 20 },
      { id: 'travelFund', label: '여행충당 포인트', rate: 0, targetAmount: 200000, enabled: true, order: 30 },
    ],
    baselineMethod: 'trimmed_weekly',
    dailyReward: {
      enabled: true,
      selectedDateKey: '',
      selectedRuleId: '',
      focusBucketKey: '',
      bonusRate: 0.1,
      bonusCap: 5000,
      freezeCount: 1,
      streakDays: 0,
      tierLabel: '브론즈 1단계',
    },
  },
};

export async function getAppSettings() {
  if (_cache.appSettings) return cloneAppSettings(_cache.appSettings);
  if (fixtureActive()) {
    _cache.appSettings = normalizeAppSettings({});
    return cloneAppSettings(_cache.appSettings);
  }
  if (_cache.appSettingsPromise) return _cache.appSettingsPromise;
  const ref = doc(_db, 'users', _scope(), 'settings', 'app');
  _cache.appSettingsPromise = getDoc(ref)
    .then(snap => {
      const settings = normalizeAppSettings(snap.exists() ? snap.data() : {});
      _cache.appSettings = settings;
      return cloneAppSettings(settings);
    })
    .finally(() => {
      _cache.appSettingsPromise = null;
    });
  return _cache.appSettingsPromise;
}

export async function saveAppSettings(patch = {}) {
  const payload = normalizeAppSettings(patch, { partial: true });
  if (fixtureActive()) {
    // fixture 모드: Firestore 대신 인메모리 세션 캐시에 병합 (새로고침 시 초기화)
    _cache.appSettings = normalizeAppSettings({ ...(_cache.appSettings || {}), ...payload });
    return payload;
  }
  await setDoc(doc(_db, 'users', _scope(), 'settings', 'app'), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  _cache.appSettings = null;
  _cache.appSettingsPromise = null;
  void queueDaybirdRefresh('app-settings-update');
  return payload;
}

function cloneAppSettings(settings) {
  return {
    ...settings,
    homeManagedCategoryIds: Array.isArray(settings?.homeManagedCategoryIds)
      ? settings.homeManagedCategoryIds.slice()
      : [],
    safeToSpend: normalizeSafeToSpendSettings(settings?.safeToSpend),
    rewardSavings: normalizeRewardSavingsSettings(settings?.rewardSavings),
    budget: normalizeBudgetSettings(settings?.budget),
    budgetAlerts: normalizeBudgetAlerts(settings?.budgetAlerts),
    missions: normalizeMissionSettings(settings?.missions),
    homeCards: normalizeHomeCards(settings?.homeCards),
    autoClassify: normalizeAutoClassifySettings(settings?.autoClassify),
    backup: normalizeBackupSettings(settings?.backup),
    exportPrefs: normalizeExportPrefs(settings?.exportPrefs),
  };
}

function normalizeISODate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeAppSettings(value = {}, opts = {}) {
  const base = opts.partial ? {} : { ...DEFAULT_APP_SETTINGS };
  if (!opts.partial || 'theme' in value) {
    const theme = String(value.theme || '').toLowerCase();
    base.theme = ['light', 'dark', 'system'].includes(theme) ? theme : DEFAULT_APP_SETTINGS.theme;
  }
  if (!opts.partial || 'planSegment' in value) {
    const segment = String(value.planSegment || '').toLowerCase();
    base.planSegment = ['want', 'do', 'bank'].includes(segment) ? segment : DEFAULT_APP_SETTINGS.planSegment;
  }
  if (!opts.partial || 'homeManagedCategoryIds' in value) {
    base.homeManagedCategoryIds = Array.isArray(value.homeManagedCategoryIds)
      ? value.homeManagedCategoryIds.map(id => String(id || '').trim()).filter(Boolean).slice(0, 8)
      : DEFAULT_APP_SETTINGS.homeManagedCategoryIds;
  }
  if (!opts.partial || 'biweeklyStartDate' in value) {
    base.biweeklyStartDate = normalizeISODate(value.biweeklyStartDate);
  }
  if (!opts.partial || 'safeToSpend' in value) {
    base.safeToSpend = normalizeSafeToSpendSettings(value.safeToSpend);
  }
  if (!opts.partial || 'rewardSavings' in value) {
    base.rewardSavings = normalizeRewardSavingsSettings(value.rewardSavings);
  }
  if (!opts.partial || 'budget' in value) {
    base.budget = normalizeBudgetSettings(value.budget);
  }
  if (!opts.partial || 'budgetAlerts' in value) {
    base.budgetAlerts = normalizeBudgetAlerts(value.budgetAlerts);
  }
  if (!opts.partial || 'missions' in value) {
    base.missions = normalizeMissionSettings(value.missions);
  }
  if (!opts.partial || 'homeCards' in value) {
    base.homeCards = normalizeHomeCards(value.homeCards);
  }
  if (!opts.partial || 'autoClassify' in value) {
    base.autoClassify = normalizeAutoClassifySettings(value.autoClassify);
  }
  if (!opts.partial || 'backup' in value) {
    base.backup = normalizeBackupSettings(value.backup);
  }
  if (!opts.partial || 'exportPrefs' in value) {
    base.exportPrefs = normalizeExportPrefs(value.exportPrefs);
  }
  return base;
}

function normalizeBudgetSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.budget;
  const cycle = String(src.cycle || '').toLowerCase();
  const rollover = String(src.rollover || '').toLowerCase();
  return {
    amount: normalizeWonAmount(src.amount, defaults.amount),
    cycle: ['monthly', 'weekly', 'custom'].includes(cycle) ? cycle : defaults.cycle,
    startDay: clampInteger(src.startDay, 1, 28, defaults.startDay),
    customStartDate: normalizeISODate(src.customStartDate),
    rollover: ['carryover', 'reset', 'deduct_over'].includes(rollover) ? rollover : defaults.rollover,
  };
}

function normalizeBudgetAlerts(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.budgetAlerts;
  const total = src.total && typeof src.total === 'object' ? src.total : {};
  const basis = String(src.basis || '').toLowerCase();
  const overridesSrc = src.categoryOverrides && typeof src.categoryOverrides === 'object' ? src.categoryOverrides : {};
  const categoryOverrides = {};
  for (const [categoryId, stages] of Object.entries(overridesSrc).slice(0, 100)) {
    const id = String(categoryId || '').trim();
    if (!id || !stages || typeof stages !== 'object') continue;
    categoryOverrides[id] = normalizeAlertStages(stages, defaults.categoryDefault);
  }
  return {
    total: {
      warn70: total.warn70 !== false && total.warn70 !== 'false',
      warn90: total.warn90 !== false && total.warn90 !== 'false',
      over: total.over !== false && total.over !== 'false',
    },
    categoryDefault: normalizeAlertStages(src.categoryDefault, defaults.categoryDefault),
    basis: ['common', 'per_category'].includes(basis) ? basis : defaults.basis,
    categoryOverrides,
  };
}

function normalizeAlertStages(value = {}, defaults = { warn: 70, alert: 90, over: 100 }) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    warn: clampInteger(src.warn, 1, 200, defaults.warn),
    alert: clampInteger(src.alert, 1, 300, defaults.alert),
    over: clampInteger(src.over, 1, 500, defaults.over),
  };
}

function normalizeMissionSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.missions;
  const difficulty = String(src.difficulty || '').toLowerCase();
  const items = (Array.isArray(src.items) ? src.items : [])
    .slice(0, 20)
    .map((item, index) => normalizeMissionItem(item, index))
    .filter(Boolean);
  return {
    autoJoin: src.autoJoin !== false && src.autoJoin !== 'false',
    difficulty: ['normal', 'high'].includes(difficulty) ? difficulty : defaults.difficulty,
    items,
  };
}

function normalizeMissionItem(item = {}, index = 0) {
  if (!item || typeof item !== 'object') return null;
  const type = String(item.type || '').toLowerCase();
  if (!['no_spend_days', 'category_cap', 'budget_pace'].includes(type)) return null;
  const params = item.params && typeof item.params === 'object' ? item.params : {};
  const period = item.period && typeof item.period === 'object' ? item.period : {};
  return {
    id: String(item.id || `msn_${index + 1}`).trim().slice(0, 40) || `msn_${index + 1}`,
    title: String(item.title || '미션').trim().slice(0, 60) || '미션',
    rewardPoints: clampInteger(item.rewardPoints, 0, 999999, 0),
    type,
    params: {
      targetDays: clampInteger(params.targetDays, 1, 31, 3),
      categoryName: String(params.categoryName || '').trim().slice(0, 40),
      capAmount: normalizeWonAmount(params.capAmount, 0),
      maxPct: clampInteger(params.maxPct, 1, 200, 90),
    },
    period: {
      start: normalizeISODate(period.start),
      end: normalizeISODate(period.end),
    },
    active: item.active !== false && item.active !== 'false',
    completedAt: normalizeISODate(item.completedAt),
  };
}

const HOME_CARD_IDS = ['hero', 'kpis', 'categories', 'funds', 'goals', 'points', 'recentTx', 'budgetSummary', 'calendar'];

function normalizeHomeCards(value) {
  if (!Array.isArray(value)) return [];
  const used = new Set();
  return value
    .map((card, index) => {
      const src = card && typeof card === 'object' ? card : {};
      const id = String(src.id || '').trim();
      if (!HOME_CARD_IDS.includes(id) || used.has(id)) return null;
      used.add(id);
      const variant = String(src.variant || '').toLowerCase();
      return {
        id,
        visible: src.visible !== false && src.visible !== 'false',
        variant: ['detailed', 'simple'].includes(variant) ? variant : 'detailed',
        order: Number.isFinite(Number(src.order)) ? Number(src.order) : (index + 1) * 10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function normalizeAutoClassifySettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.autoClassify;
  const method = String(src.method || '').toLowerCase();
  const confidence = String(src.confidence || '').toLowerCase();
  const rules = (Array.isArray(src.rules) ? src.rules : [])
    .slice(0, 50)
    .map((rule, index) => normalizeClassifyRule(rule, index))
    .filter(Boolean);
  return {
    enabled: src.enabled !== false && src.enabled !== 'false',
    method: ['all', 'high_confidence'].includes(method) ? method : defaults.method,
    confidence: ['strict', 'balanced', 'loose'].includes(confidence) ? confidence : defaults.confidence,
    rules,
  };
}

function normalizeClassifyRule(rule = {}, index = 0) {
  if (!rule || typeof rule !== 'object') return null;
  const type = String(rule.type || '').toLowerCase();
  if (!['keyword', 'amount'].includes(type)) return null;
  const categoryName = String(rule.categoryName || '').trim().slice(0, 40);
  if (!categoryName) return null;
  const keyword = String(rule.keyword || '').trim().slice(0, 40);
  if (type === 'keyword' && !keyword) return null;
  const minAmount = normalizeWonAmount(rule.minAmount, 0);
  const maxAmount = normalizeWonAmount(rule.maxAmount, 0);
  if (type === 'amount' && !minAmount && !maxAmount) return null;
  return {
    id: String(rule.id || `rule_${index + 1}`).trim().slice(0, 40) || `rule_${index + 1}`,
    type,
    keyword,
    minAmount,
    maxAmount,
    categoryName,
    subcategory: String(rule.subcategory || '').trim().slice(0, 40),
  };
}

function normalizeBackupSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.backup;
  const scope = src.scope && typeof src.scope === 'object' ? src.scope : {};
  return {
    auto: src.auto === true || src.auto === 'true',
    intervalDays: clampInteger(src.intervalDays, 1, 90, defaults.intervalDays),
    wifiOnly: src.wifiOnly !== false && src.wifiOnly !== 'false',
    skipLowBattery: src.skipLowBattery !== false && src.skipLowBattery !== 'false',
    lastBackupAt: String(src.lastBackupAt || '').trim().slice(0, 40),
    lastBackupSize: normalizeWonAmount(src.lastBackupSize, 0),
    scope: {
      transactions: scope.transactions !== false && scope.transactions !== 'false',
      budgets: scope.budgets !== false && scope.budgets !== 'false',
      rules: scope.rules !== false && scope.rules !== 'false',
      homeSettings: scope.homeSettings !== false && scope.homeSettings !== 'false',
    },
  };
}

function normalizeExportPrefs(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.exportPrefs;
  const format = String(src.format || '').toLowerCase();
  return {
    format: ['csv', 'excel', 'pdf'].includes(format) ? format : defaults.format,
    includeMemo: src.includeMemo !== false && src.includeMemo !== 'false',
    includePayment: src.includePayment !== false && src.includePayment !== 'false',
    includeCanceled: src.includeCanceled === true || src.includeCanceled === 'true',
  };
}

function normalizeWonAmount(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.round(Number(fallback) || 0));
  return Math.min(9999999999, Math.max(0, Math.round(n)));
}

function normalizeSafeToSpendSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const pacingMode = String(src.pacingMode || '').toLowerCase();
  return {
    enabled: src.enabled !== false && src.enabled !== 'false',
    pacingMode: ['period', 'daily'].includes(pacingMode) ? pacingMode : DEFAULT_APP_SETTINGS.safeToSpend.pacingMode,
  };
}

function normalizeRewardSavingsSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const allocation = Number(src.allocationRate);
  const lookback = Math.round(Number(src.lookbackDays) || DEFAULT_APP_SETTINGS.rewardSavings.lookbackDays);
  const baselineMethod = String(src.baselineMethod || DEFAULT_APP_SETTINGS.rewardSavings.baselineMethod);
  const legacyRate = Number.isFinite(allocation)
    ? Math.min(1, Math.max(0, allocation > 1 ? allocation / 100 : allocation))
    : DEFAULT_APP_SETTINGS.rewardSavings.allocationRate;
  const pointItems = normalizeRewardPointItems(src.pointItems, src.pointRates, legacyRate);
  const pointRates = pointRatesFromItems(pointItems);
  return {
    enabled: src.enabled !== false && src.enabled !== 'false',
    lookbackDays: [90, 180, 365].includes(lookback) ? lookback : DEFAULT_APP_SETTINGS.rewardSavings.lookbackDays,
    allocationRate: pointRates.winePurchase ?? pointItems[0]?.rate ?? legacyRate,
    pointRates,
    pointItems,
    baselineMethod: ['trimmed_weekly', 'simple_daily'].includes(baselineMethod) ? baselineMethod : DEFAULT_APP_SETTINGS.rewardSavings.baselineMethod,
    dailyReward: normalizeDailyRewardSettings(src.dailyReward),
  };
}

function normalizeDailyRewardSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.rewardSavings.dailyReward;
  return {
    enabled: src.enabled !== false && src.enabled !== 'false',
    selectedDateKey: normalizeISODate(src.selectedDateKey),
    selectedRuleId: String(src.selectedRuleId || '').trim().slice(0, 32),
    focusBucketKey: normalizeRewardFocusKey(src.focusBucketKey),
    bonusRate: normalizeRewardRate(src.bonusRate, defaults.bonusRate),
    bonusCap: normalizeRewardTargetAmount(src.bonusCap, defaults.bonusCap),
    freezeCount: clampInteger(src.freezeCount, 0, 12, defaults.freezeCount),
    streakDays: clampInteger(src.streakDays, 0, 999, defaults.streakDays),
    tierLabel: String(src.tierLabel || defaults.tierLabel).trim().slice(0, 24),
  };
}

function normalizeRewardPointRates(value = {}, legacyWineRate = DEFAULT_APP_SETTINGS.rewardSavings.allocationRate) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    winePurchase: normalizeRewardRate(src.winePurchase, legacyWineRate),
    premiumIngredients: normalizeRewardRate(src.premiumIngredients, DEFAULT_APP_SETTINGS.rewardSavings.pointRates.premiumIngredients),
    travelFund: normalizeRewardRate(src.travelFund, DEFAULT_APP_SETTINGS.rewardSavings.pointRates.travelFund),
  };
}

function normalizeRewardRate(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, ratio));
}

function normalizeRewardPointItems(value, legacyPointRates = {}, legacyWineRate = DEFAULT_APP_SETTINGS.rewardSavings.allocationRate) {
  const defaultItems = DEFAULT_APP_SETTINGS.rewardSavings.pointItems;
  const legacyRates = normalizeRewardPointRates(legacyPointRates, legacyWineRate);
  const sourceItems = Array.isArray(value)
    ? value
    : defaultItems.map(item => ({
        ...item,
        rate: legacyRates[item.id] ?? item.rate,
      }));
  const used = new Set();
  return sourceItems
    .map((item, index) => normalizeRewardPointItem(item, index, legacyRates, used))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function normalizeRewardPointItem(item = {}, index = 0, legacyRates = {}, used = new Set()) {
  const fallback = DEFAULT_APP_SETTINGS.rewardSavings.pointItems[index] || {};
  const rawId = normalizeRewardPointItemId(item.id || fallback.id || `customPoint${index + 1}`);
  const id = uniqueRewardPointItemId(rawId, used);
  const label = String(item.label || item.name || fallback.label || `포인트 ${index + 1}`).trim().slice(0, 32);
  const fallbackRate = legacyRates[id] ?? legacyRates[fallback.id] ?? fallback.rate ?? 0;
  const fallbackTarget = fallback.targetAmount ?? 100000;
  return {
    id,
    label: label || `포인트 ${index + 1}`,
    rate: normalizeRewardRate(item.rate ?? legacyRates[id], fallbackRate),
    targetAmount: normalizeRewardTargetAmount(item.targetAmount, fallbackTarget),
    enabled: item.enabled !== false && item.enabled !== 'false',
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10,
  };
}

function normalizeRewardPointItemId(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
  return normalized || 'customPoint';
}

function normalizeRewardFocusKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
}

function uniqueRewardPointItemId(base, used) {
  let id = base || 'customPoint';
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function normalizeRewardTargetAmount(value, fallback = 100000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.round(Number(fallback) || 0));
  return Math.min(999999999, Math.max(0, Math.round(n)));
}

function clampInteger(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pointRatesFromItems(items = []) {
  return Object.fromEntries((Array.isArray(items) ? items : []).map(item => [item.id, item.rate]));
}
