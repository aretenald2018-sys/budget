# 거래 상세 로딩과 적립배분율 하한 실행

## 변경

- `modals/tx-edit-modal.js`
  - `receiptIds`/`receiptId`를 정규화한다.
  - 연결 영수증 조회를 `Promise.allSettled`로 바꿔, 영수증 일부 실패가 거래 상세 폼 전체를 막지 않게 했다.
  - 실패한 영수증은 바텀시트 안에 안내 문구로 표시하고 거래 수정은 계속 가능하게 했다.
- `render-settings.js`
  - 보상 적립 설정 카드의 적립배분율 입력을 직접 입력형으로 유지하고 `min="0"`, `step="0.1"`로 설정했다.
  - 저장 시 `0..100%`를 `0..1` 비율로 변환한다.
  - 브라우저 fallback API URL을 검증 정책에 맞는 `https://budget-api-liart.vercel.app/api/ingest`로 정리했다.
- `data.js`, `render-report.js`
  - 앱 설정 저장/홈 카드 계산에서 `allocationRate`를 `0..1`로 허용한다.
- `index.html`, `app.js`, `render-home.js`, `render-report.js`, `render-settings.js`, `modal-manager.js`, `modals/tx-edit-modal.js`
  - 새 JS가 운영 배포본에서 로드되도록 cache-bust query string을 `20260703-tx-detail-reward-rate`로 갱신했다.

## 검증

- `node --check .\render-settings.js`
- `node --check .\modals\tx-edit-modal.js`
- `npm.cmd run verify`
  - `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - `_site` 생성 완료.
- `_site` 검색
  - 새 cache-bust 문자열 확인.
  - `allocationRatePct` 입력이 `min="0"`로 생성됨을 확인.
  - `min="5"`, `Math.max(0.05` 패턴 없음.

## 미검증

- 운영 GitHub Pages에는 아직 push/deploy하지 않았다.
- 현재 worktree에 이전 작업의 dirty/untracked 파일이 많아 production push는 선별 없이 안전하지 않다.
