# 홈 금액 기준 설명 및 변동비 게이지 복구 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-home-amount-gauge-fill.md`
- 슬라이스: 실행 슬라이스 1

## 변경 내용

- `render-report.js`
  - 홈 월간 hero 보조 지표 라벨을 `이번 달 전체 지출`에서 `고정비 포함 전체 지출`로 변경했다.
  - 금액 계산 정책은 유지했다. 큰 금액은 고정비 제외 조절비, 보조 지표는 고정비 포함 전체 지출이다.
- `styles/60-urge.css`
  - `.tds-progress`, `.gauge-track`에 `overflow: hidden`을 추가했다.
  - `.tds-progress-fill`, `.gauge-fill`에 `display: block`, `height: 100%`, `transform-origin: left center`를 추가했다.
  - `.tds-progress-fill`은 transform 기반 진행률을 위해 `width: 100%`를 명시했다.
- `style.css`, `render-home.js`, `app.js`, `index.html`
  - `20260702-home-gauge-fill` cache-busting query를 연결했다.

## 검증

- `node --check render-report.js`: 통과
- `node --check render-home.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)
- `npm.cmd run pages:build`: 통과
- `_site` 확인:
  - `20260702-home-gauge-fill` cache-bust 반영
  - `render-report.js`: `고정비 포함 전체 지출`
  - `styles/60-urge.css`: `.gauge-fill`의 `display: block`, `height: 100%`, `transform-origin`
- `git diff --check -- ...`: 통과

## 운영 확인

- 운영 Pages 배포 완료: commit `a655146`, `Deploy GitHub Pages` run `28570018563` 성공.
- production HTTP 확인 완료: `/budget/`, `app.js`, `render-report.js`, `styles/60-urge.css` 모두 `200`; 새 cache-bust와 변경 문자열 반영.
- 로그인된 실제 홈 UI에서 게이지 색칠이 보이는지 눈으로 확인하는 단계는 별도 사용자 환경 확인이 필요하다.

## 변경 파일

- `render-report.js`
- `styles/60-urge.css`
- `style.css`
- `render-home.js`
- `app.js`
- `index.html`
- `docs/ai/diagnoses/2026-07-02-home-amount-gauge-fill.md`
- `docs/ai/features/2026-07-02-home-amount-gauge-fill.md`
- `docs/ai/executions/2026-07-02-home-amount-gauge-fill.md`
