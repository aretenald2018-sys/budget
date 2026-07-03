# 운영 보상 적립률/CSS 회귀 진단

## 증상

- 운영 화면에서 `적립 배분율`이 5% 미만으로 내려가지 않는다.
- 홈 `검토 대기` 카드가 기본 버튼 테두리처럼 보인다.

## 확인

- 운영 HTML은 `app.js?v=20260703-dual-apk`, `render-settings.js?v=20260703-dual-apk`, `style.css?v=20260702-reward-rate-input`을 로드한다.
- 기존 로컬 작업트리는 `origin/main`보다 28커밋 뒤처져 있어 로컬 수정이 운영에 배포되지 않았다.
- 운영 기준 코드에는 다음 하한이 남아 있었다.
  - `render-settings.js`: 입력 `min="5"`, 렌더 정규화 `Math.max(0.05, ...)`
  - `data.js`: 저장 정규화 `Math.max(0.05, ...)`
- `review-nudge-card`는 `margin-bottom`만 있고 버튼 기본 스타일을 제거하는 카드 스타일이 없었다.

## 판정

- 운영 기준 `origin/main`에서 별도 worktree를 만들어 5% 하한 제거, 검토 대기 카드 CSS, cache-bust를 함께 고친다.
