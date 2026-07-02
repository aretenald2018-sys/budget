# 다음 자동 액션

## 현재 상태

- 상태: `ready_for_review`
- 계획 문서: `docs/ai/features/2026-07-02-home-month-mode-render-fix.md`
- 진단 문서: `docs/ai/diagnoses/2026-07-02-home-month-mode-and-gauge-overflow.md`
- 실행 문서: `docs/ai/executions/2026-07-02-home-month-mode-render-fix.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-02-home-month-mode-render-fix-review.md`
- 현재 단계: 홈 이번 달 전환 렌더 모드와 월 MAX 게이지 폭 보정 실행 완료, 리뷰 및 운영 검증 대기
- 현재 슬라이스: 실행 슬라이스 1
- 마지막 완료: 2026-07-02 KST 홈 `이번 달` 버튼이 항상 `#tab-home`, `homeMode=true`로 렌더링되게 수정했고, 월 MAX 게이지 row 폭이 카드 안에서 계산되도록 보정했다. `npm.cmd run verify`, `npm.cmd run pages:build`가 통과했다.
- 다음 액션: 리뷰 문서를 기준으로 변경 파일을 검토하고, 운영 GitHub Pages 배포 후 홈 `이번 달`/`이번 2주` 클릭과 `월 MAX 게이지` 표시를 확인한다.
- 차단 사유: 없음

## 리뷰 대상 변경 파일

- `docs/ai/diagnoses/2026-07-02-home-month-mode-and-gauge-overflow.md`
- `docs/ai/features/2026-07-02-home-month-mode-render-fix.md`
- `docs/ai/executions/2026-07-02-home-month-mode-render-fix.md`
- `docs/ai/reviews/2026-07-02-home-month-mode-render-fix-review.md`
- `docs/ai/NEXT_ACTION.md`
- `render-report.js`
- `styles/60-urge.css`
- `style.css`
- `app.js`
- `index.html`

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
