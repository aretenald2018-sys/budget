// ================================================================
// render-settings.js — 설정 화면
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules,
  getAppSettings,
} from './data.js';
import { refreshRewardWidgetSnapshot } from './render-report.js';
import { fmtKRW, fmtMonthKey } from './utils/format.js';
import { $, escHtml } from './utils/dom.js';
import {
  DEFAULT_REWARD_SAVINGS_SETTINGS,
  formatRewardRatePct,
  normalizeRewardSettings,
  rewardOption,
  rewardPointItemFields,
} from './features/settings/rewards/index.js';
import {
  budgetGoalGroups,
  currentRhythm,
  summarizeBudget,
} from './features/settings/budget-goals/index.js';
import { settingsState as STATE } from './features/settings/state.js';
import { readAndroidCaptureStatus, androidCapturePanel } from './features/settings/android-capture.js';
import { bindSettingsController } from './features/settings/controller.js';
import {
  bindDaybirdSettingsPanel,
  daybirdSettingsPanel,
  loadDaybirdSettingsState,
} from './features/daybird/index.js';

export async function renderSettings() {
  const root = $('#tab-settings');
  const user = getCurrentUser();
  const categories = getCategories();
  const budgetMonth = fmtMonthKey(new Date());
  const expenseCategories = categories
    .filter(c => c.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const [sharedRules, appSettings, daybirdState] = await Promise.all([
    user ? listSharedPaymentRules().catch(() => []) : Promise.resolve([]),
    getAppSettings().catch(() => ({
      theme: localStorage.getItem('budget.theme') || 'dark',
      homeManagedCategoryIds: [],
      rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS,
    })),
    loadDaybirdSettingsState(),
  ]);
  const rewardSavings = normalizeRewardSettings(appSettings.rewardSavings);
  const androidCapture = readAndroidCaptureStatus();
  const budgetSummary = summarizeBudget(expenseCategories, budgetMonth);
  STATE.managedCategoryIds = Array.isArray(appSettings.homeManagedCategoryIds) ? appSettings.homeManagedCategoryIds : [];

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

    ${daybirdSettingsPanel(daybirdState)}

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
        <div class="settings-row"><div class="l"><div class="ico">ⓘ</div><div><div class="name">버전</div><div class="desc">v2.3.0 · Android APK</div></div></div><div class="r">›</div></div>
        <a class="settings-row as-button apk-download-row" href="./downloads/budget.apk" download="tomato-budget.apk">
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

  bindSettingsController(root, budgetMonth, { renderSettings, refreshRewardWidgetSnapshot });
  bindDaybirdSettingsPanel(root, { rerender: renderSettings });
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
