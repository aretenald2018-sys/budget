# 운영 보상 적립률/CSS 회귀 리뷰

## 결과

배포 전 코드 기준 차단 이슈 없음.

## 확인한 점

- `render-settings.js`와 `data.js` 모두 5% 하한을 제거했다.
- 홈 경로 `app.js -> render-home.js -> render-report.js -> data.js`의 cache-bust가 새 버전으로 이어진다.
- 설정 경로 `app.js -> render-settings.js -> data.js`의 cache-bust가 새 버전으로 이어진다.
- `review-nudge-card`는 `appearance: none`, border/background/font/text-align을 명시해 기본 버튼 UI가 새지 않는다.

## 남은 확인

- GitHub Pages workflow 완료 뒤 운영 HTML/JS/CSS가 새 cache-bust를 반환하는지 확인한다.
- 로그인된 운영 UI에서 적립 배분율 1% 또는 0.5% 저장 후 다시 열었을 때 값이 유지되는지 확인한다.
