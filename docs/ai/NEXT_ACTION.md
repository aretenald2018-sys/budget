# 다음 자동 액션

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-03-hanapay-notification-parser.md`
- 진단 문서: `docs/ai/diagnoses/2026-07-03-hanapay-notification-ingest-gap.md`
- 실행 문서: `docs/ai/executions/2026-07-03-hanapay-notification-parser.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-hanapay-notification-parser-review.md`
- 현재 단계: 하나Pay 결제 알림 parser 보강 실행/리뷰 완료
- 현재 슬라이스: 완료 `하나Pay 결제 알림 parser 보강`
- 마지막 완료: 2026-07-03 KST 하나Pay `(결제) 2,200원 씨유문정엠스테이트점 / 신용(...) / 07.03 08:40` 샘플을 deterministic parser로 처리하도록 보강하고, Firestore read quota fallback 및 manual write-only recovery를 추가했다. 최종 backend run `28629172856`에서 tx `cHq9SfTd4ZVUDogk9Fp6`가 생성됐고, 운영 UI 거래 탭에서 `씨유문정엠스테이트점 -2,200원`을 확인했다.
- 다음 액션: 없음. 다만 현재 public APK는 native 수집이 없으므로 실제 폰 자동 수집은 MacroDroid 설정 또는 private native APK 설치 상태를 별도로 점검해야 한다.
- 차단 사유: 없음

## 리뷰 대상 변경 파일

- `docs/ai/diagnoses/2026-07-03-hanapay-notification-ingest-gap.md`
- `docs/ai/features/2026-07-03-hanapay-notification-parser.md`
- `docs/ai/executions/2026-07-03-hanapay-notification-parser.md`
- `docs/ai/reviews/2026-07-03-hanapay-notification-parser-review.md`
- `docs/ai/NEXT_ACTION.md`
- `api/_lib/server-parser.js`
- `api/_lib/auto-ingest.js`
- `scripts/verify-project.mjs`

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
