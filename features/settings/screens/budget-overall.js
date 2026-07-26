// ================================================================
// 설정 01 전체 예산 — 명시 저장(저장하기) 화면
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-01
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories,
  listTransactions, aggregateMonthlyTotals,
} from '../../../data.js';
import { summarizeBudget } from '../budget-goals/index.js';
import { fmtMonthKey, fmtMonthLabel, monthRange } from '../../../utils/format.js';
import {
  cycleDateRangeText,
  cycleRangeForDate,
  normalizeCycleAnchorDate,
} from '../../../utils/cycles.js';
import {
  MAX_CUSTOM_DAYS,
  MIN_CUSTOM_DAYS,
  normalizeBudgetCycle,
  normalizeCustomDays,
  prorateMonthlyToCycle,
  resolveBudgetPeriod,
} from '../../../domain/budget/period.js';
import { showToast } from '../../../utils/toast.js';
import {
  escHtml, fmtWon, switchHtml, radioHtml, progressHtml, sectionHtml,
  primaryButtonHtml, markDirtyOnChange, clearDirty, sortedExpenseCategories,
} from './shared.js';

export const budgetOverallScreen = {
  id: 'settings-screen-budget',
  title: '전체 예산',

  async render() {
    const monthKey = fmtMonthKey(new Date());
    const appSettings = await getAppSettings();
    const budget = appSettings.budget;
    // 홈 탭과 같은 기간 정의를 쓴다 — 기간 판단은 전부 domain/budget/period.js.
    const period = resolveBudgetPeriod(budget);
    const anchorDate = normalizeCycleAnchorDate(appSettings.biweeklyStartDate);
    const cycleRange = cycleRangeForDate(new Date(), anchorDate, period.cycleDays);
    const { start, end } = period.mode === 'month' ? monthRange(monthKey) : cycleRange;
    const periodTxs = await listTransactions({ from: start, to: end, max: 1000 }).catch(() => []);

    const monthTargetsTotal = summarizeBudget(sortedExpenseCategories(getCategories()), monthKey).total;
    // 예산 금액은 '한 주기' 기준이라, 카테고리 월 목표 합계도 같은 주기로 안분해 기본값을 만든다.
    const targetsTotal = period.mode === 'month'
      ? monthTargetsTotal
      : prorateMonthlyToCycle(monthTargetsTotal, period.cycleDays);
    const budgetAmount = budget.amount || targetsTotal;
    const spent = aggregateMonthlyTotals(periodTxs).expense;
    const remaining = budgetAmount - spent;
    const pct = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0;
    const alerts = appSettings.budgetAlerts.total;
    const rangeText = period.mode === 'month' ? fmtMonthLabel(monthKey) : cycleDateRangeText(cycleRange);
    const anchorValue = anchorDate || formatDateInput(cycleRange.start);

    return `
      <div class="settings-screen-hero">
        <span>${escHtml(period.periodLabel)} 예산 · ${escHtml(rangeText)}</span>
        <strong>${fmtWon(budgetAmount)}</strong>
        <div class="settings-screen-hero-sub">
          <span>지출 ${fmtWon(spent)}</span>
          <span class="${remaining < 0 ? 'neg' : 'pos'}">남은 예산 ${fmtWon(remaining)}</span>
        </div>
        ${progressHtml(pct, pct >= 100 ? 'warning' : '')}
        <small>${pct}% 사용</small>
      </div>

      ${sectionHtml(`예산 금액 (${escHtml(period.mode === 'month' ? '한 달' : period.unitLabel)} 기준)`, `
        <div class="settings-input-row">
          <input class="tds-input" inputmode="numeric" data-screen-field="amount"
            value="${budgetAmount ? Math.round(budgetAmount) : ''}" placeholder="${targetsTotal ? Math.round(targetsTotal) : '750000'}" aria-label="전체 예산(원)">
          <span>원</span>
        </div>
        <button type="button" class="tds-text-btn" data-screen-action="load-recent">↺ 최근 예산 불러오기</button>
      `)}

      ${sectionHtml('예산 적용 주기', `
        <div class="settings-radio-group">
          ${radioHtml('cycle', 'biweekly', '2주', period.cycle === 'biweekly')}
          ${radioHtml('cycle', 'weekly', '1주', period.cycle === 'weekly')}
          ${radioHtml('cycle', 'monthly', '매월', period.cycle === 'monthly')}
          ${radioHtml('cycle', 'custom', '직접 설정', period.cycle === 'custom')}
        </div>
        <div class="settings-input-row" data-cycle-detail="custom" ${period.cycle !== 'custom' ? 'hidden' : ''}>
          <span>주기 일수</span>
          <input class="tds-input" type="number" min="${MIN_CUSTOM_DAYS}" max="${MAX_CUSTOM_DAYS}" data-screen-field="customDays" value="${period.customDays}" aria-label="주기 일수">
          <span>일</span>
        </div>
        <div class="settings-input-row" data-cycle-detail="anchor" ${period.mode === 'month' ? 'hidden' : ''}>
          <span>주기 시작일</span>
          <input class="tds-input" type="date" data-screen-field="cycleStartDate" value="${escHtml(anchorValue)}" aria-label="주기 시작일">
        </div>
        <p class="settings-screen-note">홈 탭 기간(${escHtml(period.periodLabel)})과 같은 설정이에요. 매월은 달력 월 기준입니다.</p>
      `)}

      ${sectionHtml('남은 예산 처리', `
        <div class="settings-radio-group vertical">
          ${radioHtml('rollover', 'carryover', '다음 기간으로 이월', budget.rollover === 'carryover')}
          ${radioHtml('rollover', 'reset', '기간 종료 시 초기화', budget.rollover === 'reset')}
          ${radioHtml('rollover', 'deduct_over', '초과 금액만 차감', budget.rollover === 'deduct_over')}
        </div>
      `)}

      ${sectionHtml('예산 안내 기준', `
        <div class="settings-toggle-list">
          <div class="settings-toggle-row"><span>70% 사용 시 안내</span>${switchHtml('warn70', alerts.warn70)}</div>
          <div class="settings-toggle-row"><span>90% 사용 시 안내</span>${switchHtml('warn90', alerts.warn90)}</div>
          <div class="settings-toggle-row"><span>초과 시 안내</span>${switchHtml('over', alerts.over)}</div>
        </div>
      `)}

      ${primaryButtonHtml('save', '저장하기')}
    `;
  },

  bind(body, ctx) {
    markDirtyOnChange(body);

    body.querySelectorAll('[data-screen-field="cycle"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const cycle = normalizeBudgetCycle(body.querySelector('[data-screen-field="cycle"]:checked')?.value);
        body.querySelectorAll('[data-cycle-detail]').forEach(el => {
          // 시작일(anchor)은 매월을 제외한 모든 주기에 필요하고, 일수 입력은 '직접 설정' 전용이다.
          el.hidden = el.dataset.cycleDetail === 'anchor'
            ? cycle === 'monthly'
            : el.dataset.cycleDetail !== cycle;
        });
      });
    });

    body.querySelector('[data-screen-action="load-recent"]')?.addEventListener('click', async () => {
      const prev = new Date();
      prev.setMonth(prev.getMonth() - 1);
      const prevKey = fmtMonthKey(prev);
      const appSettings = await getAppSettings();
      const prevTotal = appSettings.budget.amount
        || summarizeBudget(sortedExpenseCategories(getCategories()), prevKey).total;
      if (!prevTotal) {
        showToast('불러올 최근 예산이 없어요.', 1600, 'info');
        return;
      }
      const input = body.querySelector('[data-screen-field="amount"]');
      input.value = Math.round(prevTotal);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      showToast(`${fmtMonthLabel(prevKey)} 예산을 불러왔어요.`, 1400, 'success');
    });

    body.querySelector('[data-screen-action="save"]')?.addEventListener('click', async () => {
      const field = name => body.querySelector(`[data-screen-field="${name}"]`);
      const checked = name => body.querySelector(`[data-screen-field="${name}"]:checked`)?.value;
      const amount = Math.max(0, Math.round(Number(String(field('amount')?.value || '').replace(/[^\d]/g, '')) || 0));
      const cycle = normalizeBudgetCycle(checked('cycle'));
      const customDays = normalizeCustomDays(field('customDays')?.value);
      // 주기 시작일은 홈 탭과 공유하는 앵커(appSettings.biweeklyStartDate) 하나뿐이다.
      const cycleStartDate = normalizeCycleAnchorDate(field('cycleStartDate')?.value);
      if (cycle !== 'monthly' && !cycleStartDate) {
        showToast('주기 시작일을 선택하세요.', 1800, 'warning');
        return;
      }
      try {
        const current = await getAppSettings();
        await saveAppSettings({
          ...(cycleStartDate ? { biweeklyStartDate: cycleStartDate } : {}),
          budget: {
            amount,
            cycle,
            cycleUnit: cycle === 'monthly' ? current.budget.cycleUnit : cycle,
            customDays,
            rollover: checked('rollover') || 'reset',
          },
          budgetAlerts: {
            ...current.budgetAlerts,
            total: {
              warn70: !!field('warn70')?.checked,
              warn90: !!field('warn90')?.checked,
              over: !!field('over')?.checked,
            },
          },
        });
        clearDirty(body);
        showToast('전체 예산을 저장했어요.', 1400, 'success');
        ctx.close();
      } catch (err) {
        showToast(err.message || '예산 저장 실패', 2400, 'error');
      }
    });
  },
};

function formatDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
