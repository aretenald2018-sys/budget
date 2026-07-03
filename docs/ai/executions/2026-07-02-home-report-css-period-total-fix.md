# 홈 리포트 CSS 및 기간 금액 기준 수정 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-home-report-css-period-total-fix.md`
- 슬라이스: 실행 슬라이스 1 - 홈 hero 기준 및 상세 시트 CSS 복구

## 변경 내용

- `render-report.js`
  - 홈 모드에서는 `이번 달` hero 헤드라인도 `controlCategories` 기준으로 계산하게 변경했다.
  - 홈 월간 hero 라벨을 `${monthKey} 조절비`로 바꿨고, 보조 게이지는 `이번 달 전체 지출`로 표시하게 했다.
  - 리포트 탭의 월간 전체 지출 기준은 유지했다.
- `styles/60-urge.css`
  - 홈 hero 보조 게이지의 라벨/금액 영역에 전용 flex 스타일, `word-break: keep-all`, 금액 `nowrap` 처리를 추가했다.
  - 좁은 화면에서는 보조 금액을 다음 줄 전체 폭으로 내려 깨진 단위 줄바꿈을 피하게 했다.
- `styles/20-records.css`
  - 카테고리 상세 시트의 요약, 거래 행, 금액, 아이콘, `환급처리` 체크 UI 스타일을 추가했다.
  - Android/WebView 호환을 위해 커스텀 체크박스에 `-webkit-appearance: none`을 함께 지정했다.
- `style.css`, `index.html`, `app.js`, `render-home.js`
  - `20260702-home-report-period-fix` cache-busting query를 연결했다.

## 검증

- `node --check render-report.js; node --check render-home.js; node --check app.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)
- `npm.cmd run pages:build`: 통과 (`_site` 생성)
- `_site` 아티팩트 확인:
  - `_site/index.html`: `style.css?v=20260702-home-report-period-fix`, `app.js?v=20260702-home-report-period-fix`
  - `_site/app.js`: `render-home.js?v=20260702-home-report-period-fix`, `render-report.js?v=20260702-home-report-period-fix`
  - `_site/render-report.js`: `heroCategories`, `이번 달 전체 지출`, `report-refund-check`
  - `_site/styles/20-records.css`: `report-tx-row`, `report-refund-check`, `-webkit-appearance`
  - `_site/styles/60-urge.css`: `report-hero-secondary-head`
- `git diff --check -- ...`: 통과

## 미검증

- not verified yet: 로그인된 실제 홈 UI에서 `이번 2주`/`이번 달` 토글과 카테고리 상세 시트를 직접 조작하는 브라우저 검증은 수행하지 못했다.
- not verified yet: 운영 GitHub Pages 배포 확인은 수행하지 않았다. 현재 작업트리에 이 작업과 무관한 dirty 변경이 다수 있어 안전하게 커밋/푸시할 수 없다.

## 변경 파일

- `render-report.js`
- `styles/60-urge.css`
- `styles/20-records.css`
- `style.css`
- `render-home.js`
- `app.js`
- `index.html`
- `docs/ai/features/2026-07-02-home-report-css-period-total-fix.md`
- `docs/ai/executions/2026-07-02-home-report-css-period-total-fix.md`
- `docs/ai/NEXT_ACTION.md`
