import { escHtml } from '../../../utils/dom.js';

// rate = 하루 적립률. 지난달 일 평균보다 적게 쓴 날 '목표 금액 x rate' 를 적립한다.
export const DEFAULT_REWARD_SAVINGS_SETTINGS = {
  enabled: true,
  allocationRate: 0.01,
  pointRates: {
    winePurchase: 0.01,
    premiumIngredients: 0.01,
    travelFund: 0.01,
  },
  pointItems: [
    { id: 'winePurchase', label: '와인구매 포인트', rate: 0.01, targetAmount: 120000, enabled: true, order: 10 },
    { id: 'premiumIngredients', label: '고급재료 포인트', rate: 0.01, targetAmount: 80000, enabled: true, order: 20 },
    { id: 'travelFund', label: '여행충당 포인트', rate: 0.01, targetAmount: 200000, enabled: true, order: 30 },
  ],
};

export function normalizeRewardSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const allocationRate = normalizeAllocationRate(source.allocationRate);
  const legacyRate = Number.isFinite(allocationRate) ? allocationRate : DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate;
  const pointItems = normalizeRewardPointItems(source.pointItems, source.pointRates, legacyRate);
  const pointRates = pointRatesFromItems(pointItems);
  return {
    ...DEFAULT_REWARD_SAVINGS_SETTINGS,
    ...source,
    enabled: source.enabled !== false && source.enabled !== 'false',
    allocationRate: pointRates.winePurchase ?? pointItems[0]?.rate ?? legacyRate,
    pointRates,
    pointItems,
  };
}

export function rewardOption(value, label, selected) {
  return `<option value="${escHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escHtml(label)}</option>`;
}

export function readRewardSettingsForm(form) {
  const fd = new FormData(form);
  const pointItems = Array.from(form.querySelectorAll('[data-reward-point-row]')).map((row, index) => {
    const id = normalizeRewardPointId(row.dataset.rewardPointId || `customPoint${index + 1}`);
    return {
      id,
      label: String(fd.get(`pointLabel:${id}`) || '').trim(),
      rate: parsePercentInput(fd.get(`pointRate:${id}`)) / 100,
      targetAmount: parseMoneyInput(fd.get(`pointTarget:${id}`)),
      enabled: fd.get(`pointEnabled:${id}`) === 'on',
      order: (index + 1) * 10,
    };
  });
  return normalizeRewardSettings({
    enabled: fd.get('enabled') === 'on',
    pointItems,
  });
}

export function formatRewardRatePct(value) {
  const pct = normalizeAllocationRate(value) * 100;
  if (!Number.isFinite(pct)) return '0';
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

export function rewardPointItemFields(pointItems = []) {
  const items = Array.isArray(pointItems) ? pointItems : [];
  if (!items.length) {
    return '<div class="reward-point-empty" data-reward-point-empty>포인트 항목이 없습니다.</div>';
  }
  return items.map(rewardPointItemRow).join('');
}

export function appendRewardPointRow(form) {
  const list = form?.querySelector?.('[data-reward-point-list]');
  if (!list) return;
  list.querySelector('[data-reward-point-empty]')?.remove();
  list.insertAdjacentHTML('beforeend', rewardPointItemRow({
    id: createRewardPointId(),
    label: '새 포인트',
    rate: 0,
    targetAmount: 100000,
    enabled: true,
    order: list.querySelectorAll('[data-reward-point-row]').length * 10 + 10,
  }));
}

function normalizeAllocationRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, ratio));
}

function normalizeRewardPointRates(value = {}, legacyWineRate = DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    winePurchase: normalizeRewardRate(source.winePurchase, legacyWineRate),
    premiumIngredients: normalizeRewardRate(source.premiumIngredients, DEFAULT_REWARD_SAVINGS_SETTINGS.pointRates.premiumIngredients),
    travelFund: normalizeRewardRate(source.travelFund, DEFAULT_REWARD_SAVINGS_SETTINGS.pointRates.travelFund),
  };
}

function normalizeRewardRate(value, fallback) {
  const rate = normalizeAllocationRate(value);
  return Number.isFinite(rate) ? rate : fallback;
}

function parsePercentInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const n = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function parseMoneyInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const n = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.min(999999999, Math.max(0, Math.round(n))) : 0;
}

function parseCountInput(value, fallback = 0) {
  const n = Math.round(Number(String(value ?? '').replace(/[^\d.-]/g, '')));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function normalizeRewardDateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeRewardFocusKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
}

function clampRewardCount(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function rewardPointItemRow(item = {}) {
  const id = normalizeRewardPointId(item.id || createRewardPointId());
  return `
    <div class="reward-point-item-row" data-reward-point-row data-reward-point-id="${escHtml(id)}">
      <label class="reward-point-use" aria-label="${escHtml(item.label || '포인트')} 사용">
        <input type="checkbox" name="pointEnabled:${escHtml(id)}" ${item.enabled !== false ? 'checked' : ''}>
        <span>사용</span>
      </label>
      <label class="reward-point-name-field">
        <span>항목명</span>
        <input class="tds-input" type="text" name="pointLabel:${escHtml(id)}" maxlength="32" value="${escHtml(item.label || '')}" placeholder="포인트 이름">
      </label>
      <label>
        <span>적립률</span>
        <div class="reward-rate-field">
          <input class="tds-input" type="number" name="pointRate:${escHtml(id)}" inputmode="decimal" min="0" max="100" step="0.1" value="${formatRewardRatePct(item.rate)}">
          <span aria-hidden="true">%</span>
        </div>
      </label>
      <label>
        <span>기준액</span>
        <div class="reward-target-field">
          <input class="tds-input" type="number" name="pointTarget:${escHtml(id)}" inputmode="numeric" min="0" max="999999999" step="1000" value="${Math.max(0, Math.round(Number(item.targetAmount) || 0))}">
          <span aria-hidden="true">원</span>
        </div>
      </label>
      <button class="tds-icon-btn sm reward-point-delete" type="button" data-reward-point-action="delete" title="포인트 항목 삭제" aria-label="포인트 항목 삭제">×</button>
    </div>
  `;
}

function createRewardPointId() {
  return `customPoint${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeRewardPointItems(value, legacyPointRates = {}, legacyWineRate = DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate) {
  const legacyRates = normalizeRewardPointRates(legacyPointRates, legacyWineRate);
  const defaults = DEFAULT_REWARD_SAVINGS_SETTINGS.pointItems;
  const sourceItems = Array.isArray(value)
    ? value
    : defaults.map(item => ({
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
  const fallback = DEFAULT_REWARD_SAVINGS_SETTINGS.pointItems[index] || {};
  const id = uniqueRewardPointId(normalizeRewardPointId(item.id || fallback.id || `customPoint${index + 1}`), used);
  const label = String(item.label || fallback.label || `포인트 ${index + 1}`).trim().slice(0, 32) || `포인트 ${index + 1}`;
  const fallbackRate = legacyRates[id] ?? legacyRates[fallback.id] ?? fallback.rate ?? 0;
  return {
    id,
    label,
    rate: normalizeRewardRate(item.rate ?? legacyRates[id], fallbackRate),
    targetAmount: normalizeRewardTargetAmount(item.targetAmount, fallback.targetAmount ?? 100000),
    enabled: item.enabled !== false && item.enabled !== 'false',
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10,
  };
}

function normalizeRewardPointId(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
  return normalized || createRewardPointId();
}

function uniqueRewardPointId(base, used) {
  let id = base || createRewardPointId();
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

function pointRatesFromItems(items = []) {
  return Object.fromEntries((Array.isArray(items) ? items : []).map(item => [item.id, item.rate]));
}
