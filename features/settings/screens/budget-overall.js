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
    const { start, end } = monthRange(monthKey);
    const [appSettings, monthTxs] = await Promise.all([
      getAppSettings(),
      listTransactions({ from: start, to: end, max: 1000 }).catch(() => []),
    ]);
    const budget = appSettings.budget;
    const targetsTotal = summarizeBudget(sortedExpenseCategories(getCategories()), monthKey).total;
    const budgetAmount = budget.amount || targetsTotal;
    const spent = aggregateMonthlyTotals(monthTxs).expense;
    const remaining = budgetAmount - spent;
    const pct = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0;
    const alerts = appSettings.budgetAlerts.total;

    return `
      <div class="settings-screen-hero">
        <span>이번 달 예산 · ${escHtml(fmtMonthLabel(monthKey))}</span>
        <strong>${fmtWon(budgetAmount)}</strong>
        <div class="settings-screen-hero-sub">
          <span>지출 ${fmtWon(spent)}</span>
          <span class="${remaining < 0 ? 'neg' : 'pos'}">남은 예산 ${fmtWon(remaining)}</span>
        </div>
        ${progressHtml(pct, pct >= 100 ? 'warning' : '')}
        <small>${pct}% 사용</small>
      </div>

      ${sectionHtml('예산 금액', `
        <div class="settings-input-row">
          <input class="tds-input" inputmode="numeric" data-screen-field="amount"
            value="${budgetAmount ? Math.round(budgetAmount) : ''}" placeholder="${targetsTotal ? Math.round(targetsTotal) : '750000'}" aria-label="전체 예산(원)">
          <span>원</span>
        </div>
        <button type="button" class="tds-text-btn" data-screen-action="load-recent">↺ 최근 예산 불러오기</button>
      `)}

      ${sectionHtml('예산 적용 주기', `
        <div class="settings-radio-group">
          ${radioHtml('cycle', 'monthly', '매월', budget.cycle === 'monthly')}
          ${radioHtml('cycle', 'weekly', '매주', budget.cycle === 'weekly')}
          ${radioHtml('cycle', 'custom', '직접 설정', budget.cycle === 'custom')}
        </div>
        <div class="settings-input-row" data-cycle-detail="monthly" ${budget.cycle !== 'monthly' ? 'hidden' : ''}>
          <span>시작일</span>
          <select class="tds-select" data-screen-field="startDay" aria-label="시작일">
            ${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${budget.startDay === i + 1 ? 'selected' : ''}>매월 ${i + 1}일</option>`).join('')}
          </select>
        </div>
        <div class="settings-input-row" data-cycle-detail="custom" ${budget.cycle !== 'custom' ? 'hidden' : ''}>
          <span>시작일</span>
          <input class="tds-input" type="date" data-screen-field="customStartDate" value="${escHtml(budget.customStartDate)}" aria-label="직접 설정 시작일">
        </div>
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
        const cycle = body.querySelector('[data-screen-field="cycle"]:checked')?.value;
        body.querySelectorAll('[data-cycle-detail]').forEach(el => {
          el.hidden = el.dataset.cycleDetail !== cycle;
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
      try {
        const current = await getAppSettings();
        await saveAppSettings({
          budget: {
            amount,
            cycle: checked('cycle') || 'monthly',
            startDay: Number(field('startDay')?.value) || 1,
            customStartDate: field('customStartDate')?.value || '',
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
