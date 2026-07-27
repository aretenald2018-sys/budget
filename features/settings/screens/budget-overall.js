// ================================================================
// 설정 01 전체 예산 — 명시 저장(저장하기) 화면
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-01
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories, getProvisionFunds,
  listTransactions, aggregateByCategory,
} from '../../../data.js';
import { summarizeBudget, currentTarget } from '../budget-goals/index.js';
import { budgetModelDetailsHtml } from '../budget-explainer/view.js';
import { BUDGET_CYCLES, periodLabelForCycle } from '../../../domain/budget/model.js';
import { buildSafeToSpendSummary } from '../../../domain/funds/provision.js';
import { cycleRangeForDate } from '../../../utils/cycles.js';
import { fmtMonthKey, fmtMonthLabel, monthRange } from '../../../utils/format.js';
import { showToast } from '../../../utils/toast.js';
import {
  escHtml, fmtWon, radioHtml, progressHtml, sectionHtml,
  primaryButtonHtml, markDirtyOnChange, clearDirty, sortedExpenseCategories,
} from './shared.js';

// 홈 히어로와 같은 산식으로 이 화면의 숫자를 만든다(두 화면이 다른 값을 말하지 않게).
function breakdownFor(appSettings, categories, monthTxs, cycleTxs) {
  const monthKey = fmtMonthKey(new Date());
  const cycle = appSettings.budget.cycle;
  const mode = cycle === 'monthly' ? 'month' : 'cycle';
  const control = categories.filter(cat => (cat.budgetRhythm || 'spread') !== 'fixed');
  const fixed = categories.filter(cat => (cat.budgetRhythm || 'spread') === 'fixed');
  const byCat = aggregateByCategory(mode === 'cycle' ? cycleTxs : monthTxs);
  const byCatMonth = aggregateByCategory(monthTxs);
  const usedOf = (cat, rows) => Number(rows.find(row => row.name === cat.name)?.expense) || 0;
  const periodTarget = cat => {
    const monthly = currentTarget(cat, monthKey);
    if (mode !== 'cycle') return monthly;
    return (cat.budgetRhythm || 'spread') === 'front_loaded' ? monthly : Math.round(monthly / 2);
  };
  const budget = control.reduce((sum, cat) => sum + periodTarget(cat), 0);
  const spent = control.reduce((sum, cat) => sum + usedOf(cat, byCat), 0);
  const sts = buildSafeToSpendSummary({
    budgetTotal: budget,
    spentTotal: spent,
    funds: getProvisionFunds(),
    adjustments: [],
    mode,
    monthKey,
    cycleRange: cycleRangeForDate(new Date(), appSettings.biweeklyStartDate),
    controlCategoryNames: control.map(cat => cat.name),
    now: new Date(),
  });
  return {
    cycle,
    mode,
    budget,
    spent,
    provisions: sts.provisions,
    adjustments: sts.adjustments,
    amount: sts.amount,
    fixedMonthly: fixed.reduce((sum, cat) => sum + usedOf(cat, byCatMonth), 0),
  };
}

