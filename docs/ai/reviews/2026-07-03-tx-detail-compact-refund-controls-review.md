# 거래 상세 환급/입력 컨트롤 미니멀 정리 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-03-tx-detail-compact-refund-controls.md`
- 실행: `docs/ai/executions/2026-07-03-tx-detail-compact-refund-controls.md`
- 변경 파일:
  - `modals/tx-edit-modal.js`
  - `styles/20-records.css`
  - `style.css`
  - `index.html`
  - `app.js`
  - `modal-manager.js`
  - `scripts/verify-project.mjs`
  - `docs/ai/NEXT_ACTION.md`

## Findings

- [수정 완료] production UI 1차 확인에서 물음표 도움말 요소가 클릭 포커스를 받아도 `:focus-visible`이 켜지지 않아 tooltip opacity가 0으로 남았다. `.tx-refund-help:focus::after`를 추가해 클릭/키보드 포커스에서도 도움말이 표시되도록 보강했다.

## 확인 내용

- 환급 checkbox `name="reimbursementExpected"`는 그대로 유지되어 `FormData` 저장 경로가 바뀌지 않았다.
- 기존 긴 라벨은 모달 마크업에서 제거되었고, 설명 문구는 물음표 도움말의 `title`, `aria-label`, `data-tooltip`로만 남았다.
- 체크 상태 변경 핸들러는 `.active` 클래스만 갱신하므로, 체크 후 긴 문구로 되돌아가는 회귀가 없다.
- 입력 컨트롤 축소는 `#tx-edit-form` 범위에 한정되어 거래 추가 모달이나 전역 입력 스타일을 직접 바꾸지 않는다.
- `style.css`, `index.html`, `app.js`, `modal-manager.js` cache-bust가 함께 갱신되었다.
- `scripts/verify-project.mjs`에 compact 환급 UI와 cache-bust 정적 검증이 추가되었다.
- focus tooltip 보강 후 `scripts/verify-project.mjs`가 `.tx-refund-help:focus::after` 계약도 확인한다.

## 검증 근거

- `node --check modals/tx-edit-modal.js` 통과
- `node --check scripts/verify-project.mjs` 통과
- `npm.cmd run verify` 통과
- `npm.cmd run pages:build` 통과
- `git diff --check` 통과

## 남은 위험

- not verified yet: focus tooltip 보강 후 production 재배포와 실제 운영 모달 재확인이 필요하다.
