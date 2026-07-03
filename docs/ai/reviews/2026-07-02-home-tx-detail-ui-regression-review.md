# 홈/거래 상세 UI 회귀 수정 리뷰

## 리뷰 대상

- 계획 문서: `docs/ai/features/2026-07-02-home-tx-detail-ui-regression.md`
- 실행 문서: `docs/ai/executions/2026-07-02-home-tx-detail-ui-regression.md`
- 변경 파일:
  - `styles/60-urge.css`
  - `modal-manager.js`
  - `modals/tx-edit-modal.js`
  - `style.css`
  - `index.html`
  - `app.js`

## 발견 사항

- 코드 레벨에서 추가 수정이 필요한 문제는 발견하지 못했다.

## 확인 내용

- `styles/70-reports.css`에는 `.report-month-nav`나 `fixed-cost`를 덮는 후순위 규칙이 없다.
- `styles/50-cart-detail.css`의 `#tab-home .fixed-cost-panel` 규칙은 데스크톱 grid/margin 배치용이며, 이번 고정비 폰트/행 레이아웃을 덮지 않는다.
- `modal-manager.js`는 더 이상 `modals-container.innerHTML` 전체 교체를 하지 않으므로, 동적 리포트 모달을 지우는 회귀 위험이 줄었다.
- `openTxEditModal()`은 모달 본문 노드 보장, 로딩 상태, 없음 상태, 오류 fallback을 모두 가진다.
- `index.html`, `style.css`, `app.js`, `modal-manager.js` cache-busting query가 `20260702-home-tx-detail-fix`로 갱신됐다.
- `sw.js`가 없어 `STATIC_ASSETS`/`CACHE_VERSION` bump 대상은 없다.

## 검증

- 통과: `npm.cmd run verify`
- 결과: `verify-project passed (95 JS files checked).`
- not verified yet: 정상 터미널 dev server에서 실제 모바일 화면을 열어 홈 카드와 거래 상세 모달 클릭 흐름을 확인하지는 못했다.

## 잔여 위험

- 실제 데이터가 있는 로그인 세션에서 거래 상세 모달 본문이 표시되는지는 사용자 환경에서 확인해야 한다.
- 사용자가 본 모바일 브라우저가 이전 asset을 강하게 캐시하고 있으면 새 query 반영 후 새로고침이 필요할 수 있다.
