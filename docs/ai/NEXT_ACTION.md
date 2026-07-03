# 다음 자동 액션

## 현재 상태

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`
- 실행 문서: `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-sms-gmail-receipt-merge-review.md`
- 현재 단계: 슬라이스 1 구현/검증/리뷰 완료, production 배포 및 운영 UI 확인 대기
- 마지막 완료: `api/_lib/receipt-enricher.js`에서 Gmail receipt가 기존 Android SMS/notification 거래에 붙도록 same-day fallback, `receiptIds`/`receiptId` 링크, memo/receipt summary 병합을 보강했다. 리뷰 중 legacy `receiptId` 단독 링크 보존 문제를 찾아 `receiptLinkIds()`와 verifier fixture로 수정했다. `node --check`, `npm.cmd run verify`, `npm.cmd run pages:build`, `git diff --check` 통과.
- 다음 액션: unrelated dirty worktree 정리 또는 이번 변경만 안전하게 커밋/푸시할 수 있다는 사용자 결정 후 production Pages 배포를 진행하고, 운영 URL에서 거래 상세에 연결 영수증 품목과 SMS 원문이 함께 보이는지 확인한다.
- 차단 사유: production 배포/운영 UI 확인은 not verified yet. 작업 시작 전부터 unrelated dirty worktree가 많아 이 세션에서 안전하게 `main` push/Pages workflow 실행을 할 수 없다.

## 최근 처리한 요청

- 요청: 문자 자동수집 카드 결제와 Gmail 세부품목 영수증을 하나의 거래로 관리
- 계획 문서: `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`
- 실행 문서: `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-sms-gmail-receipt-merge-review.md`
- 결과: 슬라이스 1 구현/검증/리뷰 완료. Gmail receipt가 기존 Android SMS/notification 거래에 붙는 fixture, memo idempotency, legacy `receiptId` 보존 검증이 `npm.cmd run verify`에 포함됐다. production 배포/운영 UI 확인은 unrelated dirty worktree 때문에 not verified yet.

## 리뷰 대상 변경 파일

- `api/_lib/receipt-enricher.js`
- `scripts/verify-project.mjs`
- `docs/ai/features/2026-07-03-sms-gmail-receipt-merge.md`
- `docs/ai/executions/2026-07-03-sms-gmail-receipt-merge.md`
- `docs/ai/reviews/2026-07-03-sms-gmail-receipt-merge-review.md`
- `docs/ai/NEXT_ACTION.md`

## 더 이전 처리한 요청

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
