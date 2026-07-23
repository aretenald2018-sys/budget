// ================================================================
// utils/nav-badge.js — 하단 내비 검토 버튼 알림 점
// 각 탭 렌더러가 budget:review-count 이벤트로 건수를 알리면 점을 토글한다.
// ================================================================

function updateReviewNavBadge(count) {
  const icon = document.querySelector('.bottom-nav button[data-tab="review"] .icon');
  if (!icon) return;
  const existing = icon.querySelector('.nav-dot');
  if (count > 0 && !existing) {
    const dot = document.createElement('span');
    dot.className = 'nav-dot';
    icon.appendChild(dot);
  } else if (count === 0 && existing) {
    existing.remove();
  }
}

document.addEventListener('budget:review-count', (event) => {
  updateReviewNavBadge(Number(event.detail?.count) || 0);
});
