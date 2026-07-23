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
import { queueDaybirdRefresh } from '../../utils/daybird-sync.js';

// ================================================================
// app settings — local UX preferences backed by Firestore
// ================================================================
const DEFAULT_APP_SETTINGS = {
  theme: 'dark',
  planSegment: 'want',
  homeManagedCategoryIds: [],
  biweeklyStartDate: '',
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
  return base;
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
