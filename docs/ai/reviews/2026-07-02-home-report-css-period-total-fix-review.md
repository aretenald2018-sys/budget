# 홈 리포트 CSS 및 기간 금액 기준 수정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-07-02-home-report-css-period-total-fix.md`
- 실행: `docs/ai/executions/2026-07-02-home-report-css-period-total-fix.md`
- 주요 변경 파일:
  - `render-report.js`
  - `styles/60-urge.css`
  - `styles/20-records.css`
  - `style.css`
  - `render-home.js`
  - `app.js`
  - `index.html`

## 결과

- 발견된 차단 이슈: 없음
- 홈 모드에서만 hero 헤드라인 카테고리 기준을 `controlCategories`로 바꿨으므로, 리포트 탭의 월간 전체 지출 기준은 유지된다.
- 홈 월간 카드의 고정비 포함 금액은 `이번 달 전체 지출` 보조 게이지로 내려가, 스크린샷의 `교통비용 110,000원` 같은 고정비가 조절비 헤드라인을 부풀리지 않는다.
- `.report-hero-secondary-head`가 긴 금액을 `nowrap`/좁은 화면 줄 내림으로 처리해 `원` 단위만 떨어지는 깨짐을 피한다.
- `.report-tx-row`, `.report-tx-open`, `.report-refund-check` CSS가 추가되어 카테고리 상세 시트의 거래 행과 환급 체크가 앱 스타일을 갖는다.
- `index.html` → `app.js` → `render-home.js`/`render-report.js`, `index.html` → `style.css` → `styles/20-records.css`/`styles/60-urge.css` cache-busting 연결이 새 값으로 맞다.
- repo root에 `sw.js`가 없어 `STATIC_ASSETS`/`CACHE_VERSION` 갱신 대상은 없다.

## 검증 확인

- `node --check render-report.js; node --check render-home.js; node --check app.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)
- `npm.cmd run pages:build`: 통과
- `_site` 아티팩트에서 새 cache-bust와 변경 문자열 확인
- `git diff --check -- ...`: 통과

## 남은 리스크

- not verified yet: 실제 로그인된 운영 UI에서 홈 `이번 2주`/`이번 달` 토글과 `교통비용` 상세 시트 표시를 직접 조작하지 못했다.
- not verified yet: 운영 GitHub Pages 배포 확인을 하지 못했다. 작업트리에 이 요청과 무관한 dirty 변경이 많아 안전한 커밋/푸시 범위를 확정할 수 없다.
- 이후 날짜가 진행되면 `이번 2주`와 `이번 달`은 기간 범위 차이 때문에 금액이 달라질 수 있다. 이번 수정은 두 모드가 서로 다른 카테고리 기준을 쓰던 문제를 제거한 것이다.
