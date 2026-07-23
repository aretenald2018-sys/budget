// ================================================================
// modals/category-modal.js — 카테고리 추가·수정
// ================================================================

import { openCategoryModalController } from '../features/modals/category-controller.js';

export const MODAL_HTML = `
<div class="tds-modal-overlay" id="category-modal" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
  <div class="tds-modal-sheet">
    <div class="tds-modal-handle" aria-hidden="true"></div>
    <div class="tds-modal-content" style="text-align:left">
      <div class="tds-modal-head">
        <div class="tds-modal-title" id="category-modal-title">카테고리 추가</div>
        <button type="button" class="tds-modal-close" data-modal-dismiss="category-modal" aria-label="닫기">×</button>
      </div>

      <form id="category-form">
        <input type="hidden" name="id">

        <div class="form-group">
          <label>이름</label>
          <input class="tds-input" name="name" required placeholder="식비">
        </div>

        <div class="form-group">
          <label>이모지</label>
          <input class="tds-input" name="emoji" maxlength="4" placeholder="🍱">
        </div>

        <div class="form-group">
          <label>유형</label>
          <div class="tds-segmented category-kind-pills" data-radio-group="kind">
            <label class="segmented-item active"><input type="radio" name="kind" value="expense" checked>지출</label>
            <label class="segmented-item"><input type="radio" name="kind" value="income">수입</label>
          </div>
        </div>

        <div class="form-group">
          <label>월 예산 (원, 0이면 미설정)</label>
          <input class="tds-input" name="target" type="number" min="0" step="10000" placeholder="0">
        </div>

        <div class="form-group">
          <label>관리 방식</label>
          <div class="intent-row category-tier-pills" data-radio-group="tier" id="category-tier-select">
            <label class="intent-pill"><span class="em">⚙</span><input type="radio" name="tier" value="fixed">고정</label>
            <label class="intent-pill active"><span class="em">📊</span><input type="radio" name="tier" value="variable" checked>변동</label>
            <label class="intent-pill"><span class="em">⚖</span><input type="radio" name="tier" value="balance">균형</label>
            <label class="intent-pill"><span class="em">💰</span><input type="radio" name="tier" value="budget">예산</label>
          </div>
          <div class="st4" style="margin-top:4px">균형 카테고리는 술·와인, 야식처럼 횟수와 금액을 부드럽게 같이 봅니다.</div>
        </div>

        <div id="category-balance-fields" style="display:none">
          <div class="form-group">
            <label>격주 금액 기준 (원)</label>
            <input class="tds-input" name="targetBiweekly" type="number" min="0" step="10000" placeholder="0">
          </div>
          <div class="form-group">
            <label>격주 횟수 기준</label>
            <input class="tds-input" name="countTarget" type="number" min="0" step="1" placeholder="0">
          </div>
        </div>

        <div class="form-group">
          <label>자동분류 키워드 (콤마, 가맹점명 부분 일치)</label>
          <input class="tds-input" name="autoMatch" placeholder="GS25,세븐일레븐,편의점">
          <div class="st4" id="category-keyword-helper" style="margin-top:4px">파싱된 거래의 가맹점명에 이 키워드가 포함되면 자동으로 이 카테고리로 분류됩니다.</div>
        </div>

        <div class="flex gap-md" style="margin-top:24px">
          <button type="button" class="tds-btn ghost" id="category-delete-btn" style="display:none">삭제</button>
          <button type="button" class="tds-btn secondary" data-modal-dismiss="category-modal">취소</button>
          <button type="submit" class="tds-btn" style="flex:1">저장</button>
        </div>
      </form>
    </div>
  </div>
</div>
`;

export function openCategoryModal(categoryId = null) {
  openCategoryModalController(categoryId);
}

window.openCategoryModal = openCategoryModal;
