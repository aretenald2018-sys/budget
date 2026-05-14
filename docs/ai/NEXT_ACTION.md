# 다음 자동 액션

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-05-14-recipe-static-autofill-ux.md`, `docs/ai/features/2026-05-14-vercel-api-bridge.md`
- 리뷰 문서: `docs/ai/reviews/2026-05-14-recipe-static-autofill-ux-review.md`, `docs/ai/reviews/2026-05-14-vercel-api-bridge-review.md`
- 현재 단계: execution + review 완료
- 현재 슬라이스: 남은 코드 슬라이스 없음
- 마지막 완료: 레시피 정적 자동채움 슬라이스 2까지 최종 구현하고 기등록 Shorts/Reels 9개를 읽기 전용으로 검증했다. YouTube sparse 재료 병합 이슈를 수정했고, Instagram Reels는 저장된 텍스트가 부족해 Vercel API bridge 운영 검증 대상으로 남았다.
- 다음 액션: 실제 브라우저 UI와 Vercel 운영 URL은 사용자 환경에서 확인한다.
- 차단 사유: 실제 Vercel 배포와 LLM API key 설정은 사용자 계정 credential이 필요하다. Firebase 로그인 데이터가 필요한 선택탭 시각 검증은 normal terminal/dev browser에서 확인해야 한다.

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
