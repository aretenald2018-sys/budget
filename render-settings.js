// ================================================================
// render-settings.js — 설정 화면 (10항목 허브)
// 디자인 SSOT: 사용자 제공 설정 허브 목업 (2026-07-24)
//   - 그룹당 카드 1장(중첩 금지) + 보라 그룹 라벨
//   - 행: 보라 원형 라인 아이콘 + 제목/설명 + 셰브런, 컴팩트 높이
//   - 하단: 앱 버전 · 로그아웃(빨강)
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

// 통일 라인 아이콘 (stroke: currentColor — 보라 원형 배지 안에서 렌더)
const ICONS = {
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5"/><rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M16 12.5h3.5"/></svg>',
  pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 5.5v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10v-5L12 3Z"/><path d="M12 8.5v4"/><circle cx="12" cy="15.5" r=".4" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="13" height="15.5" rx="2.5"/><path d="m14.5 3.5 3.2 3.2L11 13.5l-3.8.8.8-3.8 6.5-7Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V9M12 20V4M19 20v-7"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7l9 9-7 7-9-9V4Z"/><circle cx="8.5" cy="8.5" r="1.2"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.4-9A5.5 5.5 0 0 1 17.3 10 4 4 0 0 1 17 18H7Z"/><path d="M12 14.5v-4M10 12.5l2-2 2 2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10M8.5 10.5 12 14l3.5-3.5"/><path d="M4.5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5Z"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4V8Z"/><path d="M3.5 8 12 12l8.5-4M12 12v8"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h11M15 4.5 18.5 8 15 11.5"/><path d="M17 16H6M9 12.5 5.5 16 9 19.5"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M5 7h14"/><path d="m5 7-2.5 5a2.8 2.8 0 0 0 5 0L5 7ZM19 7l-2.5 5a2.8 2.8 0 0 0 5 0L19 7Z"/><path d="M9 20h6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".5" fill="currentColor"/></svg>',
  android: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="12" height="9" rx="2"/><path d="M8 9a4 4 0 0 1 8 0M7.5 5.5 8.5 7M16.5 5.5 15.5 7"/><path d="M10 13.5h.01M14 13.5h.01"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14"/><path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
};

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

  const budgetAmount = settings.budget?.amount || budgetSummary.total;
  const autoManagedCount = expenseCategories.filter(cat => cat.autoManaged !== false).length;
  const visibleCards = Array.isArray(settings.homeCards) && settings.homeCards.length
    ? settings.homeCards.filter(card => card.visible !== false).length
    : 6;

  const drill = (id, icon, name, desc) => item({ icon, name, desc, attrs: `data-open-settings-modal="${id}"` });
  const nav = (tab, icon, name, desc) => item({ icon, name, desc, attrs: `data-settings-action="navigate" data-tab="${tab}"` });

  root.innerHTML = `
    <p class="settings-sub">앱 설정을 간단하게 관리해 보세요.</p>

    ${group('예산 및 지출 목표', [
      drill('settings-screen-budget', 'wallet', '전체 예산', budgetAmount ? `${fmtKRW(budgetAmount)} · ${cycleLabel(settings.budget?.cycle)}` : '월 예산, 리셋 주기'),
      drill('settings-screen-category-goals', 'pie', '카테고리 목표', `배정 ${fmtKRW(budgetSummary.total)} · ${budgetSummary.categoryCount}개`),
      drill('settings-screen-limits', 'shield', '지출 한도 설정', `주의 ${settings.budgetAlerts.categoryDefault.warn}% · 경고 ${settings.budgetAlerts.categoryDefault.alert}% · 초과 ${settings.budgetAlerts.categoryDefault.over}%`),
      drill('settings-screen-goal-edit', 'edit', '목표 편집', `목표 추가/수정 · 자동 관리 ${autoManagedCount}개`),
    ])}

    ${group('분석 및 절약 기능', [
      drill('settings-screen-points', 'star', '포인트/미션', `절약 포인트, 미션 · 난이도 ${settings.missions.difficulty === 'high' ? '높음' : '보통'}`),
      drill('settings-screen-weekly', 'chart', '주간 리포트', '지난주 소비 요약'),
    ])}

    ${group('개인화 및 데이터', [
      drill('settings-screen-home-cards', 'home', '홈 화면 구성', `카드 순서, 표시 정보 · ${visibleCards}개 표시`),
      drill('settings-screen-classify', 'tag', '자동 분류', `거래 카테고리 자동 분류 · 규칙 ${settings.autoClassify.rules.length}개`),
      drill('settings-screen-backup', 'cloud', '데이터 백업/복원', settings.backup.lastBackupAt ? `마지막 백업 ${settings.backup.lastBackupAt}` : '기기 변경 대비'),
      drill('settings-screen-export', 'download', '데이터 내보내기', 'CSV 또는 엑셀'),
    ])}

    ${group('기타', [
      item({
        icon: 'theme', name: '테마', desc: '라이트/다크/시스템',
        right: `
          <div class="tds-segmented settings-theme-segment" id="settings-theme-segment">
            ${themeOption('light', '라이트', settings.theme)}
            ${themeOption('dark', '다크', settings.theme)}
            ${themeOption('system', '시스템', settings.theme)}
          </div>
        `,
      }),
      drill('settings-funds-modal', 'box', '충당금 관리', activeFunds.length ? `${activeFunds.length}개 · 월 적립 ${fmtKRW(fundMonthlyTotal)}` : '비정기 지출 주머니'),
      nav('settle', 'swap', '정산 흐름', '받을 돈·줄 돈 점검'),
      drill('settings-rules-modal', 'scale', '정산 규칙', `${sharedRules.length}건 자동 매칭`),
    ])}

    <div class="settings-section settings-group settings-foot">
      ${item({ icon: 'info', name: '앱 버전', desc: 'v2.4.3 · Android APK', muted: true, chevron: false })}
      <a class="settings-item as-link" href="./downloads/budget.apk" download="tomato-budget.apk">
        <span class="settings-item-ico">${ICONS.android}</span>
        <span class="settings-item-main"><strong>Android APK 다운로드</strong><small>알림 수집용 APK 내려받기</small></span>
        <span class="settings-item-chevron">${ICONS.chevron}</span>
      </a>
      ${item({ icon: 'logout', name: '로그아웃', desc: user?.email || '', danger: true, chevron: false, attrs: 'data-settings-action="sign-out"' })}
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

function group(label, itemsHtml) {
  return `
    <div class="settings-section settings-group">
      <div class="settings-group-label">${escHtml(label)}</div>
      ${itemsHtml.join('')}
    </div>
  `;
}

// 허브 행 하나. attrs가 있으면 버튼(클릭 가능), 없으면 정적 행.
function item({ icon, name, desc = '', right = '', attrs = '', danger = false, muted = false, chevron = true }) {
  const inner = `
    <span class="settings-item-ico ${danger ? 'danger' : ''}">${ICONS[icon] || ''}</span>
    <span class="settings-item-main">
      <strong>${escHtml(name)}</strong>
      ${desc ? `<small>${escHtml(desc)}</small>` : ''}
    </span>
    ${right}
    ${chevron && !right ? `<span class="settings-item-chevron">${ICONS.chevron}</span>` : ''}
  `;
  const classes = `settings-item ${danger ? 'danger' : ''} ${muted ? 'muted' : ''}`;
  return attrs
    ? `<button type="button" class="${classes}" ${attrs}>${inner}</button>`
    : `<div class="${classes}">${inner}</div>`;
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
