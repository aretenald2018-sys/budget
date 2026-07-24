// ================================================================
// 설정 04 목표 편집 — 즉시 반영 화면
// 목표 = 02와 동일한 카테고리 집합. 이 화면은 자동 관리 토글·순서·편집만 담당.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-04
// ================================================================

import { getCategories, saveCategory, saveCategoryAutoManaged } from '../../../data.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, switchHtml, sortedExpenseCategories } from './shared.js';

let editMode = false;

export const goalEditScreen = {
  id: 'settings-screen-goal-edit',
  title: '목표 편집',

  async render() {
    const categories = sortedExpenseCategories(getCategories());
    return `
      <div class="settings-screen-section">
        <div class="settings-screen-section-head">
          <h3>카테고리 목표</h3>
          <button type="button" class="tds-text-btn" data-screen-action="toggle-edit">${editMode ? '완료' : '편집'}</button>
        </div>
        <div class="settings-goal-list">
          ${categories.map((cat, index) => `
            <div class="settings-goal-row ${editMode ? 'editing' : ''}" data-goal-row="${escHtml(cat.id)}">
              ${editMode ? `
                <span class="settings-order-btns">
                  <button type="button" class="tds-icon-btn sm" data-goal-move="up" data-goal-id="${escHtml(cat.id)}" ${index === 0 ? 'disabled' : ''} aria-label="${escHtml(cat.name)} 위로">▲</button>
                  <button type="button" class="tds-icon-btn sm" data-goal-move="down" data-goal-id="${escHtml(cat.id)}" ${index === categories.length - 1 ? 'disabled' : ''} aria-label="${escHtml(cat.name)} 아래로">▼</button>
                </span>
              ` : `<span class="settings-goal-emoji">${cat.emoji || '□'}</span>`}
              <div class="settings-goal-main">
                <strong>${escHtml(cat.name)}</strong>
                <small>${cat.autoManaged !== false ? '자동 관리' : '수동 관리'}</small>
              </div>
              ${editMode
                ? `<button type="button" class="tds-icon-btn sm" data-goal-edit="${escHtml(cat.id)}" aria-label="${escHtml(cat.name)} 수정">✎</button>`
                : switchHtml(`auto-${cat.id}`, cat.autoManaged !== false, `data-goal-auto-id="${escHtml(cat.id)}"`)}
            </div>
          `).join('')}
        </div>
        <button type="button" class="tds-text-btn" data-screen-action="add-goal">+ 새 목표 추가</button>
        <small class="settings-screen-note">자동 관리를 켜면 자동 배분·미션 추천 대상이 돼요.</small>
      </div>
    `;
  },

  bind(body, ctx) {
    body.querySelector('[data-screen-action="toggle-edit"]')?.addEventListener('click', () => {
      editMode = !editMode;
      ctx.refresh();
    });

    body.querySelectorAll('[data-goal-auto-id]').forEach(input => {
      input.addEventListener('change', async () => {
        try {
          await saveCategoryAutoManaged(input.dataset.goalAutoId, input.checked);
          showToast(input.checked ? '자동 관리를 켰어요.' : '자동 관리를 껐어요.', 1000, 'success');
          ctx.refresh();
        } catch (err) {
          showToast(err.message || '저장 실패', 2400, 'error');
        }
      });
    });

    body.querySelectorAll('[data-goal-edit]').forEach(btn => {
      btn.addEventListener('click', () => window.openCategoryModal?.(btn.dataset.goalEdit));
    });

    body.querySelector('[data-screen-action="add-goal"]')?.addEventListener('click', () => {
      window.openCategoryModal?.();
    });

    body.querySelectorAll('[data-goal-move]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const categories = sortedExpenseCategories(getCategories());
        const index = categories.findIndex(cat => cat.id === btn.dataset.goalId);
        const swapWith = btn.dataset.goalMove === 'up' ? index - 1 : index + 1;
        if (index < 0 || swapWith < 0 || swapWith >= categories.length) return;
        const a = categories[index];
        const b = categories[swapWith];
        try {
          // parentOrder·order 쌍을 통째로 맞바꿔 그룹 정렬 기준을 유지한다.
          await saveCategory({ id: a.id, parentOrder: b.parentOrder || 99, order: b.order || 99 });
          await saveCategory({ id: b.id, parentOrder: a.parentOrder || 99, order: a.order || 99 });
          ctx.refresh();
        } catch (err) {
          showToast(err.message || '순서 변경 실패', 2400, 'error');
        }
      });
    });
  },
};
