// ================================================================
// render-settings.js — 설정 화면
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules, saveSharedPaymentRule, deleteSharedPaymentRule,
  saveCategoryMonthlyTarget, saveCategoryBudgetRhythm,
  getAppSettings, saveAppSettings,
} from './data.js?v=20260702-reward-settings-system';
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
    browserFallbackParse: localStorage.getItem('budget.clientFallbackParseEnabled') === '1',
    homeManagedCategoryIds: [],
    rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS,
  }));
  const rewardSavings = normalizeRewardSettings(appSettings.rewardSavings);
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
              <label class="toggle-row">
                <input type="checkbox" name="enabled" ${rewardSavings.enabled ? 'checked' : ''}>
              </label>
            </div>
            <div class="reward-settings-grid">
              <label>
                <span>기준 기간</span>
                <select class="tds-input" name="lookbackDays">
                  ${rewardOption(90, '최근 3개월', rewardSavings.lookbackDays)}
                  ${rewardOption(180, '최근 6개월', rewardSavings.lookbackDays)}
                  ${rewardOption(365, '최근 1년', rewardSavings.lookbackDays)}
                </select>
              </label>
              <label>
                <span>기준선 방식</span>
                <select class="tds-input" name="baselineMethod">
                  ${rewardOption('trimmed_weekly', '주간 트림 평균', rewardSavings.baselineMethod)}
                  ${rewardOption('simple_daily', '단순 일평균', rewardSavings.baselineMethod)}
                </select>
              </label>
              <label>
                <span>적립 배분율</span>
                <div class="reward-range">
                  <input type="range" name="allocationRatePct" min="10" max="50" step="5" value="${Math.round(rewardSavings.allocationRate * 100)}">
                  <strong data-reward-rate-label>${Math.round(rewardSavings.allocationRate * 100)}%</strong>
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
        <div class="settings-row">
          <div class="l"><div class="ico">📱</div><div><div class="name">브라우저 보조 파싱</div><div class="desc">서버 동기화가 놓친 문자만 Gemini 프록시로 재파싱</div></div></div>
          <label class="toggle-row"><input type="checkbox" id="settings-fallback-parse" ${appSettings.browserFallbackParse ? 'checked' : ''}></label>
        </div>
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
        <div class="settings-row"><div class="l"><div class="ico">ⓘ</div><div><div class="name">버전</div><div class="desc">v2.0.0 · mockup-j/k 통합</div></div></div><div class="r">›</div></div>
        <a class="settings-row as-button apk-download-row" href="./downloads/budget.apk?v=20260506-apk-root" download="tomato-budget.apk">
          <div class="l">
            <div class="ico apk-download-ico"><img src="./android-apk.svg" alt=""></div>
            <div>
              <div class="name">Android APK 다운로드</div>
              <div class="desc">설치 가능한 Android 버전 내려받기</div>
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
  $('#settings-fallback-parse')?.addEventListener('change', async (e) => {
    const browserFallbackParse = !!e.currentTarget.checked;
    try {
      localStorage.setItem('budget.clientFallbackParseEnabled', browserFallbackParse ? '1' : '0');
      await saveAppSettings({ browserFallbackParse });
      showToast(browserFallbackParse ? '보조 파싱 자동 실행을 켰어요.' : '보조 파싱 자동 실행을 껐어요.', 1400, 'success');
    } catch (err) {
      showToast(err.message || '보조 파싱 설정 저장 실패', 2200, 'error');
      renderSettings();
    }
  });

  const rewardForm = $('#reward-settings-form');
  rewardForm?.querySelector('input[name="allocationRatePct"]')?.addEventListener('input', (event) => {
    const label = rewardForm.querySelector('[data-reward-rate-label]');
    if (label) label.textContent = `${Math.round(Number(event.currentTarget.value) || 0)}%`;
  });
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
  const allocationRate = Number(source.allocationRate);
  return {
    ...DEFAULT_REWARD_SAVINGS_SETTINGS,
    ...source,
    enabled: source.enabled !== false,
    lookbackDays: [90, 180, 365].includes(Number(source.lookbackDays)) ? Number(source.lookbackDays) : DEFAULT_REWARD_SAVINGS_SETTINGS.lookbackDays,
    allocationRate: Number.isFinite(allocationRate) ? Math.min(1, Math.max(0.05, allocationRate)) : DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate,
    dailyPointCap: Math.max(0, Math.round(Number(source.dailyPointCap) || DEFAULT_REWARD_SAVINGS_SETTINGS.dailyPointCap)),
    monthPointCap: Math.max(0, Math.round(Number(source.monthPointCap) || DEFAULT_REWARD_SAVINGS_SETTINGS.monthPointCap)),
    baselineMethod: ['trimmed_weekly', 'simple_daily'].includes(source.baselineMethod) ? source.baselineMethod : DEFAULT_REWARD_SAVINGS_SETTINGS.baselineMethod,
  };
}

function rewardOption(value, label, selected) {
  return `<option value="${escHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escHtml(label)}</option>`;
}

function readRewardSettingsForm(form) {
  const fd = new FormData(form);
  return normalizeRewardSettings({
    enabled: fd.get('enabled') === 'on',
    lookbackDays: Number(fd.get('lookbackDays')),
    baselineMethod: fd.get('baselineMethod'),
    allocationRate: (Number(fd.get('allocationRatePct')) || 30) / 100,
    dailyPointCap: parseKRWInput(fd.get('dailyPointCap')),
    monthPointCap: parseKRWInput(fd.get('monthPointCap')),
  });
}

function parseKRWInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
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
