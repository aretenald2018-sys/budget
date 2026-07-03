# 리포트 카테고리 모달 하단 CSS 회귀 진단

## 증상

- 사용자 제공 모바일 스크린샷에서 `생활비용` 카테고리 드릴다운 모달 하단 거래 목록이 예전 디자인과 다르게 보인다.
- 거래 버튼과 `환급처리` 체크 영역이 정돈된 행/pill처럼 보이지 않고, 네이티브 컨트롤에 가까운 형태로 노출된다.

## 재현/피드백 루프

- 사용자 제공 스크린샷을 실패 기준으로 삼았다.
- 현재 렌더 구조 확인:
  - `render-report.js`의 `reportTxRow()`가 `.report-tx-row`, `.report-tx-open`, `.report-refund-check` 마크업을 만든다.
  - `ensureReportModal()`은 `#modals-container`에 `#report-category-modal`을 동적으로 추가한다.
- 이전 디자인 기준 확인:
  - `4d0e02f^:styles/30-cart-board.css`의 `.report-drill-summary`, `.report-tx-row`, `.report-tx-open`, `.report-refund-check` 규칙이 예전 모달 하단 스타일이다.

## 가설

1. 현재 `styles/20-records.css`에 추가된 모달 하단 CSS가 예전 CSS와 달라, 사용자가 기대한 회색 요약 카드와 40px 원형 아이콘 거래 행이 복구되지 않았다.
2. `style.css`가 `styles/20-records.css?v=20260702-home-report-period-fix`를 계속 import해 모바일 브라우저가 이전 CSS를 캐시할 수 있다.
3. `index.html`의 `style.css` query도 `20260702-home-gauge-fill`로 남아 있어 운영 배포 후 최상위 CSS 재요청이 보장되지 않는다.

## 확인 결과

- 예전 스타일은 `.report-drill-summary`를 `var(--surface2)` 배경의 16px radius 요약 카드로 만든다.
- 예전 거래 행은 `.report-tx-open`을 flex 행으로 두고 `.tx-icon`을 40px 원형 아이콘으로 만든다.
- 예전 `환급처리`는 10px 굵은 텍스트의 작은 pill이며 checkbox는 브라우저 기본 체크 모양에 `accent-color`만 적용한다.
- 현재 작업트리의 `.report-refund-check input`은 custom checkbox를 만들고 있어 스크린샷의 "예전처럼 복구" 요구와 맞지 않는다.
- 현재 repo에는 `sw.js`가 없어 `STATIC_ASSETS`/`CACHE_VERSION` bump 대상은 없다.

## 진단 결론

- 수정 범위는 리포트 카테고리 드릴다운 모달 하단 CSS와 CSS cache-busting query 갱신으로 한정한다.
- 데이터 집계, 거래 저장, 환급 토글 로직, 모달 렌더 JS는 변경하지 않는다.
