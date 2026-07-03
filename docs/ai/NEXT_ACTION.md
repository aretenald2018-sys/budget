# 다음 자동 액션

## 현재 상태

- 상태: `ready_for_execution`
- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 문서: `docs/ai/executions/2026-07-03-reward-points-triple-android-widget-web.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-reward-points-triple-android-widget-web-review.md`
- 현재 단계: 슬라이스 1 웹 포인트 3분화와 홈 `이번 달` CSS 복구 구현/검증/리뷰 완료
- 마지막 완료: `와인구매`, `고급재료`, `여행충당` 포인트 버킷과 설정별 적립률을 추가했고, 일/월 포인트 상한 계산/표시를 제거했다. 홈 `이번 달` 버튼은 root-scoped 렌더링으로 바꿔 홈 CSS/문구가 유지되게 했다. `npm.cmd run verify`, `npm.cmd run pages:build`, `git diff --check` 통과. 리뷰에서 코드 결함은 발견되지 않았다.
- 다음 액션: 의도한 변경을 production GitHub Pages에 배포하고 운영 URL에서 세 포인트 표시, 상한 제거, 홈 `이번 달` 클릭 상태를 확인한다.
- 차단 사유: 아직 커밋/푸시와 GitHub Pages 운영 배포 확인 전.

## 최근 처리한 요청

- 요청: 포인트 제도를 `와인구매`, `고급재료`, `여행충당` 3개로 나누고, 각 적립률 설정/상한 제거/홈 `이번 달` CSS 깨짐 수정/Android 위젯까지 목표화
- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 문서: `docs/ai/executions/2026-07-03-reward-points-triple-android-widget-web.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-reward-points-triple-android-widget-web-review.md`
- 결과: 슬라이스 1 구현/로컬 검증/리뷰 완료. 다음 자동 액션은 production 배포와 운영 UI 검증.

- 요청: `unrelated dirty worktree`가 production 검증/배포 차단 사유로 반복되지 않게 정리
- 계획 문서: `docs/ai/features/2026-07-03-worktree-hygiene-cleanup.md`
- 실행 문서: `docs/ai/executions/2026-07-03-worktree-hygiene-cleanup.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-worktree-hygiene-cleanup-review.md`
- 결과: 커밋 대상과 runtime artifact를 분리했고, stale CSS/cache-bust 잔여 변경은 `HEAD`로 복구했다. local 검증은 모두 통과했다.

## 리뷰 대상 변경 파일

- `app.js`
- `data.js`
- `index.html`
- `modal-manager.js`
- `modals/account-modal.js`
- `modals/category-modal.js`
- `modals/tx-edit-modal.js`
- `render-finance.js`
- `render-home.js`
- `render-report.js`
- `render-review.js`
- `render-settings.js`
- `render-settle.js`
- `render-tx.js`
- `scripts/verify-project.mjs`
- `style.css`
- `styles/60-urge.css`
- `urge/render-mindbank.js`
- `urge/render-urge-alternatives.js`
- `urge/render-urge-input.js`
- `urge/render-urge-result.js`
- `urge/render-wine-cellar.js`
- `utils/reward-savings.js`
- `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- `docs/ai/executions/2026-07-03-reward-points-triple-android-widget-web.md`
- `docs/ai/reviews/2026-07-03-reward-points-triple-android-widget-web-review.md`
- `docs/ai/NEXT_ACTION.md`

## 더 이전 처리한 요청

- 요청: 문자 자동수집 카드 결제와 Gmail 세부품목 영수증을 하나의 거래로 관리
- 계획 문서: `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`
- 실행 문서: `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-sms-gmail-receipt-merge-review.md`
- 결과: 슬라이스 1 구현/검증/리뷰/production 배포 완료. Gmail receipt가 기존 Android SMS/notification 거래에 붙는 fixture, memo idempotency, legacy `receiptId` 보존 검증이 `npm.cmd run verify`에 포함됐다. GitHub `Validate`와 `Deploy GitHub Pages` 성공, production URL HTTP 200 확인 완료.

- 요청: 앱 7월 거래 기록을 토스 앱 캡처와 맞추기
- 진단 문서: `docs/ai/diagnoses/2026-07-03-toss-july-record-reconciliation.md`
- 계획 문서: `docs/ai/features/2026-07-03-toss-july-record-reconciliation.md`
- 실행 문서: `docs/ai/executions/2026-07-03-toss-july-record-reconciliation.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-toss-july-record-reconciliation-review.md`
- 결과: 운영 Firestore 보정 완료. 스크립트 재검증에서 토스 기준 합계와 일치.

- 요청: Discord로 들어오는 요청이 GPT/Codex 리소스를 쓰지 않게 차단
- 계획 문서: `docs/ai/features/2026-07-03-discord-request-resource-block.md`
- 실행 문서: `docs/ai/executions/2026-07-03-discord-request-resource-block.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-discord-request-resource-block-review.md`
- 결과: Discord 자동 개발 요청 bridge/agent가 중지 및 비활성화되었고, 재시작 시에도 agent/reviewer가 off 상태다.

## 이전 대기 작업

- 교통비용 `상세분류 미지정` 클릭 수정: `docs/ai/features/2026-07-03-transport-subcategory-literal-unassigned.md`
- 상태: 구현/검증/리뷰 완료, production 배포 대기
- 차단: 작업 시작 전부터 unrelated dirty changes가 대량으로 있었고, 이번 요청 파일인 `render-report.js`, `app.js`, `render-home.js`, `index.html`에도 기존 미커밋 변경이 섞여 있어 안전하게 production 커밋/푸시를 진행할 수 없음
- Android 로컬 알림 수집 rebuild: `docs/ai/features/2026-07-03-android-local-notification-rebuild.md`
- 상태: 구현/검증 일부 완료, production/실기기 검증 대기
- 차단: unrelated dirty worktree 정리 및 Android 실기기 연결 필요

## 상태값

- `idle`: 진행 중인 자동 액션 없음
- `needs_user_decision`: 사용자 결정이 필요함
- `ready_for_execution`: 다음 실행 슬라이스를 바로 진행
- `ready_for_review`: 직전 실행 결과를 바로 리뷰
- `ready_for_fix`: 리뷰에서 발견된 문제만 바로 수정
- `complete`: 현재 계획 완료

## 자동 진행 규칙

- 세션 시작 시 이 파일을 먼저 읽는다.
- 사용자가 "계속", "다음", "진행", "리뷰해", "해줘"처럼 짧게 말하면 이 파일의 `다음 액션`을 실행한다.
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다. 단, 기존 대기 액션과 충돌하면 어느 흐름을 계속할지 한 번만 확인한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다. 필요한 프롬프트 내용은 계획 문서와 이 파일에 남기고 에이전트가 직접 읽어 진행한다.
