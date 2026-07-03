// ================================================================
// render-settings.js — 설정 화면
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules, saveSharedPaymentRule, deleteSharedPaymentRule,
  saveCategoryMonthlyTarget, saveCategoryBudgetRhythm,
  getAppSettings, saveAppSettings,
} from './data.js?v=20260703-ingest-purge';
import { fmtKRW, fmtMonthKey } from './utils/format.js?v=20260503-cache-no-store';
import { $, escHtml } from './utils/dom.js?v=20260503-cache-no-store';
import { showToast } from './utils/toast.js?v=20260503-cache-no-store';

const DEFAULT_REWARD_SAVINGS_SETTINGS = {
  enabled: true,
  lookbackDays: 180,
  allocationRate: 0.3,
  dailyPointCap: 10000,
  monthPointCap: 120000,
  baselineMethod: 'trimmed_weekly',
};

export async function renderSettings() {
  const root = $('#tab-settings');
  const user = getCurrentUser();
  const categories = getCategories();
  const budgetMonth = fmtMonthKey(new Date());
  const expenseCategories = categories
    .filter(c => c.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const sharedRules = user ? await listSharedPaymentRules().catch(() => []) : [];
  const appSettings = await getAppSettings().catch(() => ({
    theme: localStorage.getItem('budget.theme') || 'dark',
    homeManagedCategoryIds: [],
    rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS,
  }));
  const rewardSavings = normalizeRewardSettings(appSettings.rewardSavings);
  const androidCapture = readAndroidCaptureStatus();
  window._budgetHomeManagedCategoryIds = Array.isArray(appSettings.homeManagedCategoryIds) ? appSettings.homeManagedCategoryIds : [];

  root.innerHTML = `
    <div class="settings-card" style="margin-top:8px">
      <div class="settings-row">
        <div class="l">
          <div class="ico" style="background:var(--primary-bg);color:var(--primary)">k</div>
          <div>
            <div class="name">${escHtml(user?.email?.split('@')[0] || 'kim')}</div>
            <div class="desc">${escHtml(user?.email || '-')}</div>
          </div>
        </div>
        <button class="tds-text-btn" onclick="signOut()">로그아웃</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">예산 & 카테고리</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="l"><div class="ico">📊</div><div><div class="name">예산 목표</div><div class="desc">${budgetMonth} · ${fmtKRW(expenseCategories.reduce((sum, c) => sum + currentTarget(c, budgetMonth), 0))}</div></div></div>
          <button class="tds-text-btn" onclick="openCategoryModal()">+ 추가</button>
        </div>
        <div class="settings-row" style="display:block">
          <div class="budget-settings-card">
            ${budgetGoalGroups(expenseCategories, budgetMonth)}
          </div>
          <div class="desc" style="padding:8px 4px 0">입력값은 만원 단위입니다. 항목명이나 자동분류 키워드는 수정 버튼에서 바꿀 수 있습니다.</div>
        </div>
        <div class="settings-row" style="display:block">
          <div class="settings-control-head">
            <div>
              <div class="name">홈 관리 카테고리</div>
              <div class="desc">홈에는 고른 항목만 횟수/금액으로 나눠 보여줍니다.</div>
            </div>
          </div>
          <div class="home-managed-picker">
            ${homeManagedCategoryOptions(expenseCategories.filter(cat => currentRhythm(cat) !== 'fixed'), appSettings.homeManagedCategoryIds || [])}
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">화면 & 소계획</div>
      <div class="settings-card">
        <div class="settings-row" style="display:block">
          <div class="l"><div class="ico">◐</div><div><div class="name">테마</div><div class="desc">라이트/다크/시스템 모드</div></div></div>
          <div class="tds-segmented settings-theme-segment" id="settings-theme-segment">
            ${themeOption('light', '라이트', appSettings.theme)}
            ${themeOption('dark', '다크', appSettings.theme)}
            ${themeOption('system', '시스템', appSettings.theme)}
          </div>
        </div>
        <div class="settings-row reward-settings-row" style="display:block">
          <form id="reward-settings-form" class="reward-settings-form">
            <div class="settings-control-head">
              <div>
                <div class="name">보상 적립</div>
                <div class="desc">기준 소비보다 덜 쓴 금액의 일부를 포인트로 계산합니다.</div>
              </div>
              <label class="toggle-row reward-toggle" aria-label="보상 적립 사용">
                <input type="checkbox" name="enabled" ${rewardSavings.enabled ? 'checked' : ''}>
              </label>
            </div>
            <div class="reward-settings-grid">
              <label>
                <span>기준 기간</span>
                <select class="tds-select" name="lookbackDays">
                  ${rewardOption(90, '최근 3개월', rewardSavings.lookbackDays)}
                  ${rewardOption(180, '최근 6개월', rewardSavings.lookbackDays)}
                  ${rewardOption(365, '최근 1년', rewardSavings.lookbackDays)}
                </select>
              </label>
              <label>
                <span>기준선 방식</span>
                <select class="tds-select" name="baselineMethod">
                  ${rewardOption('trimmed_weekly', '주간 트림 평균', rewardSavings.baselineMethod)}
                  ${rewardOption('simple_daily', '단순 일평균', rewardSavings.baselineMethod)}
                </select>
              </label>
              <label>
                <span>적립 배분율</span>
                <div class="reward-rate-field">
                  <input class="tds-input" type="number" name="allocationRatePct" inputmode="decimal" min="0" max="100" step="0.1" value="${formatRewardRatePct(rewardSavings.allocationRate)}">
                  <span aria-hidden="true">%</span>
                </div>
              </label>
              <label>
                <span>일 상한</span>
                <input class="tds-input" name="dailyPointCap" inputmode="numeric" value="${rewardSavings.dailyPointCap}">
              </label>
              <label>
                <span>월 상한</span>
                <input class="tds-input" name="monthPointCap" inputmode="numeric" value="${rewardSavings.monthPointCap}">
              </label>
            </div>
            <div class="reward-settings-actions">
              <button class="tds-text-btn" id="reward-settings-reset" type="button">초기화</button>
              <button class="tds-btn sm" type="submit">저장</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">계좌 & 데이터 소스</div>
      <div class="settings-card">
        <button type="button" class="settings-row as-button" onclick="switchTab('review')">
          <div class="l"><div class="ico">▣</div><div><div class="name">검토 대기</div><div class="desc">미분류·자동분류 실패 거래를 한 번에 확인</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" onclick="switchTab('settle')">
          <div class="l"><div class="ico">↔</div><div><div class="name">정산 흐름</div><div class="desc">받을 돈·줄 돈을 상대별로 점검</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" onclick="switchTab('report')">
          <div class="l"><div class="ico">↗</div><div><div class="name">월간 리포트</div><div class="desc">홈 요약보다 자세한 소비 페이스</div></div></div>
          <span class="arrow">›</span>
        </button>
        ${androidCapturePanel(androidCapture)}
        <div class="settings-row">
          <div class="l"><div class="ico">⚖️</div><div><div class="name">정산 규칙</div><div class="desc">${sharedRules.length}건 자동 매칭</div></div></div>
          <span class="arrow">›</span>
        </div>
        <div class="settings-row" style="display:block">
          <form id="shared-rule-form" class="flex gap-md">
            <input class="tds-input" name="merchant" placeholder="결제처" style="flex:1" required>
            <input class="tds-input" name="peopleCount" type="number" min="2" max="10" value="2" style="width:72px" required>
            <button class="tds-btn sm" type="submit">추가</button>
          </form>
        </div>
        ${sharedRules.length === 0 ? '<div class="settings-row"><div class="desc">등록된 결제처가 없습니다.</div></div>' : sharedRules.map(rule => `
          <div class="settings-row">
            <div class="l">
              <div class="ico">÷</div>
              <div>
                <div class="name">${escHtml(rule.merchant || rule.name || '-')}</div>
                <div class="desc">${Number(rule.peopleCount) || 2}명 기준 내 부담액만 기록</div>
              </div>
            </div>
            <button class="tds-text-btn" data-delete-shared-rule="${rule.id}" type="button">삭제</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="settings-section">
      <div class="h">앱 정보</div>
      <div class="settings-card">
        <div class="settings-row"><div class="l"><div class="ico">ⓘ</div><div><div class="name">버전</div><div class="desc">v2.0.7 · Android APK</div></div></div><div class="r">›</div></div>
        <a class="settings-row as-button apk-download-row" href="./downloads/budget.apk?v=20260703-android-local-notification-v8" download="tomato-budget.apk">
          <div class="l">
            <div class="ico apk-download-ico"><img src="./android-apk.svg" alt=""></div>
            <div>
              <div class="name">Android APK 다운로드</div>
              <div class="desc">Android 알림 수집용 APK 내려받기</div>
            </div>
          </div>
          <span class="arrow">다운로드</span>
        </a>
      </div>
    </div>
  `;

  bindBudgetGoalControls(budgetMonth);
  bindSharedRuleControls();
  bindAppSettingControls();
}

window.refreshSettings = renderSettings;

function themeOption(value, label, selected) {
  return `<button class="tds-segmented-item ${selected === value ? 'active' : ''}" type="button" data-theme-choice="${value}">${label}</button>`;
}

function homeManagedCategoryOptions(categories, selectedIds = []) {
  const selected = new Set(selectedIds);
  return categories.map(cat => `
    <button type="button" class="home-managed-pick ${selected.has(cat.id) ? 'active' : ''}" data-home-managed-category-id="${escHtml(cat.id)}">
      <span>${cat.emoji || '□'}</span>
      <strong>${escHtml(cat.name)}</strong>
    </button>
  `).join('');
}

function bindAppSettingControls() {
  document.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.themeChoice;
      try {
        localStorage.setItem('budget.theme', theme);
        window.applyBudgetTheme?.(theme);
        await saveAppSettings({ theme });
        showToast('테마를 저장했어요.', 1200, 'success');
        renderSettings();
      } catch (err) {
        showToast(err.message || '테마 저장 실패', 2200, 'error');
      }
    });
  });
  document.querySelectorAll('[data-home-managed-category-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.homeManagedCategoryId;
      const current = new Set(Array.isArray(window._budgetHomeManagedCategoryIds) ? window._budgetHomeManagedCategoryIds : []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      const homeManagedCategoryIds = Array.from(current).slice(0, 8);
      try {
        window._budgetHomeManagedCategoryIds = homeManagedCategoryIds;
        await saveAppSettings({ homeManagedCategoryIds });
        showToast('홈 관리 카테고리를 저장했어요.', 1200, 'success');
        renderSettings();
        if (window.refreshCurrentTab) window.refreshCurrentTab();
      } catch (err) {
        showToast(err.message || '홈 카테고리 저장 실패', 2200, 'error');
      }
    });
  });

  const rewardForm = $('#reward-settings-form');
  rewardForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rewardSavings = readRewardSettingsForm(event.currentTarget);
    try {
      await saveAppSettings({ rewardSavings });
      showToast('보상 적립 설정을 저장했어요.', 1400, 'success');
      renderSettings();
      window.refreshCurrentTab?.();
    } catch (err) {
      showToast(err.message || '보상 적립 설정 저장 실패', 2200, 'error');
    }
  });
  $('#reward-settings-reset')?.addEventListener('click', async () => {
    try {
      await saveAppSettings({ rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS });
      showToast('보상 적립 설정을 초기화했어요.', 1400, 'success');
      renderSettings();
      window.refreshCurrentTab?.();
    } catch (err) {
      showToast(err.message || '보상 적립 초기화 실패', 2200, 'error');
    }
  });

  $('#android-open-notification-settings')?.addEventListener('click', () => {
    const bridge = androidBridge();
    if (!bridge?.openNotificationAccessSettings) {
      showToast('Android APK에서만 열 수 있어요.', 1800, 'error');
      return;
    }
    bridge.openNotificationAccessSettings();
  });

  $('#android-capture-flush')?.addEventListener('click', async () => {
    try {
      const result = await window.flushAndroidNotificationCaptures?.({ silent: true });
      if (!result) throw new Error('Android bridge 없음');
      showToast(`저장 ${result.saved || 0}건 · 중복 ${result.duplicate || 0}건`, 1600, 'success');
      setTimeout(renderSettings, 300);
    } catch (err) {
      showToast(err.message || '알림 반영 실패', 2200, 'error');
    }
  });
}

function androidBridge() {
  return window.BudgetAndroid || null;
}

function readAndroidCaptureStatus() {
  const bridge = androidBridge();
  if (!bridge?.getStatusJson) {
    return {
      available: false,
      notificationAccessEnabled: false,
      queued: 0,
      failed: 0,
      saved: 0,
      recent: [],
    };
  }
  try {
    const parsed = JSON.parse(bridge.getStatusJson() || '{}');
    return {
      available: true,
      notificationAccessEnabled: !!parsed.notificationAccessEnabled,
      queued: Number(parsed.queued) || 0,
      failed: Number(parsed.failed) || 0,
      saved: Number(parsed.saved) || 0,
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 6) : [],
    };
  } catch (err) {
    return {
      available: true,
      notificationAccessEnabled: false,
      queued: 0,
      failed: 0,
      saved: 0,
      recent: [],
      error: err.message || 'Android status parse failed',
    };
  }
}

function androidCapturePanel(status) {
  const disabled = status.available ? '' : 'disabled';
  const access = status.available
    ? (status.notificationAccessEnabled ? '알림 접근 켜짐' : '알림 접근 꺼짐')
    : 'Android APK 필요';
  const queue = `대기 ${status.queued || 0}건 · 저장 ${status.saved || 0}건${status.failed ? ` · 실패 ${status.failed}건` : ''}`;
  return `
    <div class="settings-row" style="display:block">
      <div class="settings-control-head">
        <div class="l">
          <div class="ico">🔔</div>
          <div>
            <div class="name">Android 알림 수집</div>
            <div class="desc">${escHtml(access)} · ${escHtml(queue)}</div>
          </div>
        </div>
      </div>
      <div class="flex gap-sm" style="flex-wrap:wrap;margin-top:10px">
        <button class="tds-btn sm" id="android-open-notification-settings" type="button" ${disabled}>알림 접근 열기</button>
        <button class="tds-text-btn" id="android-capture-flush" type="button" ${disabled}>지금 반영</button>
      </div>
      <div class="desc" style="padding-top:8px">${status.available ? '결제 알림은 Android 기기 안의 로컬 큐에 먼저 쌓이고, 로그인된 앱이 열리면 거래로 저장됩니다.' : '웹 브라우저에서는 휴대폰 알림을 읽을 수 없습니다. APK에서 알림 접근 권한을 켜세요.'}</div>
      ${androidCaptureRecent(status)}
    </div>
  `;
}

function androidCaptureRecent(status) {
  if (status.error) return `<div class="desc" style="padding-top:8px;color:var(--danger)">${escHtml(status.error)}</div>`;
  if (!status.available || !status.recent.length) return '';
  return `
    <div style="display:grid;gap:6px;margin-top:10px">
      ${status.recent.map(row => `
        <div style="display:grid;gap:2px;border-top:1px solid var(--line);padding-top:8px">
          <div class="name" style="font-size:13px">${escHtml(androidCaptureTitle(row))}</div>
          <div class="desc">${escHtml(androidCaptureMeta(row))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function androidCaptureTitle(row = {}) {
  if (row.status === 'info' || row.status === 'error') return `${row.status} · ${row.event || 'Android'}`;
  const amount = Number(row.amount) ? `${Number(row.amount).toLocaleString('ko-KR')}원` : '금액 없음';
  return `${captureStatusLabel(row.status)} · ${row.merchant || row.appLabel || '알림'} · ${amount}`;
}

function androidCaptureMeta(row = {}) {
  const bits = [];
  if (row.occurredAt) bits.push(row.occurredAt);
  else if (row.capturedAt) bits.push(androidCaptureTime(row.capturedAt));
  if (row.type) bits.push(row.type);
  if (row.packageName) bits.push(row.packageName);
  if (row.lastError) bits.push(row.lastError);
  if (row.message) bits.push(row.message);
  return bits.join(' · ') || '상세 없음';
}

function captureStatusLabel(status) {
  if (status === 'queued') return '대기';
  if (status === 'saved') return '저장됨';
  if (status === 'duplicate') return '중복';
  if (status === 'merged') return '병합';
  if (status === 'failed') return '실패';
  if (status === 'ignored') return '무시됨';
  if (status === 'info') return '정보';
  if (status === 'error') return '오류';
  return status || '상태 없음';
}

function androidCaptureTime(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function bindSharedRuleControls() {
  $('#shared-rule-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await saveSharedPaymentRule({
        merchant: fd.get('merchant'),
        peopleCount: fd.get('peopleCount'),
      });
      showToast('공동 결제처 저장됨', 1500, 'success');
      renderSettings();
    } catch (err) {
      showToast(err.message, 3000, 'error');
    }
  });

  document.querySelectorAll('[data-delete-shared-rule]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await deleteSharedPaymentRule(btn.dataset.deleteSharedRule);
        showToast('삭제됨', 1500, 'success');
        renderSettings();
      } catch (err) {
        showToast(err.message, 3000, 'error');
      }
    });
  });
}

function budgetGoalGroups(categories, monthKey) {
  const groups = {};
  for (const cat of categories) {
    const parent = cat.parent || '기타';
    if (!groups[parent]) groups[parent] = [];
    groups[parent].push(cat);
  }
  return Object.entries(groups).map(([parent, rows]) => {
    const total = rows.reduce((sum, cat) => sum + currentTarget(cat, monthKey), 0);
    return `
      <div class="budget-goal-group">
        <div class="budget-goal-parent">
          <strong>${escHtml(parent)}</strong>
          <span>${fmtKRW(total)}</span>
        </div>
        ${rows.map(cat => `
          <div class="budget-goal-row rhythm editable">
            <span>${cat.emoji || ''} ${escHtml(cat.name)}</span>
            <input class="tds-input budget-goal-input" data-category-id="${cat.id}" inputmode="numeric" value="${Math.round(currentTarget(cat, monthKey) / 10000)}">
            <select class="tds-select budget-rhythm-select" data-rhythm-category-id="${cat.id}">
              ${['fixed', 'front_loaded', 'spread'].map(value => `<option value="${value}" ${currentRhythm(cat) === value ? 'selected' : ''}>${rhythmLabel(value)}</option>`).join('')}
            </select>
            <button type="button" class="tds-icon-btn sm budget-category-edit" onclick="openCategoryModal('${cat.id}')" title="카테고리 수정">✎</button>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function currentTarget(cat, monthKey) {
  return Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0;
}

function normalizeRewardSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const allocationRate = normalizeAllocationRate(source.allocationRate);
  return {
    ...DEFAULT_REWARD_SAVINGS_SETTINGS,
    ...source,
    enabled: source.enabled !== false && source.enabled !== 'false',
    lookbackDays: [90, 180, 365].includes(Number(source.lookbackDays)) ? Number(source.lookbackDays) : DEFAULT_REWARD_SAVINGS_SETTINGS.lookbackDays,
    allocationRate: Number.isFinite(allocationRate) ? allocationRate : DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate,
    dailyPointCap: Math.max(0, Math.round(Number(source.dailyPointCap) || DEFAULT_REWARD_SAVINGS_SETTINGS.dailyPointCap)),
    monthPointCap: Math.max(0, Math.round(Number(source.monthPointCap) || DEFAULT_REWARD_SAVINGS_SETTINGS.monthPointCap)),
    baselineMethod: ['trimmed_weekly', 'simple_daily'].includes(source.baselineMethod) ? source.baselineMethod : DEFAULT_REWARD_SAVINGS_SETTINGS.baselineMethod,
  };
}

function rewardOption(value, label, selected) {
  return `<option value="${escHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escHtml(label)}</option>`;
}

function normalizeAllocationRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, ratio));
}

function readRewardSettingsForm(form) {
  const fd = new FormData(form);
  return normalizeRewardSettings({
    enabled: fd.get('enabled') === 'on',
    lookbackDays: Number(fd.get('lookbackDays')),
    baselineMethod: fd.get('baselineMethod'),
    allocationRate: parsePercentInput(fd.get('allocationRatePct')) / 100,
    dailyPointCap: parseKRWInput(fd.get('dailyPointCap')),
    monthPointCap: parseKRWInput(fd.get('monthPointCap')),
  });
}

function parsePercentInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const n = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function parseKRWInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
}

function formatRewardRatePct(value) {
  const pct = normalizeAllocationRate(value) * 100;
  if (!Number.isFinite(pct)) return '0';
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

function currentRhythm(cat) {
  return cat.budgetRhythm || 'spread';
}

function rhythmLabel(value) {
  if (value === 'fixed') return '고정비';
  if (value === 'front_loaded') return '월초 집중';
  return '변동비';
}

function bindBudgetGoalControls(monthKey) {
  document.querySelectorAll('[data-category-id]').forEach(input => {
    input.addEventListener('change', async () => {
      const manwon = Math.max(0, Math.round(Number(String(input.value).replace(/[^\d.-]/g, '')) || 0));
      input.value = manwon;
      try {
        await saveCategoryMonthlyTarget(input.dataset.categoryId, monthKey, manwon * 10000);
        showToast('월 목표 저장됨', 1200, 'success');
        renderSettings();
        if (window.refreshCurrentTab) window.refreshCurrentTab();
      } catch (err) {
        showToast(err.message, 2600, 'error');
      }
    });
  });

  document.querySelectorAll('[data-rhythm-category-id]').forEach(select => {
    select.addEventListener('change', async () => {
      try {
        await saveCategoryBudgetRhythm(select.dataset.rhythmCategoryId, select.value);
        showToast('비용 성격 저장됨', 1200, 'success');
        renderSettings();
        if (window.refreshCurrentTab) window.refreshCurrentTab();
      } catch (err) {
        showToast(err.message, 2600, 'error');
      }
    });
  });
}
