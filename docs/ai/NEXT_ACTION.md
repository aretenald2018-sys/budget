# 다음 자동 액션

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-06-01-loading-performance-stabilization.md`
- 실행 문서: 계획 문서의 `실행 결과` 섹션
- 리뷰 문서: `docs/ai/reviews/2026-06-01-loading-performance-stabilization-review.md`
- 진단 문서: 계획 문서 내 `/diagnose`
- 현재 단계: planning, execution, review 완료
- 현재 슬라이스: 슬라이스 1 - 탭 로딩 hard timeout 및 중복 초기 로딩 축소
- 마지막 완료: 실행 슬라이스 1을 구현, 리뷰, 배포했다. `node --check`, `npm.cmd run verify`, `npm.cmd run pages:build`, `git diff --check`가 통과했고 배포본 `/budget/`, `app.js`, `render-tx.js`, `data.js`가 HTTP 200 및 `20260601-loading-perf` 관련 변경을 반환했다.
- 다음 액션: 실제 로그인된 앱에서 홈/거래/선택/목표 탭 전환 체감, 25초 timeout retry UI, 빠른 거래 추가/편집 모달 클릭을 확인한다.
- 차단 사유: 없음

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
