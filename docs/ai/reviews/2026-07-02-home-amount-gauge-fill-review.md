# 홈 금액 기준 설명 및 변동비 게이지 복구 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-02-home-amount-gauge-fill.md`
- 실행: `docs/ai/executions/2026-07-02-home-amount-gauge-fill.md`
- 주요 변경 파일:
  - `render-report.js`
  - `styles/60-urge.css`
  - `style.css`
  - `render-home.js`
  - `app.js`
  - `index.html`

## 결과

- 발견된 차단 이슈: 없음
- 금액 정책은 바꾸지 않았다. `266,890원`은 고정비 제외 조절비, `376,890원`은 고정비 포함 전체 지출이다.
- 라벨은 `고정비 포함 전체 지출`로 바뀌어 두 숫자가 다른 범위임을 더 직접적으로 보여준다.
- `.gauge-fill`은 이제 block + height 100%를 갖기 때문에 inline span의 width가 무시되는 문제가 사라진다.
- `.tds-progress-fill`은 `width:100%`와 기존 transform 기반 진행률이 같이 동작한다.
- cache-busting 연결은 `index.html` → `app.js` → `render-home.js`/`render-report.js`, `index.html` → `style.css` → `styles/60-urge.css`로 맞다.

## 검증 확인

- `node --check render-report.js; node --check render-home.js; node --check app.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site` 문자열 확인: 통과
- `git diff --check -- ...`: 통과

## 남은 리스크

- production deploy 후 운영 HTTP 응답과 GitHub Pages workflow를 확인해야 한다.
- 로그인된 실제 홈 UI에서 게이지 색칠이 보이는지는 사용자 세션에서 확인해야 한다.
