// ================================================================
// render-settings.js — 설정 화면 (미니멀 허브 재설계)
// 최상위는 한 줄 행/요약 카드만. 세부 폼은 모달 drill-in.
// 계약: docs/ai/contracts/settings.contract.md §0/§2
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules,
  getAppSettings,
  getProvisionFunds,
} from './data.js';
import { fundSettingsSection } from './features/settings/funds/index.js';
import { refreshRewardWidgetSnapshot } from './render-report.js';
import { fmtKRW, fmtMonthKey, fmtMonthLabel } from './utils/format.js';
import { $, escHtml } from './utils/dom.js';
import {
  budgetGoalGroups,
  currentRhythm,
  summarizeBudget,
} from './features/settings/budget-goals/index.js';
import { settingsState as STATE } from './features/settings/state.js';
import { bindSettingsController } from './features/settings/controller.js';

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
    })),
  ]);
  const budgetSummary = summarizeBudget(expenseCategories, budgetMonth);
  const funds = getProvisionFunds();
  const activeFunds = funds.filter(fund => fund.active);
  const fundMonthlyTotal = activeFunds.reduce((sum, fund) => sum + (Number(fund.monthlyProvision) || 0), 0);
  const managedFlexible = expenseCategories.filter(cat => currentRhythm(cat) !== 'fixed');
  STATE.managedCategoryIds = Array.isArray(appSettings.homeManagedCategoryIds) ? appSettings.homeManagedCategoryIds : [];
  const managedCount = STATE.managedCategoryIds.length;

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
      <div class="budget-summary-card">
        <div class="settings-control-head">
          <div class="l"><div class="ico">📊</div><div><div class="name">월 예산</div><div class="desc">${fmtMonthLabel(budgetMonth)} · 카테고리 ${budgetSummary.categoryCount}개</div></div></div>
        </div>
        <div class="budget-summary-metrics" aria-label="이번 달 예산 요약">
          <div><span>총 예산</span><strong>${fmtKRW(budgetSummary.total)}</strong></div>
          <div><span>고정비</span><strong>${fmtKRW(budgetSummary.fixed)}</strong></div>
          <div><span>변동비</span><strong>${fmtKRW(budgetSummary.flexible)}</strong></div>
        </div>
      </div>
      <div class="settings-card">
        <button type="button" class="settings-row as-button" data-open-settings-modal="settings-budget-modal">
          <div class="l"><div class="ico">🗂️</div><div><div class="name">카테고리 예산 관리</div><div class="desc">카테고리별 월 예산·비용 성격 편집</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" data-open-settings-modal="settings-home-managed-modal">
          <div class="l"><div class="ico">🏠</div><div><div class="name">홈 관리 카테고리</div><div class="desc">${managedCount ? `${managedCount}개 선택됨` : '홈에 보여줄 카테고리 고르기'}</div></div></div>
          <span class="arrow">›</span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">충당금</div>
      <div class="settings-card">
        <button type="button" class="settings-row as-button" data-open-settings-modal="settings-funds-modal">
          <div class="l"><div class="ico">🧰</div><div><div class="name">충당금 관리</div><div class="desc">${activeFunds.length ? `${activeFunds.length}개 · 월 적립 ${fmtKRW(fundMonthlyTotal)}` : '비정기 지출 주머니 만들기'}</div></div></div>
          <span class="arrow">›</span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">표시</div>
      <div class="settings-card">
        <div class="settings-row" style="display:block">
          <div class="l"><div class="ico">◐</div><div><div class="name">테마</div><div class="desc">라이트/다크/시스템 모드</div></div></div>
          <div class="tds-segmented settings-theme-segment" id="settings-theme-segment">
            ${themeOption('light', '라이트', appSettings.theme)}
            ${themeOption('dark', '다크', appSettings.theme)}
            ${themeOption('system', '시스템', appSettings.theme)}
          </div>
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
        <button type="button" class="settings-row as-button" data-open-settings-modal="settings-rules-modal">
          <div class="l"><div class="ico">⚖️</div><div><div class="name">정산 규칙</div><div class="desc">${sharedRules.length}건 자동 매칭</div></div></div>
          <span class="arrow">›</span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">앱 정보</div>
      <div class="settings-card">
        <div class="settings-row"><div class="l"><div class="ico">ⓘ</div><div><div class="name">버전</div><div class="desc">v2.4.3 · Android APK</div></div></div><div class="r">›</div></div>
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

    ${settingsDrillModal('settings-budget-modal', '카테고리 예산 관리', `
      <div class="budget-settings-card">
        <div class="budget-settings-card-head">
          <div>
            <strong>카테고리 월 예산</strong>
            <span>금액은 만원 단위 · 비용 성격은 홈 소비 페이스에 반영</span>
          </div>
          <button class="tds-text-btn" type="button" data-category-add>+ 추가</button>
        </div>
        <div class="budget-goal-list">
          ${budgetGoalGroups(expenseCategories, budgetMonth)}
        </div>
      </div>
    `)}

    ${settingsDrillModal('settings-home-managed-modal', '홈 관리 카테고리', `
      <div class="budget-home-card">
        <div class="settings-control-head">
          <div>
            <div class="name">홈 관리 카테고리</div>
            <div class="desc">홈에는 고른 항목만 횟수/금액으로 나눠 보여줍니다.</div>
          </div>
        </div>
        <div class="home-managed-picker">
          ${homeManagedCategoryOptions(managedFlexible, appSettings.homeManagedCategoryIds || [])}
        </div>
      </div>
    `)}

    ${settingsDrillModal('settings-funds-modal', '충당금 관리', fundSettingsSection(funds))}

    ${settingsDrillModal('settings-rules-modal', '정산 규칙', `
      <div class="settings-card">
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
    `)}
  `;

  bindSettingsController(root, budgetMonth, { renderSettings, refreshRewardWidgetSnapshot });
}

function settingsDrillModal(id, title, bodyHtml) {
  return `
    <div class="tds-modal-overlay settings-drill-overlay" id="${id}" role="dialog" aria-modal="true">
      <div class="tds-modal-sheet">
        <div class="tds-modal-handle"></div>
        <div class="tds-modal-content" style="text-align:left">
          <div class="settings-drill-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div class="tds-modal-title">${escHtml(title)}</div>
            <button type="button" class="tds-text-btn" data-close-settings-modal aria-label="닫기">닫기</button>
          </div>
          ${bodyHtml}
        </div>
      </div>
    </div>
  `;
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
