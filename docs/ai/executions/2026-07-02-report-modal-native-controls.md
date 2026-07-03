# 리포트 카테고리 모달 기본 컨트롤 제거 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-report-modal-native-controls.md`
- 실행 슬라이스: 실행 슬라이스 1 - 모달 거래 행 native control 제거

## 변경 파일

- `render-report.js`
- `styles/20-records.css`
- `style.css`
- `app.js`
- `index.html`
- `docs/ai/NEXT_ACTION.md`
- `docs/ai/diagnoses/2026-07-02-report-modal-native-controls.md`
- `docs/ai/features/2026-07-02-report-modal-native-controls.md`

## 구현 내용

- `reportTxRow()`에서 거래 열기 `<button>`을 제거하고 `div role="button"`과 `data-report-action="open-tx-detail"`로 변경했다.
- `환급처리` checkbox를 제거하고 `span role="button"` pill과 `data-report-action="toggle-reimbursement"`로 변경했다.
- `bindReportModal()`에 거래 상세 열기와 환급 토글 delegated handler를 추가했다.
- Enter/Space 키로 거래 열기와 환급 토글이 동작하도록 keydown 처리를 추가했다.
- 환급 토글 저장 중 `aria-disabled`와 optimistic 상태 표시를 적용하고, 실패 시 이전 상태로 되돌리도록 했다.
- `render-report.js`, `app.js`, `style.css`, `index.html` cache-busting query를 `20260702-report-modal-native-controls`로 갱신했다.

## 검증

- 통과: `npm.cmd run verify`
- 결과: `verify-project passed (95 JS files checked).`
- 통과: `npm.cmd run pages:build`
- 결과: `GitHub Pages artifact ready: C:\Users\USER\Desktop\Tomato Project\budgetproject\_site`
- 통과: `git diff --check`
- 통과: `_site` 산출물 문자열 확인
  - `render-report.js`와 `_site/render-report.js`에 `data-report-action="open-tx-detail"`와 `data-report-action="toggle-reimbursement"`가 있다.
  - `styles/20-records.css`와 `_site/styles/20-records.css`에 `.report-refund-check.active`가 있다.
  - `index.html`, `app.js`, `style.css`와 `_site` 산출물에 `20260702-report-modal-native-controls` query가 있다.
- not verified yet: 운영 배포와 운영 UI 클릭 검증은 현재 unrelated dirty/untracked worktree 때문에 수행하지 않았다.
