import { escHtml } from '../../../utils/dom.js';
import { fmtKRW } from '../../../utils/format.js';

export function budgetGoalGroups(categories, monthKey) {
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
          <span class="budget-goal-parent-name"><strong>${escHtml(parent)}</strong><small>${rows.length}개 항목</small></span>
          <span>${fmtKRW(total)}</span>
        </div>
        ${rows.map(cat => `
          <div class="budget-goal-row rhythm editable">
            <span class="budget-goal-label">${cat.emoji || ''} ${escHtml(cat.name)}</span>
            <span class="budget-goal-amount">
              <input class="tds-input budget-goal-input" data-category-id="${escHtml(cat.id)}" inputmode="numeric" aria-label="${escHtml(cat.name)} 월 예산 (만원)" value="${Math.round(currentTarget(cat, monthKey) / 10000)}">
              <small>만원</small>
            </span>
            <select class="tds-select budget-rhythm-select" data-rhythm-category-id="${escHtml(cat.id)}" aria-label="${escHtml(cat.name)} 비용 성격">
              ${['fixed', 'front_loaded', 'spread'].map(value => `<option value="${value}" ${currentRhythm(cat) === value ? 'selected' : ''}>${rhythmLabel(value)}</option>`).join('')}
            </select>
            <button type="button" class="tds-icon-btn sm budget-category-edit" data-category-edit-id="${escHtml(cat.id)}" title="카테고리 수정" aria-label="${escHtml(cat.name)} 수정">✎</button>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

export function summarizeBudget(categories, monthKey) {
  return (Array.isArray(categories) ? categories : []).reduce((summary, category) => {
    const amount = currentTarget(category, monthKey);
    summary.total += amount;
    if (currentRhythm(category) === 'fixed') summary.fixed += amount;
    else summary.flexible += amount;
    summary.categoryCount += 1;
    return summary;
  }, { total: 0, fixed: 0, flexible: 0, categoryCount: 0 });
}

export function currentTarget(cat, monthKey) {
  return Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0;
}

export function currentRhythm(cat) {
  return cat.budgetRhythm || 'spread';
}

export function rhythmLabel(value) {
  if (value === 'fixed') return '고정비';
  if (value === 'front_loaded') return '월초 집중';
  return '변동비';
}
