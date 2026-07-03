# 운영 보상 적립률/CSS 회귀 실행

## 변경

- `render-settings.js`
  - 적립 배분율 input을 `min="0"`, `step="0.1"`로 변경했다.
  - `normalizeAllocationRate`, `parsePercentInput`, `formatRewardRatePct`를 추가해 0~100% 직접 입력을 0~1 비율로 저장한다.
  - 빈 값은 0%로 저장한다.
- `data.js`
  - `rewardSavings.allocationRate` 저장 정규화 하한을 5%에서 0%로 낮췄다.
- `styles/60-urge.css`
  - `.insight.review.review-nudge-card`를 카드형 버튼으로 스타일링해 기본 버튼 테두리 누출을 막았다.
- `index.html`, `app.js`, `render-home.js`, `render-report.js`, `render-settings.js`, `style.css`
  - 변경 JS/CSS가 운영 브라우저에 로드되도록 cache-bust를 `20260703-reward-rate-css-fix`로 갱신했다.

## 검증

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- `_site` 산출물에서 `min="0"`와 새 cache-bust 확인.

## 배포

- 대상 브랜치: `main`
- 운영 URL: `https://aretenald2018-sys.github.io/budget/`
