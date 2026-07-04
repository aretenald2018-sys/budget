// ================================================================
// render-settings.js — 설정 화면
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules, saveSharedPaymentRule, deleteSharedPaymentRule,
  saveCategoryMonthlyTarget, saveCategoryBudgetRhythm,
  getAppSettings, saveAppSettings,
} from './data.js?v=20260704-newsfeed-backfill-pagination-v3';
import { fmtKRW, fmtMonthKey } from './utils/format.js?v=20260503-cache-no-store';
import { $, escHtml } from './utils/dom.js?v=20260503-cache-no-store';
import { showToast } from './utils/toast.js?v=20260503-cache-no-store';

const DEFAULT_REWARD_SAVINGS_SETTINGS = {
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
};
const REWARD_POINT_BUCKETS = [
  { key: 'winePurchase', label: '와인구매 포인트', targetAmount: 120000 },
  { key: 'premiumIngredients', label: '고급재료 포인트', targetAmount: 80000 },
  { key: 'travelFund', label: '여행충당 포인트', targetAmount: 200000 },
];

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
              <div class="reward-point-item-editor">
                <div class="reward-point-item-head">
                  <span>포인트 항목</span>
                  <button class="tds-text-btn" type="button" data-reward-point-action="add">+ 추가</button>
                </div>
                <div class="reward-point-item-list" data-reward-point-list>
                  ${rewardPointItemFields(rewardSavings.pointItems)}
                </div>
              </div>
              <div class="reward-daily-settings">
                <div class="reward-point-item-head">
                  <span>오늘 카드</span>
                  <strong>${rewardSavings.dailyReward.enabled ? '사용 중' : '꺼짐'}</strong>
                </div>
                <input type="hidden" name="dailyRewardSelectedDateKey" value="${escHtml(rewardSavings.dailyReward.selectedDateKey || '')}">
                <input type="hidden" name="dailyRewardSelectedRuleId" value="${escHtml(rewardSavings.dailyReward.selectedRuleId || '')}">
                <input type="hidden" name="dailyRewardFocusBucketKey" value="${escHtml(rewardSavings.dailyReward.focusBucketKey || '')}">
                <input type="hidden" name="dailyRewardStreakDays" value="${Math.max(0, Math.round(Number(rewardSavings.dailyReward.streakDays) || 0))}">
                <input type="hidden" name="dailyRewardTierLabel" value="${escHtml(rewardSavings.dailyReward.tierLabel || '브론즈 1단계')}">
                <label class="reward-daily-toggle">
                  <span>오늘 카드 사용</span>
                  <input type="checkbox" name="dailyRewardEnabled" ${rewardSavings.dailyReward.enabled ? 'checked' : ''}>
                </label>
                <label>
                  <span>추가 적립률</span>
                  <div class="reward-rate-field">
                    <input class="tds-input" type="number" name="dailyRewardBonusRate" inputmode="decimal" min="0" max="100" step="0.1" value="${formatRewardRatePct(rewardSavings.dailyReward.bonusRate)}">
                    <span aria-hidden="true">%</span>
                  </div>
                </label>
                <label>
                  <span>하루 보너스 한도</span>
                  <div class="reward-target-field">
                    <input class="tds-input" type="number" name="dailyRewardBonusCap" inputmode="numeric" min="0" max="999999999" step="1000" value="${Math.max(0, Math.round(Number(rewardSavings.dailyReward.bonusCap) || 0))}">
                    <span aria-hidden="true">P</span>
                  </div>
                </label>
                <label>
                  <span>쉬어가기권</span>
                  <div class="reward-target-field">
                    <input class="tds-input" type="number" name="dailyRewardFreezeCount" inputmode="numeric" min="0" max="12" step="1" value="${Math.max(0, Math.round(Number(rewardSavings.dailyReward.freezeCount) || 0))}">
                    <span aria-hidden="true">장</span>
                  </div>
                </label>
              </div>
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
        <div class="settings-row"><div class="l"><div class="ico">ⓘ</div><div><div class="name">버전</div><div class="desc">v2.1.3 · Android APK</div></div></div><div class="r">›</div></div>
        <a class="settings-row as-button apk-download-row" href="./downloads/budget.apk?v=20260704-widget-graph-fill-v14" download="tomato-budget.apk">
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
  rewardForm?.addEventListener('click', (event) => {
    const actionTarget = event.target?.closest?.('[data-reward-point-action]');
    if (!actionTarget || !rewardForm.contains(actionTarget)) return;
    event.preventDefault();
    if (actionTarget.dataset.rewardPointAction === 'add') {
      appendRewardPointRow(rewardForm);
      return;
    }
    if (actionTarget.dataset.rewardPointAction === 'delete') {
      const row = actionTarget.closest('[data-reward-point-row]');
      const list = row?.closest('[data-reward-point-list]');
      row?.remove();
      if (list && !list.querySelector('[data-reward-point-row]')) {
        list.innerHTML = '<div class="reward-point-empty" data-reward-point-empty>포인트 항목이 없습니다.</div>';
      }
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
      const message = androidFlushResultText(result);
      showToast(message, 2200, result.failed ? 'error' : (result.saved || result.duplicate ? 'success' : 'info'));
      setTimeout(renderSettings, 300);
    } catch (err) {
      showToast(err.message || '알림 반영 실패', 2200, 'error');
    }
  });

  $('#android-sms-permission')?.addEventListener('click', () => {
    const bridge = androidBridge();
    if (!bridge?.requestSmsReadPermission) {
      showToast('Android APK에서만 요청할 수 있어요.', 1800, 'error');
      return;
    }
    bridge.requestSmsReadPermission();
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
      smsReadPermissionGranted: false,
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
      smsReadPermissionGranted: !!parsed.smsReadPermissionGranted,
      queued: Number(parsed.queued) || 0,
      failed: Number(parsed.failed) || 0,
      saved: Number(parsed.saved) || 0,
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 8) : [],
    };
  } catch (err) {
    return {
      available: true,
      notificationAccessEnabled: false,
      smsReadPermissionGranted: false,
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
  const sms = status.available ? (status.smsReadPermissionGranted ? '문자 권한 켜짐' : '문자 권한 꺼짐') : '문자 권한 없음';
  const queue = `대기 ${status.queued || 0}건 · 저장 ${status.saved || 0}건${status.failed ? ` · 실패 ${status.failed}건` : ''}`;
  return `
    <div class="settings-row" style="display:block">
      <div class="settings-control-head">
        <div class="l">
          <div class="ico">🔔</div>
          <div>
            <div class="name">Android 알림/문자 수집</div>
            <div class="desc">${escHtml(access)} · ${escHtml(sms)} · ${escHtml(queue)}</div>
          </div>
        </div>
      </div>
      <div class="flex gap-sm" style="flex-wrap:wrap;margin-top:10px">
        <button class="tds-btn sm" id="android-open-notification-settings" type="button" ${disabled}>알림 접근 열기</button>
        <button class="tds-btn sm secondary" id="android-sms-permission" type="button" ${disabled}>문자 권한</button>
        <button class="tds-text-btn" id="android-capture-flush" type="button" ${disabled}>지금 반영</button>
      </div>
      <div class="desc" style="padding-top:8px">${status.available ? '결제 알림과 최근 문자함은 Android 기기 안의 로컬 큐에 먼저 쌓이고, 로그인된 앱이 열리면 거래로 저장됩니다.' : '웹 브라우저에서는 휴대폰 알림과 문자를 읽을 수 없습니다. APK에서 권한을 켜세요.'}</div>
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

function androidFlushResultText(result = {}) {
  if (result.skipped) return `반영 안 됨 · ${result.skipped}`;
  const scan = result.scan || {};
  const bits = [
    `스캔 ${Number(scan.scanned) || 0}건`,
    `큐 ${Number(result.listed) || 0}건`,
    `저장 ${Number(result.saved) || 0}건`,
    `중복 ${Number(result.duplicate) || 0}건`,
  ];
  if (Number(result.failed) || Number(scan.failed)) {
    bits.push(`실패 ${(Number(result.failed) || 0) + (Number(scan.failed) || 0)}건`);
  }
  if (scan.permissionGranted === false) bits.push('문자 권한 없음');
  if (Array.isArray(result.errors) && result.errors.length) bits.push(result.errors[0]);
  if (scan.error) bits.push(scan.error);
  return bits.join(' · ');
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
  const legacyRate = Number.isFinite(allocationRate) ? allocationRate : DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate;
  const pointItems = normalizeRewardPointItems(source.pointItems, source.pointRates, legacyRate);
  const pointRates = pointRatesFromItems(pointItems);
  return {
    ...DEFAULT_REWARD_SAVINGS_SETTINGS,
    ...source,
    enabled: source.enabled !== false && source.enabled !== 'false',
    lookbackDays: [90, 180, 365].includes(Number(source.lookbackDays)) ? Number(source.lookbackDays) : DEFAULT_REWARD_SAVINGS_SETTINGS.lookbackDays,
    allocationRate: pointRates.winePurchase ?? pointItems[0]?.rate ?? legacyRate,
    pointRates,
    pointItems,
    baselineMethod: ['trimmed_weekly', 'simple_daily'].includes(source.baselineMethod) ? source.baselineMethod : DEFAULT_REWARD_SAVINGS_SETTINGS.baselineMethod,
    dailyReward: normalizeDailyRewardSettings(source.dailyReward),
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

function normalizeRewardPointRates(value = {}, legacyWineRate = DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    winePurchase: normalizeRewardRate(source.winePurchase, legacyWineRate),
    premiumIngredients: normalizeRewardRate(source.premiumIngredients, DEFAULT_REWARD_SAVINGS_SETTINGS.pointRates.premiumIngredients),
    travelFund: normalizeRewardRate(source.travelFund, DEFAULT_REWARD_SAVINGS_SETTINGS.pointRates.travelFund),
  };
}

function normalizeDailyRewardSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_REWARD_SAVINGS_SETTINGS.dailyReward;
  return {
    enabled: source.enabled !== false && source.enabled !== 'false',
    selectedDateKey: normalizeRewardDateKey(source.selectedDateKey),
    selectedRuleId: String(source.selectedRuleId || '').trim().slice(0, 32),
    focusBucketKey: normalizeRewardFocusKey(source.focusBucketKey),
    bonusRate: normalizeRewardRate(source.bonusRate, defaults.bonusRate),
    bonusCap: normalizeRewardTargetAmount(source.bonusCap, defaults.bonusCap),
    freezeCount: clampRewardCount(source.freezeCount, 0, 12, defaults.freezeCount),
    streakDays: clampRewardCount(source.streakDays, 0, 999, defaults.streakDays),
    tierLabel: String(source.tierLabel || defaults.tierLabel).trim().slice(0, 24),
  };
}

function normalizeRewardRate(value, fallback) {
  const rate = normalizeAllocationRate(value);
  return Number.isFinite(rate) ? rate : fallback;
}

function readRewardSettingsForm(form) {
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
    lookbackDays: Number(fd.get('lookbackDays')),
    baselineMethod: fd.get('baselineMethod'),
    pointItems,
    dailyReward: {
      enabled: fd.get('dailyRewardEnabled') === 'on',
      selectedDateKey: fd.get('dailyRewardSelectedDateKey'),
      selectedRuleId: fd.get('dailyRewardSelectedRuleId'),
      focusBucketKey: fd.get('dailyRewardFocusBucketKey'),
      bonusRate: parsePercentInput(fd.get('dailyRewardBonusRate')) / 100,
      bonusCap: parseMoneyInput(fd.get('dailyRewardBonusCap')),
      freezeCount: parseCountInput(fd.get('dailyRewardFreezeCount'), 1),
      streakDays: parseCountInput(fd.get('dailyRewardStreakDays'), 0),
      tierLabel: fd.get('dailyRewardTierLabel') || '브론즈 1단계',
    },
  });
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

function formatRewardRatePct(value) {
  const pct = normalizeAllocationRate(value) * 100;
  if (!Number.isFinite(pct)) return '0';
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

function rewardPointItemFields(pointItems = []) {
  const items = Array.isArray(pointItems) ? pointItems : [];
  if (!items.length) {
    return '<div class="reward-point-empty" data-reward-point-empty>포인트 항목이 없습니다.</div>';
  }
  return items.map(rewardPointItemRow).join('');
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

function appendRewardPointRow(form) {
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
