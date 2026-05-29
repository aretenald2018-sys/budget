# 다음 자동 액션

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-05-29-naverpay-auto-payment-dedupe.md`
- 리뷰 문서: `docs/ai/reviews/2026-05-29-naverpay-auto-payment-dedupe-review.md`
- 현재 단계: execution + review 완료
- 현재 슬라이스: 슬라이스 1 - 서버/브라우저 fallback 네이버페이 자동결제 파싱과 중복 매칭
- 마지막 완료: 네이버페이 자동결제 deterministic parser와 네이버페이충전 중복 매칭을 구현하고 정적/스모크 검증, 리뷰, GitHub Pages 배포 확인을 완료했다. 커밋 `a4dcdcf`의 `Deploy GitHub Pages` workflow가 성공했고 배포본 `app.js?v=20260529-naverpay-dedupe`가 HTTP 200으로 확인됐다.
- 다음 액션: GitHub Actions `budget_ingest` 운영 경로에서 실제 네이버페이 자동결제/충전 raw가 들어온 뒤 raw 2개가 transaction 1건으로 묶이는지 확인한다.
- 차단 사유: 실제 운영 SMS 인입 데이터 검증은 새 네이버페이 메시지가 들어와야 확인 가능하다.

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
