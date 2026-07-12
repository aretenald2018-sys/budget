// ================================================================
// render-settings.js — 설정 화면
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules, saveSharedPaymentRule, deleteSharedPaymentRule,
  saveCategoryMonthlyTarget, saveCategoryBudgetRhythm,
  getAppSettings, saveAppSettings,
} from './data.js?v=20260712-domain-rules-r2';
import { refreshRewardWidgetSnapshot } from './render-report.js?v=20260712-report-features&data=20260712-domain-rules-r2&feature=20260712-feature-modules';
import { fmtKRW, fmtMonthKey } from './utils/format.js?v=20260503-cache-no-store';
import { $, escHtml } from './utils/dom.js?v=20260503-cache-no-store';
import { showToast } from './utils/toast.js?v=20260503-cache-no-store';
import {
  DEFAULT_REWARD_SAVINGS_SETTINGS,
  appendRewardPointRow,
  formatRewardRatePct,
  normalizeRewardSettings,
  readRewardSettingsForm,
  rewardOption,
  rewardPointItemFields,
} from './features/settings/rewards/index.js?v=20260712-settings-features';
import {
  budgetGoalGroups,
  currentRhythm,
  summarizeBudget,
} from './features/settings/budget-goals/index.js?v=20260712-settings-features';
import { bindSettingsEvents } from './features/settings/events.js?v=20260712-settings-events';

let managedCategoryIds = [];

export async function renderSettings() {
  const root = $('#tab-settings');
  const user = getCurrentUser();
  const categories = getCategories();
  const budgetMonth = fmtMonthKey(new Date());
  const expenseCategories = categories
    .filter(c => c.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const [sharedRules, appSettings] = await Promise.all([
    user ? listSharedPaymentRules().catch(() => []) : Promise.resolve([]),
    getAppSettings().catch(() => ({
      theme: localStorage.getItem('budget.theme') || 'dark',
      homeManagedCategoryIds: [],
      rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS,
    })),
  ]);
  const rewardSavings = normalizeRewardSettings(appSettings.rewardSavings);
  const androidCapture = readAndroidCaptureStatus();
  const budgetSummary = summarizeBudget(expenseCategories, budgetMonth);
  managedCategoryIds = Array.isArray(appSettings.homeManagedCategoryIds) ? appSettings.homeManagedCategoryIds : [];

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
        <button type="button" class="tds-text-btn" data-settings-action="sign-out">로그아웃</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">예산 & 카테고리</div>
      <div class="budget-settings-shell">
        <div class="budget-summary-card">
          <div class="settings-control-head">
            <div class="l"><div class="ico">📊</div><div><div class="name">월 예산</div><div class="desc">${budgetMonth} · 카테고리 ${budgetSummary.categoryCount}개</div></div></div>
            <button class="tds-text-btn" type="button" data-category-add>+ 추가</button>
          </div>
          <div class="budget-summary-metrics" aria-label="이번 달 예산 요약">
            <div><span>총 예산</span><strong>${fmtKRW(budgetSummary.total)}</strong></div>
            <div><span>고정비</span><strong>${fmtKRW(budgetSummary.fixed)}</strong></div>
            <div><span>변동비</span><strong>${fmtKRW(budgetSummary.flexible)}</strong></div>
          </div>
        </div>
        <div class="budget-settings-card">
          <div class="budget-settings-card-head">
            <div>
              <strong>카테고리 월 예산</strong>
              <span>금액은 만원 단위 · 비용 성격은 홈 소비 페이스에 반영</span>
            </div>
            <span class="budget-settings-card-count">${budgetSummary.categoryCount}개</span>
          </div>
          <div class="budget-goal-list">
            ${budgetGoalGroups(expenseCategories, budgetMonth)}
          </div>
        </div>
        <div class="budget-home-card">
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
        <button type="button" class="settings-row as-button" data-settings-action="navigate" data-tab="review">
          <div class="l"><div class="ico">▣</div><div><div class="name">검토 대기</div><div class="desc">미분류·자동분류 실패 거래를 한 번에 확인</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" data-settings-action="navigate" data-tab="settle">
          <div class="l"><div class="ico">↔</div><div><div class="name">정산 흐름</div><div class="desc">받을 돈·줄 돈을 상대별로 점검</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" data-settings-action="navigate" data-tab="report">
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
        <div class="settings-row"><div class="l"><div class="ico">ⓘ</div><div><div class="name">버전</div><div class="desc">v2.2.1 · Android APK</div></div></div><div class="r">›</div></div>
        <a class="settings-row as-button apk-download-row" href="./downloads/budget.apk?v=20260711-budget-boundary-r2" download="tomato-budget.apk">
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

  bindSettingsEvents(root, handleSettingsAction);
  bindBudgetGoalControls(budgetMonth);
  bindSharedRuleControls();
  bindAppSettingControls();
}

function handleSettingsAction(action, target) {
  document.dispatchEvent(new CustomEvent('budget:app-action', {
    detail: action === 'navigate'
      ? { action, tab: target.dataset.tab }
      : { action },
  }));
}

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
  document.querySelector('[data-category-add]')?.addEventListener('click', () => {
    window.openCategoryModal?.();
  });
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
      const current = new Set(managedCategoryIds);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      const homeManagedCategoryIds = Array.from(current).slice(0, 8);
      try {
        managedCategoryIds = homeManagedCategoryIds;
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
      await refreshRewardWidgetSnapshot();
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
      await refreshRewardWidgetSnapshot();
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
  document.querySelectorAll('[data-category-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.openCategoryModal?.(btn.dataset.categoryEditId);
    });
  });
}
