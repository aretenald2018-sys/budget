# 홈 이번 2주 시작일 설정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-06-01-home-biweekly-start-date.md`
- 슬라이스: 슬라이스 1 - 홈에서 격주 시작일 저장 및 적용
- 변경 파일:
  - `utils/cycles.js`
  - `data.js`
  - `render-report.js`
  - `render-home.js`
  - `app.js`
  - `index.html`
  - `style.css`
  - `styles/60-urge.css`
  - `docs/ai/NEXT_ACTION.md`
  - `docs/ai/features/2026-06-01-home-biweekly-start-date.md`

## findings

- 차단 이슈 없음.

## 확인 내용

- 저장 필드 `biweeklyStartDate`는 `data.js`의 앱 설정 정규화를 거쳐 Firestore `users/{uid}/settings/app`에 merge 저장된다.
- 홈과 리포트의 `cycleTxs` 조회는 모두 `cycleRangeForDate(new Date(), biweeklyStartDate)` 결과를 사용한다.
- 홈 hero의 날짜 form 저장 후 `localStorage`, 앱 헤더, 현재 report render가 같은 시작일로 갱신된다.
- Firestore 설정에 시작일이 없으면 stale `localStorage` 값을 제거해 이전 사용자/초기 상태의 anchor가 남지 않게 했다.
- `render-report.js`, `render-home.js`, `app.js`, `index.html`, `style.css`의 cache-busting query string은 `20260601-biweekly-start`로 갱신됐다.
- 월간 모드는 기존처럼 `monthRange(monthKey)`와 월간 목표를 사용하며 격주 시작일 설정과 분리되어 있다.

## 검증

- `node --check utils/cycles.js`: 통과
- `node --check data.js`: 통과
- `node --check render-report.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 95 JS files checked)
- `npm.cmd run pages:build`: 통과 (`_site` Pages artifact 생성)
- `git diff --check`: 통과
- anchor 스모크 테스트: `2026-05-26` 시작일 기준 `2026-06-01`은 `5/26–6/8`, `2026-05-25`는 `5/12–5/25`로 계산됨.

## 남은 검증

- not verified yet: 실제 로그인 세션에서 홈의 date input 저장, Firestore 반영, 카테고리 drilldown 건수 일치까지는 배포본에서 수동 확인이 필요하다.
