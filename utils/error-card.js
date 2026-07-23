// ================================================================
// utils/error-card.js — 화면 내 데이터 로드 실패 카드 (공용)
// 재시도 버튼은 app.js의 전역 [data-tab-retry] 위임 핸들러를 재사용한다.
// ================================================================

export function errorCardHtml(tab, message = '데이터를 불러오지 못했습니다') {
  return `
    <div class="empty-state" role="alert">
      <div class="icon">⚠️</div>
      <div>${message}</div>
      <div class="st4">네트워크 상태를 확인한 뒤 다시 시도하세요.</div>
      <button type="button" class="tds-btn secondary sm" style="margin-top:12px" data-tab-retry="${tab}">다시 시도</button>
    </div>
  `;
}
