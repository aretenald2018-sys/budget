// ================================================================
// render-settings.js — 설정 화면 (10항목 허브)
// 설정 홈 = 4그룹 10항목 + 기타(목업 외 잔존 기능) 행 목록.
// 각 항목 화면은 drill-in 모달에서 lazy render (features/settings/screens/).
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules,
  getAppSettings,
  getProvisionFunds,
} from './data.js';
import { fundSettingsSection } from './features/settings/funds/index.js';
import { refreshRewardWidgetSnapshot } from './render-report.js';
import { fmtKRW, fmtMonthKey } from './utils/format.js';
import { $, escHtml } from './utils/dom.js';
import { summarizeBudget } from './features/settings/budget-goals/index.js';
import { SETTINGS_SCREEN_LIST } from './features/settings/screens/index.js';
import { settingsState as STATE } from './features/settings/state.js';
import { bindSettingsController } from './features/settings/controller.js';

const SCREEN_ROWS = [
  {
    group: '예산 & 목표 관리',
    items: [
      { id: 'settings-screen-budget', ico: '💰', name: '전체 예산', desc: settings => settings._budgetDesc },
      { id: 'settings-screen-category-goals', ico: '🎯', name: '카테고리 목표', desc: settings => settings._goalsDesc },
      { id: 'settings-screen-limits', ico: '📊', name: '지출 한도 설정', desc: settings => `주의 ${settings.budgetAlerts.categoryDefault.warn}% · 경고 ${settings.budgetAlerts.categoryDefault.alert}% · 초과 ${settings.budgetAlerts.categoryDefault.over}%` },
      { id: 'settings-screen-goal-edit', ico: '✏️', name: '목표 편집', desc: settings => settings._goalEditDesc },
      { id: 'settings-screen-points', ico: '⭐', name: '포인트 / 미션', desc: settings => `${settings.missions.autoJoin ? '자동 참여 켬' : '자동 참여 끔'} · 난이도 ${settings.missions.difficulty === 'high' ? '높음' : '보통'}` },
    ],
  },
  {
    group: '분석 & 인사이트',
    items: [
      { id: 'settings-screen-weekly', ico: '📈', name: '주간 리포트', desc: () => '주간 요약·카테고리 분석·하이라이트' },
      { id: 'settings-screen-home-cards', ico: '🏠', name: '홈 화면 구성', desc: settings => settings._homeCardsDesc },
    ],
  },
  {
    group: '자동화 & 분류',
    items: [
      { id: 'settings-screen-classify', ico: '🏷️', name: '자동 분류', desc: settings => `${settings.autoClassify.enabled ? '사용 중' : '꺼짐'} · 규칙 ${settings.autoClassify.rules.length}개` },
    ],
  },
  {
    group: '데이터 관리',
    items: [
      { id: 'settings-screen-backup', ico: '☁️', name: '데이터 백업/복원', desc: settings => settings.backup.lastBackupAt ? `마지막 백업 ${settings.backup.lastBackupAt}` : '아직 백업이 없어요' },
      { id: 'settings-screen-export', ico: '📤', name: '데이터 내보내기', desc: () => 'CSV · Excel · PDF로 내보내기' },
    ],
  },
];

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
    getAppSettings().catch(() => null),
  ]);
  const settings = appSettings || fallbackSettings();
  const budgetSummary = summarizeBudget(expenseCategories, budgetMonth);
  const funds = getProvisionFunds();
  const activeFunds = funds.filter(fund => fund.active);
  const fundMonthlyTotal = activeFunds.reduce((sum, fund) => sum + (Number(fund.monthlyProvision) || 0), 0);
  STATE.managedCategoryIds = Array.isArray(settings.homeManagedCategoryIds) ? settings.homeManagedCategoryIds : [];

  // 허브 행 요약 텍스트
  const budgetAmount = settings.budget?.amount || budgetSummary.total;
  settings._budgetDesc = budgetAmount ? `이번 달 ${fmtKRW(budgetAmount)} · ${cycleLabel(settings.budget?.cycle)}` : '예산을 설정해보세요';
  settings._goalsDesc = `배정 ${fmtKRW(budgetSummary.total)} · 카테고리 ${budgetSummary.categoryCount}개`;
  const autoManagedCount = expenseCategories.filter(cat => cat.autoManaged !== false).length;
  settings._goalEditDesc = `자동 관리 ${autoManagedCount}개 / 전체 ${expenseCategories.length}개`;
  const visibleCards = Array.isArray(settings.homeCards) && settings.homeCards.length
    ? settings.homeCards.filter(card => card.visible !== false).length
    : 6;
  settings._homeCardsDesc = `카드 ${visibleCards}개 표시 중`;

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

    ${SCREEN_ROWS.map(group => `
      <div class="settings-section">
        <div class="h">${escHtml(group.group)}</div>
        <div class="settings-card">
          ${group.items.map(item => `
            <button type="button" class="settings-row as-button" data-open-settings-modal="${item.id}">
              <div class="l"><div class="ico">${item.ico}</div><div><div class="name">${escHtml(item.name)}</div><div class="desc">${escHtml(item.desc(settings))}</div></div></div>
              <span class="arrow">›</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('')}

    <div class="settings-section">
      <div class="h">기타</div>
      <div class="settings-card">
        <div class="settings-row" style="display:block">
          <div class="l"><div class="ico">◐</div><div><div class="name">테마</div><div class="desc">라이트/다크/시스템 모드</div></div></div>
          <div class="tds-segmented settings-theme-segment" id="settings-theme-segment">
            ${themeOption('light', '라이트', settings.theme)}
            ${themeOption('dark', '다크', settings.theme)}
            ${themeOption('system', '시스템', settings.theme)}
          </div>
        </div>
        <button type="button" class="settings-row as-button" data-open-settings-modal="settings-funds-modal">
          <div class="l"><div class="ico">🧰</div><div><div class="name">충당금 관리</div><div class="desc">${activeFunds.length ? `${activeFunds.length}개 · 월 적립 ${fmtKRW(fundMonthlyTotal)}` : '비정기 지출 주머니 만들기'}</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" data-settings-action="navigate" data-tab="settle">
          <div class="l"><div class="ico">↔</div><div><div class="name">정산 흐름</div><div class="desc">받을 돈·줄 돈을 상대별로 점검</div></div></div>
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

    ${SETTINGS_SCREEN_LIST.map(screen => settingsDrillModal(screen.id, screen.title, '', { fullScreen: true })).join('')}

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

function settingsDrillModal(id, title, bodyHtml, opts = {}) {
  return `
    <div class="tds-modal-overlay settings-drill-overlay ${opts.fullScreen ? 'full-screen' : ''}" id="${id}" role="dialog" aria-modal="true">
      <div class="tds-modal-sheet">
        <div class="tds-modal-handle"></div>
        <div class="tds-modal-content" style="text-align:left">
          <div class="settings-drill-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div class="tds-modal-title">${escHtml(title)}</div>
            <button type="button" class="tds-text-btn" data-close-settings-modal aria-label="닫기">닫기</button>
          </div>
          ${opts.fullScreen ? `<div class="settings-screen-body" data-screen-body>${bodyHtml}</div>` : bodyHtml}
        </div>
      </div>
    </div>
  `;
}

function cycleLabel(cycle) {
  if (cycle === 'weekly') return '매주 적용';
  if (cycle === 'custom') return '직접 설정';
  return '매월 적용';
}

function themeOption(value, label, selected) {
  return `<button class="tds-segmented-item ${selected === value ? 'active' : ''}" type="button" data-theme-choice="${value}">${label}</button>`;
}

function fallbackSettings() {
  return {
    theme: localStorage.getItem('budget.theme') || 'dark',
    homeManagedCategoryIds: [],
    budget: { amount: 0, cycle: 'monthly' },
    budgetAlerts: { categoryDefault: { warn: 70, alert: 90, over: 100 } },
    missions: { autoJoin: true, difficulty: 'normal', items: [] },
    homeCards: [],
    autoClassify: { enabled: true, rules: [] },
    backup: { lastBackupAt: '' },
  };
}
