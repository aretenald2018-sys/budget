# 홈 금액 기준 설명 및 변동비 게이지 복구 계획

## 요청

- 홈 hero의 `266,890원`과 `376,890원`이 왜 다른지 확인한다.
- 두 금액이 일치해야 하는지, 다른 것이 정상인지 판단한다.
- 변동비 목록에서 사용 금액만큼 게이지가 색칠되던 효과가 사라진 원인을 고치고 복구한다.

## 진단 결과

- 진단 문서: `docs/ai/diagnoses/2026-07-02-home-amount-gauge-fill.md`
- 현재 금액 차이는 데이터 오류가 아니라 범위 차이다.
  - `266,890원`: 고정비 제외 조절비
  - `376,890원`: 고정비 포함 전체 지출
  - 차액 `110,000원`: 고정비 포함분
- 따라서 현재 데이터 기준으로 두 금액이 반드시 일치할 필요는 없다.
- 다만 문구는 더 명확해야 한다.
- 게이지 색칠은 `.gauge-fill` span의 박스 스타일 누락으로 인해 보이지 않는 CSS 회귀다.

## 실행 슬라이스 1

### 범위

- `render-report.js`
  - 홈 월간 hero 보조 지표 라벨을 `고정비 포함 전체 지출`로 변경한다.
- `styles/60-urge.css`
  - `.tds-progress-fill`, `.gauge-fill`이 트랙 높이와 폭을 실제로 채우도록 `display`, `height`, `transform-origin`을 보강한다.
- cache-busting query를 갱신한다.
- 운영 GitHub Pages에 배포하고 production HTTP 응답을 확인한다.

### 제외

- 거래 데이터 수정
- 카테고리 rhythm/target 정책 변경
- 조절비와 전체 지출을 강제로 같은 값으로 맞추는 변경

## 검증

- `node --check render-report.js`
- `node --check render-home.js`
- `node --check app.js`
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- `_site`에서 새 cache-bust, `고정비 포함 전체 지출`, `.gauge-fill` 박스 스타일 확인
- `main` push 후 `Deploy GitHub Pages` workflow 성공 확인
- production에서 `/budget/`, `app.js`, `render-report.js`, `styles/60-urge.css` HTTP `200` 및 변경 문자열 확인

## 실행 결과

- 상태: 실행/리뷰 완료
- 실행 문서: `docs/ai/executions/2026-07-02-home-amount-gauge-fill.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-02-home-amount-gauge-fill-review.md`
- 보조 지표 라벨을 `고정비 포함 전체 지출`로 바꿨다.
- `.tds-progress-fill`, `.gauge-fill`에 `display:block`, `height:100%`, `transform-origin:left center`를 추가하고 트랙 overflow를 막았다.
- `verify`, `pages:build`, `_site` 문자열 확인은 통과했다.
- 운영 Pages 배포 완료: commit `a655146`, `Deploy GitHub Pages` run `28570018563` 성공.
- production HTTP 확인 완료: `/budget/`, `app.js`, `render-report.js`, `styles/60-urge.css` 모두 `200`; 새 cache-bust와 변경 문자열 반영.
