// ================================================================
// modals/category-modal.js — 카테고리 추가·수정
// ================================================================

import { openCategoryModalController } from '../features/modals/category-controller.js';

export const MODAL_HTML = `
<div class="tds-modal-overlay" id="category-modal">
  <div class="tds-modal-sheet">
    <div class="tds-modal-handle"></div>
    <div class="tds-modal-content" style="text-align:left">
      <div class="tds-modal-title" id="category-modal-title">카테고리 추가</div>

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

        <div class="form-group" id="category-parent-group">
          <label>그룹</label>
          <select class="tds-select" name="parent" id="category-parent-select"></select>
          <input class="tds-input" name="parentDraft" id="category-parent-draft" placeholder="새 그룹 이름" style="display:none;margin-top:6px">
          <div class="st4" style="margin-top:4px">홈 '나의 목표'는 이 그룹 단위로 묶여서 보여집니다.</div>
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

        <div class="form-group" id="category-rhythm-group">
          <label>비용 성격</label>
          <div class="intent-row category-rhythm-pills" data-radio-group="budgetRhythm">
            <label class="intent-pill"><span class="em">⚙</span><input type="radio" name="budgetRhythm" value="fixed">고정비</label>
            <label class="intent-pill active"><span class="em">📊</span><input type="radio" name="budgetRhythm" value="spread" checked>변동비</label>
            <label class="intent-pill"><span class="em">🚀</span><input type="radio" name="budgetRhythm" value="front_loaded">월초 집중</label>
          </div>
          <div class="st4" style="margin-top:4px" id="category-rhythm-hint"></div>
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
