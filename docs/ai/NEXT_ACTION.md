# 다음 자동 액션

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-03-daily-reward-play-rules-widget.md`
- 목업 문서: `docs/ai/features/2026-07-03-daily-reward-to-be-mockup.html`
- 실행 문서: `docs/ai/executions/2026-07-03-daily-reward-play-rules-widget.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-daily-reward-play-rules-widget-review.md`
- 현재 단계: 오늘 카드 보상 루프 구현/검증/리뷰/production 배포 완료
- 마지막 완료: `오늘 카드` 선택형 보너스 계산, 홈 UI, 설정 UI, Android 위젯 snapshot/provider, 목업 문구 정리, cache-bust 갱신을 구현했고 GitHub Pages production 배포까지 통과했다.
- 다음 액션: 없음
- 차단 사유: 없음

## 최근 처리한 요청

- 요청: `docs/ai/features/2026-07-03-daily-reward-to-be-mockup.html`이 서비스기획 관점에서 적절한지 검토하고, 비직관적 영어/개발자 용어 없이 재밌지만 직관적인 상품화 수준의 기획/HTML mockup/실제 구현까지 완료.
- 계획 문서: `docs/ai/features/2026-07-03-daily-reward-play-rules-widget.md`
- 목업 문서: `docs/ai/features/2026-07-03-daily-reward-to-be-mockup.html`
- 실행 문서: `docs/ai/executions/2026-07-03-daily-reward-play-rules-widget.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-daily-reward-play-rules-widget-review.md`
- 결과:
  - 추천대로 확률형/랜덤형 보상을 전면 구현하지 않고, 사용자가 매일 고르는 `오늘 카드` MVP로 구현했다.
  - 기본 포인트 적립률은 유지하고, 오늘 선택한 포인트 항목에만 보너스를 더한다.
  - 홈 `오늘의 적립` 카드, 설정 `오늘 카드`, Android 위젯 snapshot v2/provider 표시를 구현했다.
  - `npm.cmd run verify`와 `npm.cmd run pages:build`는 통과했다.
  - Playwright QA harness에서 홈/설정 모바일 visual QA를 통과했다.
  - GitHub Actions에서 `Build Android APK`, `Verify`, `Build Pages artifact`, `Deploy to GitHub Pages`가 통과했다.
  - production URL과 핵심 JS 모듈이 `20260703-daily-reward-loop` cache-bust와 오늘 카드 토큰을 제공함을 확인했다.

## 리뷰 대상 변경 파일

- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
- `android/src/com/aretenald/budget/RewardWidgetStore.java`
- `app.js`
- `data.js`
- `index.html`
- `modals/account-modal.js`
- `modals/category-modal.js`
- `modals/tx-edit-modal.js`
- `render-finance.js`
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
- `docs/ai/features/2026-07-03-daily-reward-play-rules-widget.md`
- `docs/ai/features/2026-07-03-daily-reward-to-be-mockup.html`
- `docs/ai/executions/2026-07-03-daily-reward-play-rules-widget.md`
- `docs/ai/reviews/2026-07-03-daily-reward-play-rules-widget-review.md`
- `docs/ai/NEXT_ACTION.md`

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
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다.
