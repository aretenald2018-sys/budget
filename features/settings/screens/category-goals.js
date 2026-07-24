// ================================================================
// 설정 02 카테고리 목표 — 행 단위 즉시 저장 화면
// 금액 데이터는 03 지출 한도와 동일한 monthlyTargets 를 공유한다.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-02
// ================================================================

import {
  getAppSettings, getCategories, saveCategoryMonthlyTarget,
  listTransactions, aggregateByCategory,
} from '../../../data.js';
import { summarizeBudget, currentTarget } from '../budget-goals/index.js';
import { allocateBudget } from '../../../domain/transactions/allocate.js';
import { fmtMonthKey, monthRange } from '../../../utils/format.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, fmtWon, sectionHtml, sortedExpenseCategories } from './shared.js';

export const categoryGoalsScreen = {
  id: 'settings-screen-category-goals',
  title: '카테고리 목표',

  async render() {
    const monthKey = fmtMonthKey(new Date());
    const { start, end } = monthRange(monthKey);
    const [appSettings, monthTxs] = await Promise.all([
      getAppSettings(),
      listTransactions({ from: start, to: end, max: 1000 }).catch(() => []),
    ]);
    const categories = sortedExpenseCategories(getCategories());
    const assigned = summarizeBudget(categories, monthKey).total;
    const totalBudget = appSettings.budget.amount || assigned;
    const unassigned = Math.max(0, totalBudget - assigned);
    const byCat = aggregateByCategory(monthTxs);
    const usedByName = Object.fromEntries(byCat.map(row => [row.name, row.expense]));

    return `
      <div class="settings-screen-metrics">
        <div><span>전체 예산</span><strong>${fmtWon(totalBudget)}</strong></div>
        <div><span>배정 합계</span><strong>${fmtWon(assigned)}</strong></div>
        <div><span>미배정</span><strong class="${unassigned ? 'pos' : ''}">${fmtWon(unassigned)}</strong></div>
      </div>

      ${sectionHtml('카테고리별 목표', `
        <div class="settings-goal-list">
          ${categories.map(cat => {
            const target = currentTarget(cat, monthKey);
            const used = usedByName[cat.name] || 0;
            const pct = target > 0 ? Math.min(999, Math.round((used / target) * 100)) : 0;
            return `
              <div class="settings-goal-row">
                <span class="settings-goal-emoji">${cat.emoji || '□'}</span>
                <div class="settings-goal-main">
                  <strong>${escHtml(cat.name)}</strong>
                  <small>사용 ${fmtWon(used)}</small>
                </div>
                <div class="settings-goal-amount">
                  <input class="tds-input" inputmode="numeric" data-goal-category-id="${escHtml(cat.id)}"
                    value="${target ? Math.round(target) : ''}" placeholder="0" aria-label="${escHtml(cat.name)} 월 목표(원)">
                  <span class="settings-goal-pct ${pct >= 100 ? 'neg' : ''}">${pct}%</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <button type="button" class="tds-text-btn" data-screen-action="add-category">+ 카테고리 추가</button>
      `, `<button type="button" class="tds-text-btn" data-screen-action="auto-allocate">자동 배분</button>`)}
    `;
  },

  bind(body, ctx) {
    const monthKey = fmtMonthKey(new Date());

    body.querySelectorAll('[data-goal-category-id]').forEach(input => {
      input.addEventListener('change', async () => {
        const amount = Math.max(0, Math.round(Number(String(input.value).replace(/[^\d]/g, '')) || 0));
        input.value = amount || '';
        try {
          await saveCategoryMonthlyTarget(input.dataset.goalCategoryId, monthKey, amount);
          showToast('목표를 저장했어요.', 1000, 'success');
          ctx.refresh();
          window.refreshCurrentTab?.();
        } catch (err) {
          showToast(err.message || '목표 저장 실패', 2400, 'error');
        }
      });
    });

    body.querySelector('[data-screen-action="add-category"]')?.addEventListener('click', () => {
      window.openCategoryModal?.();
    });

    body.querySelector('[data-screen-action="auto-allocate"]')?.addEventListener('click', async () => {
      const appSettings = await getAppSettings();
      const categories = sortedExpenseCategories(getCategories())
        .filter(cat => cat.autoManaged !== false);
      const assigned = summarizeBudget(categories, monthKey).total;
      const totalBudget = appSettings.budget.amount || assigned;
      if (!totalBudget) {
        showToast('먼저 전체 예산을 설정해주세요.', 2000, 'info');
        return;
      }
      const { start, end } = monthRange(monthKey);
      const monthTxs = await listTransactions({ from: start, to: end, max: 1000 }).catch(() => []);
      const usedByName = Object.fromEntries(aggregateByCategory(monthTxs).map(row => [row.name, row.expense]));
      const weights = categories.map(cat => ({
        id: cat.id,
        weight: usedByName[cat.name] || currentTarget(cat, monthKey) || 1,
      }));
      const allocation = allocateBudget(totalBudget, weights);
      if (!window.confirm(`전체 예산 ${fmtWon(totalBudget)}을 자동 관리 카테고리 ${categories.length}개에 최근 사용 비중대로 배분할까요? 기존 목표가 대체됩니다.`)) return;
      try {
        for (const cat of categories) {
          if (allocation[cat.id] != null) {
            await saveCategoryMonthlyTarget(cat.id, monthKey, allocation[cat.id]);
          }
        }
        showToast('자동 배분을 적용했어요.', 1400, 'success');
        ctx.refresh();
        window.refreshCurrentTab?.();
      } catch (err) {
        showToast(err.message || '자동 배분 실패', 2400, 'error');
      }
    });
  },
};
