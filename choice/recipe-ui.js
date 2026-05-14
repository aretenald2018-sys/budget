// ================================================================
// choice/recipe-ui.js - recipe display helpers for selection cards/details
// ================================================================

import { escHtml } from '../utils/dom.js';
import {
  isIngredientDecided,
  normalizedIngredients,
  selectedSource,
} from './recipe-runtime.js?v=20260514-recipe-registered';
import { recipeManualPasteForm } from './capture-ui.js?v=20260514-recipe-ui';

function escAttr(value) {
  return escHtml(String(value || ''));
}

export function recipeIngredientChipPreview(item) {
  const ingredients = normalizedIngredients(item);
  if (!ingredients.length) return '';
  const visible = ingredients.slice(0, 5);
  const extra = ingredients.length - visible.length;
  return `
    <div class="choice-recipe-chip-row" aria-label="레시피 재료 미리보기">
      ${visible.map(ing => `<span class="${isIngredientDecided(ing) ? 'done' : ''}">${escHtml(ing.name)}</span>`).join('')}
      ${extra > 0 ? `<em>+${extra}</em>` : ''}
    </div>
  `;
}

export function choiceRecipeDetailPanelHtml(item) {
  const ingredients = normalizedIngredients(item);
  const steps = normalizedRecipeSteps(item.steps);
  const decided = ingredients.filter(isIngredientDecided).length;
  const currentStep = recipeCurrentStepIndex(item.id, steps.length);
  const needsManual = !ingredients.length || !steps.length;
  return `
    <section class="choice-recipe-detail-panel">
      <div class="choice-recipe-panel-head">
        <div>
          <span>레시피 구조</span>
          <strong>${ingredients.length ? `${decided}/${ingredients.length} 재료 준비` : '재료 미등록'}</strong>
        </div>
        <em>${steps.length ? `${steps.length}단계` : '순서 미등록'}</em>
      </div>
      <div class="choice-recipe-detail-grid">
        <div class="choice-recipe-ingredient-panel">
          <div class="choice-recipe-subhead">
            <span>재료 체크리스트</span>
            <em>${ingredients.length ? `${decided}/${ingredients.length}` : '0개'}</em>
          </div>
          ${ingredients.length ? `
            <div class="choice-recipe-checklist">
              ${ingredients.map(ing => recipeIngredientCheckHtml(item, ing)).join('')}
            </div>
          ` : '<div class="choice-condition-empty">아직 재료가 없습니다. 아래에 영상 설명문이나 자막을 붙여넣어 정리하세요.</div>'}
        </div>
        <div class="choice-recipe-step-panel">
          <div class="choice-recipe-subhead">
            <span>조리순서</span>
            <em>${steps.length ? `${Math.min(currentStep + 1, steps.length)}/${steps.length}` : '0단계'}</em>
          </div>
          ${steps.length ? `
            <div class="choice-recipe-step-list">
              ${steps.map((step, index) => `
                <article class="choice-recipe-step-card ${index === currentStep ? 'current' : ''}">
                  <span>${index + 1}단계</span>
                  <p>${escHtml(step)}</p>
                </article>
              `).join('')}
            </div>
            <button type="button" class="choice-recipe-next-step" data-choice-detail-action="recipe-next-step" data-item-id="${escAttr(item.id)}" data-step-count="${steps.length}">
              ${currentStep >= steps.length - 1 ? '처음 단계로' : '다음 단계'}
            </button>
          ` : '<div class="choice-condition-empty">조리순서가 비어 있습니다. 설명문을 붙여넣으면 번호 순서로 나눠 담습니다.</div>'}
        </div>
      </div>
      <details class="choice-recipe-manual-details" ${needsManual ? 'open' : ''}>
        <summary>
          <span>${needsManual ? '재료를 직접 입력하기' : '자막/설명문 다시 붙여넣기'}</span>
          <em>수동 정리</em>
        </summary>
        ${recipeManualPasteForm({ itemId: item.id })}
      </details>
    </section>
  `;
}

export function advanceRecipeStep(itemId, total) {
  if (!itemId || !total) return;
  const current = recipeCurrentStepIndex(itemId, total);
  const next = current >= total - 1 ? 0 : current + 1;
  try {
    localStorage.setItem(recipeStepStorageKey(itemId), String(next));
  } catch {}
}

function recipeIngredientCheckHtml(item, ing) {
  const picked = selectedSource(ing);
  const checked = isIngredientDecided(ing);
  const disabled = !!picked;
  const status = picked ? '주문처 선택됨' : (ing.acquired ? '준비됨' : '체크하면 준비됨');
  return `
    <label class="choice-recipe-check-row ${checked ? 'checked' : ''} ${disabled ? 'locked' : ''}">
      <input type="checkbox" data-recipe-ing-toggle data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span>
        <strong>${escHtml(ing.name)}</strong>
        <em>${escHtml([ing.quantity, status].filter(Boolean).join(' · '))}</em>
      </span>
    </label>
  `;
}

function recipeCurrentStepIndex(itemId, total) {
  if (!total) return 0;
  try {
    const value = Number(localStorage.getItem(recipeStepStorageKey(itemId))) || 0;
    return Math.max(0, Math.min(total - 1, value));
  } catch {
    return 0;
  }
}

function recipeStepStorageKey(itemId) {
  return `budget.recipeStep.${itemId}`;
}

function normalizedRecipeSteps(value) {
  return Array.isArray(value) ? value.map(step => String(step || '').trim()).filter(Boolean) : [];
}
