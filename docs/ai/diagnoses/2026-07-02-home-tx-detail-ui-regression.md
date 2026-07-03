# 홈/거래 상세 UI 회귀 진단

## 증상

- 홈 최상단 흰색 기간 카드가 의미 없는 빈 카드처럼 보이고, 이전/다음 버튼과 `N일째 · 남은 N일` 텍스트 정렬이 무너져 보인다.
- 홈 `이번 달 고정비` 카드의 금액/상태 텍스트가 삭제 전 디자인보다 커지고 굵게 보여 가독성이 떨어진다.
- 거래 탭에서 거래 세부항목을 누르면 거래 상세 모달 제목만 보이고 본문 내용이 사라진다.

## 재현/피드백 루프

- 사용자 제공 스크린샷으로 현재 실패 상태를 확인했다.
- 코드 비교 기준:
  - 탭 삭제 이전 기준: `e9e370f`
  - 탭 삭제 커밋: `4d0e02f`
  - 최근 복구 커밋: `95b634f`
- 빠른 정적 확인:
  - `styles/60-urge.css`
  - `render-report.js`
  - `modal-manager.js`
  - `modals/tx-edit-modal.js`

## 가설

1. `.report-month-nav .t6`의 `flex: 1`이 복구되지 않아 홈 기간 카드 안 텍스트/버튼 배치가 작은 화면에서 다시 어긋난다.
2. `fixed-cost` 영역은 삭제 전 행 규칙 대부분이 복구됐지만 카드 전체와 요약의 폰트 스케일을 더 강하게 고정하지 않아 현재 화면에서 크게 보인다.
3. `openTxEditModal()`은 조회나 HTML 생성 중 예외가 나면 본문 fallback 없이 중단되어 제목만 남는다.
4. `modal-manager.js`가 `modals-container.innerHTML = ...`로 컨테이너 전체를 교체하므로, 이미 동적으로 만들어진 리포트/분류 모달이 있으면 사라질 수 있다.
5. CSS/JS cache-busting query가 한 번 더 갱신되지 않으면 배포/모바일 브라우저에서 이전 파일을 계속 볼 수 있다.

## 확인 결과

- `e9e370f:styles/30-cart-board.css`에는 `.report-month-nav .t6 { flex: 1; text-align: center; }`가 있었다.
- 현재 `styles/60-urge.css`에는 `.report-month-nav`의 flex 레이아웃은 복구됐지만 `.t6`의 `flex: 1`은 없다.
- `fixed-cost` 기본 행 규칙은 일부 복구됐으나, 사용자 스크린샷 기준 요약과 행 텍스트 크기를 더 보수적으로 낮출 필요가 있다.
- `openTxEditModal()`에는 `try/catch`가 없어 `getTransaction()`, `getReceipt()`, `fmtDateTime()`, 상세분류 HTML 생성 중 어느 지점에서든 실패하면 본문이 실패 상태로 바뀌지 않는다.
- `modal-manager.js`는 정적 모달 HTML을 주입할 때 컨테이너 전체를 덮어쓴다. 이 방식은 `render-report.js`가 만든 `report-category-modal`, `report-subcategory-classify-modal`, `home-cycle-settings-modal` 같은 동적 모달과 충돌할 수 있다.

## 진단 결론

- 홈 문제는 탭 삭제 전 CSS 일부가 불완전하게 복구된 회귀다.
- 거래 상세 문제는 본문 렌더 예외 방어 부족과 모달 컨테이너 전체 교체 방식이 결합된 회귀다.
- 수정은 앱 데이터/계산 로직이 아니라 CSS, 모달 로더, 거래 상세 모달 렌더 방어, cache-busting query 갱신으로 한정한다.
