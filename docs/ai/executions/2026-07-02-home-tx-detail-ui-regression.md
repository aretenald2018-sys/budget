# 홈/거래 상세 UI 회귀 수정 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-home-tx-detail-ui-regression.md`
- 실행 슬라이스: 실행 슬라이스 1 - 홈 카드와 거래 상세 모달 회귀 수정

## 변경 파일

- `styles/60-urge.css`
- `modal-manager.js`
- `modals/tx-edit-modal.js`
- `style.css`
- `index.html`
- `app.js`
- `docs/ai/NEXT_ACTION.md`
- `docs/ai/diagnoses/2026-07-02-home-tx-detail-ui-regression.md`
- `docs/ai/features/2026-07-02-home-tx-detail-ui-regression.md`

## 구현 내용

- 홈 기간 카드의 `.report-month-nav .t6`에 `flex: 1`, `min-width: 0`, 한 줄 overflow 방어를 복구했다.
- 홈 2주 기간 카드의 버튼/텍스트가 항상 flex 행으로 배치되도록 홈 전용 선택자를 보강했다.
- `fixed-cost` 카드의 요약/행 폰트 크기, line-height, grid column을 작고 안정적인 모바일 카드 기준으로 조정했다.
- `modal-manager.js`가 `modals-container` 전체를 덮어쓰지 않고, 등록된 정적 모달이 없을 때만 append하도록 바꿨다.
- `openTxEditModal()`이 모달 DOM을 직접 보장하고, 조회/렌더 실패 시 제목만 남기지 않고 오류 본문과 다시 시도 버튼을 표시하도록 했다.
- 수정된 CSS/JS 경로에 `20260702-home-tx-detail-fix` cache-busting query를 적용했다.

## 검증

- 통과: `npm.cmd run verify`
- 결과: `verify-project passed (95 JS files checked).`
- not verified yet: 실제 모바일 브라우저에서 홈 카드와 거래 상세 모달을 클릭해 보는 UI 검증은 이 환경에서 장기 dev server를 시작하지 않는 프로젝트 규칙 때문에 수행하지 않았다.

## 남은 리뷰 포인트

- 홈 첫 화면 기간 카드가 실제 모바일에서 한 줄로 보이는지 확인한다.
- `이번 달 고정비` 카드의 요약/행 텍스트가 과하게 커 보이지 않는지 확인한다.
- 거래 탭 목록에서 거래를 누르면 거래 상세 본문이 표시되는지 확인한다.
- 홈/리포트 카테고리 내역에서 거래를 누른 뒤 상세 본문이 표시되는지 확인한다.
