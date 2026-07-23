// ================================================================
// modals/account-modal.js — 본인 계좌/카드 추가·수정
// ================================================================

import { openAccountModalController } from '../features/modals/account-controller.js';

export const MODAL_HTML = `
<div class="tds-modal-overlay" id="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
  <div class="tds-modal-sheet">
    <div class="tds-modal-handle" aria-hidden="true"></div>
    <div class="tds-modal-content" style="text-align:left">
      <div class="tds-modal-head">
        <div class="tds-modal-title" id="account-modal-title">계좌 추가</div>
        <button type="button" class="tds-modal-close" data-modal-dismiss="account-modal" aria-label="닫기">×</button>
      </div>

      <form id="account-form">
        <input type="hidden" name="id">

        <div class="form-group">
          <label>유형</label>
          <div class="intent-row account-type-pills" data-radio-group="type">
            <label class="intent-pill active"><span class="em">💳</span><input type="radio" name="type" value="card" checked required>카드</label>
            <label class="intent-pill"><span class="em">🏦</span><input type="radio" name="type" value="bank">은행</label>
            <label class="intent-pill"><span class="em">📱</span><input type="radio" name="type" value="kakaopay">간편결제</label>
          </div>
        </div>

        <div class="form-group">
          <label>발급사 / 은행 (예: 신한카드, 카카오뱅크)</label>
          <input class="tds-input" name="issuer" required placeholder="신한카드">
        </div>

        <div class="form-group">
          <label>식별 번호 끝 4자리 (선택)</label>
          <input class="tds-input" name="last4" maxlength="4" pattern="[0-9]{0,4}" placeholder="1234">
        </div>

        <div class="form-group">
          <label>표시 이름</label>
          <input class="tds-input" name="alias" required placeholder="신한 The More">
        </div>

        <div class="form-group">
          <label>SMS/알림 매칭 키워드 (콤마 구분, 발신자명/카드명 등)</label>
          <input class="tds-input" name="matchKeywords" placeholder="신한,The More,1544-7000">
          <div class="st4" style="margin-top:4px">파싱 시 이 키워드가 본문에 있으면 이 계좌로 매칭됩니다.</div>
        </div>

        <div class="flex gap-md" style="margin-top:24px">
          <button type="button" class="tds-btn ghost" id="account-delete-btn" style="display:none">삭제</button>
          <button type="button" class="tds-btn secondary" data-modal-dismiss="account-modal">취소</button>
          <button type="submit" class="tds-btn" style="flex:1">저장</button>
        </div>
      </form>
    </div>
  </div>
</div>
`;

export function openAccountModal(accountId = null) {
  openAccountModalController(accountId);
}

window.openAccountModal = openAccountModal;
