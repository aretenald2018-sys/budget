# 거래 상세 환급/입력 컨트롤 미니멀 정리 실행

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-03-tx-detail-compact-refund-controls.md`
- 실행 슬라이스: 슬라이스 1 `거래 상세 모달 컨트롤 정리`

## 변경 내용

- `modals/tx-edit-modal.js`
  - 환급 체크 영역을 카드형 label에서 `div.tx-refund-panel` + `label.tx-refund-check` + `span.tx-refund-help` 구조로 바꿨다.
  - 화면 표시 문구를 `환급예정`으로 줄였다.
  - 기존 설명은 물음표 도움말의 `title`, `aria-label`, `data-tooltip`에 넣었다.
  - 체크 상태 변경 시 긴 라벨로 바꾸던 동적 텍스트 갱신을 제거했다.
- `styles/20-records.css`
  - 거래 상세 폼 내부 입력/선택/메모 컨트롤 높이와 패딩을 줄이고, 배경을 `var(--surface)`와 얇은 border 중심으로 정리했다.
  - 환급 영역을 `다음에도 자동`과 가까운 compact checkbox 행으로 변경했다.
  - 물음표 도움말은 hover/focus-visible에서 보이는 CSS tooltip으로 구현했다.
- `style.css`, `index.html`, `app.js`, `modal-manager.js`
  - CSS, app module, modal module cache-bust를 `20260703-tx-detail-compact-refund`로 갱신했다.
- `scripts/verify-project.mjs`
  - 환급 compact 마크업, stale verbose 라벨 제거, CSS/cache-bust 계약을 검증하는 `checkTxDetailCompactRefundContracts()`를 추가했다.

## 검증

- `node --check modals/tx-edit-modal.js` 통과
- `node --check scripts/verify-project.mjs` 통과
- `npm.cmd run verify` 통과: `verify-project passed (87 JS files checked).`
- `npm.cmd run pages:build` 통과: `_site` Pages artifact 생성
- `git diff --check` 통과

## not verified yet

- 로그인된 실제 production UI에서 거래 상세 모달을 열고 hover/focus tooltip 및 모바일 표시를 직접 보는 검증은 아직 production 배포 전이라 남아 있다.