export const budgetOverallScreen = {
  id: 'settings-screen-budget',
  title: '전체 예산',

  async render() {
    const monthKey = fmtMonthKey(new Date());
    const { start, end } = monthRange(monthKey);
    const appSettings = await getAppSettings();
    const cycleRange = cycleRangeForDate(new Date(), appSettings.biweeklyStartDate);
    const [monthTxs, cycleTxs] = await Promise.all([
      listTransactions({ from: start, to: end, max: 1000 }).catch(() => []),
      listTransactions({ from: cycleRange.start, to: cycleRange.end, max: 1000 }).catch(() => []),
    ]);
    const budget = appSettings.budget;
    const categories = sortedExpenseCategories(getCategories());
    const summary = summarizeBudget(categories, monthKey);
    const targetsTotal = summary.total;
    const budgetAmount = budget.amount || targetsTotal;
    const bd = breakdownFor(appSettings, categories, monthTxs, cycleTxs);
    const periodLabel = periodLabelForCycle(budget.cycle);
    const spentPct = bd.budget > 0 ? Math.round((bd.spent / bd.budget) * 100) : 0;

    return `
      <div class="settings-screen-hero">
        <span>${escHtml(periodLabel)} 써도 되는 돈 · ${escHtml(fmtMonthLabel(monthKey))}</span>
        <strong class="${bd.amount < 0 ? 'neg' : ''}">${fmtWon(bd.amount)}</strong>
        <div class="settings-screen-hero-sub">
          <span>변동비 예산 ${fmtWon(bd.budget)}</span>
          <span>지출 ${fmtWon(bd.spent)}</span>
        </div>
        ${progressHtml(spentPct, spentPct >= 100 ? 'warning' : '')}
        <small>${spentPct}% 사용 · 홈 화면과 같은 숫자예요</small>
      </div>

      ${budgetModelDetailsHtml({
        cycle: bd.cycle,
        budget: bd.budget,
        provisions: bd.provisions,
        adjustments: bd.adjustments,
        spent: bd.spent,
        fixedMonthly: bd.fixedMonthly,
      }, { open: true })}

      ${sectionHtml('월 예산 금액', `
        <div class="settings-input-row">
          <input class="tds-input" inputmode="numeric" data-screen-field="amount"
            value="${budgetAmount ? Math.round(budgetAmount) : ''}" placeholder="${targetsTotal ? Math.round(targetsTotal) : '750000'}" aria-label="월 예산(원)">
          <span>원</span>
        </div>
        <button type="button" class="tds-text-btn" data-screen-action="load-recent">↺ 최근 예산 불러오기</button>
        <small class="settings-screen-note">
          홈의 '써도 되는 돈'은 이 금액이 아니라 <b>카테고리 목표의 합</b>(현재 ${fmtWon(targetsTotal)})으로 계산해요.
          여기 금액은 카테고리에 얼마나 배정했는지(미배정 ${fmtWon(Math.max(0, budgetAmount - targetsTotal))})를 재는 기준입니다.
        </small>
      `)}

      ${sectionHtml('예산 적용 주기', `
        <div class="settings-radio-group vertical">
          ${BUDGET_CYCLES.map(item => `
            <label class="settings-cycle-option ${budget.cycle === item.value ? 'active' : ''}">
              ${radioHtml('cycle', item.value, item.label, budget.cycle === item.value)}
              <small>${escHtml(item.hint)}</small>
            </label>
          `).join('')}
        </div>
        <div class="settings-input-row" data-cycle-detail="monthly" ${budget.cycle !== 'monthly' ? 'hidden' : ''}>
          <span>시작일</span>
          <select class="tds-select" data-screen-field="startDay" aria-label="매월 시작일">
            ${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${budget.startDay === i + 1 ? 'selected' : ''}>매월 ${i + 1}일</option>`).join('')}
          </select>
        </div>
        <div class="settings-input-row" data-cycle-detail="biweekly" ${budget.cycle === 'monthly' ? 'hidden' : ''}>
          <span>시작일</span>
          <input class="tds-input" type="date" data-screen-field="biweeklyStartDate" value="${escHtml(appSettings.biweeklyStartDate)}" aria-label="2주 사이클 시작일">
        </div>
        <small class="settings-screen-note">
          여기서 고른 주기가 <b>홈 화면의 기본 보기</b>이자 위젯이 쓰는 기간이에요.
          2주 시작일은 홈 상단의 기간 버튼과 같은 값입니다.
        </small>
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
        body.querySelectorAll('.settings-cycle-option').forEach(label => {
          label.classList.toggle('active', label.querySelector('input')?.checked);
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
      const cycle = checked('cycle') === 'monthly' ? 'monthly' : 'biweekly';
      // 2주 시작일은 홈 기간 버튼과 같은 필드(biweeklyStartDate)를 쓴다 — 예전처럼
      // budget.customStartDate 에 따로 저장하면 홈과 설정이 다른 날짜를 보게 된다.
      const biweeklyStartDate = String(field('biweeklyStartDate')?.value || '').trim();
      try {
        await saveAppSettings({
          budget: {
            amount,
            cycle,
            startDay: Number(field('startDay')?.value) || 1,
            customStartDate: '',
          },
          ...(cycle === 'biweekly' ? { biweeklyStartDate } : {}),
        });
        clearDirty(body);
        showToast('예산 설정을 저장했어요.', 1400, 'success');
        window.refreshCurrentTab?.();
        ctx.close();
      } catch (err) {
        showToast(err.message || '예산 저장 실패', 2400, 'error');
      }
    });
  },
};
