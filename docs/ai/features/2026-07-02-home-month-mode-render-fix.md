# 홈 이번 달 전환 렌더 모드 고정 계획

## 요청

- 홈 화면에서 `이번 달` 버튼을 누르면 히어로 영역 CSS가 깨지고 리포트 탭처럼 보이는 문제를 고친다.
- `월 MAX 게이지` 카드의 금액/퍼센트 텍스트가 오른쪽에서 잘리는 문제도 같이 고친다.
- 리포트 탭 본문이 스피너에 머무르는 중복 `report-body` 문제도 같이 고친다.

## 진단

- 증상 화면에는 홈용 `2026-07 조절비`가 아니라 리포트용 `2026-07 지출 합계`, `장기 방향` 카드가 홈 영역에 렌더링된다.
- 즉 CSS 파일 자체가 깨진 것이 아니라, 공용 `reportViewMode()`가 공유 `STATE.rootSelector`/`STATE.homeMode`에 의존하면서 홈 버튼 클릭 시 리포트 모드로 다시 그려지는 회귀다.
- 홈과 리포트가 같은 `id="report-body"`를 만들고 전역 selector로 본문을 채워, 리포트 탭 body가 아닌 홈 body가 갱신될 수 있다.
- `월 MAX 게이지`는 `20-records.css`의 기존 `.budget-gauge-row.actionable { width: 100%; }`와 `60-urge.css`의 좌우 margin이 합쳐져 행이 카드 폭보다 넓어지는 CSS 회귀다.

## 결정

- 홈의 `이번 2주`/`이번 달` 버튼은 항상 `#tab-home`, `homeMode=true`로 렌더링되게 한다.
- 리포트 탭 버튼은 `#tab-report`, `homeMode=false`로 렌더링되게 한다.
- `report-body`는 중복 id 대신 `.report-body[data-report-body]`로 만들고, 현재 root 안에서만 찾아 채운다.
- 월 MAX 게이지 행은 카드 안에서 폭이 계산되도록 `width:auto`, `box-sizing:border-box`, `min-width:0`를 명시한다.
- JS 렌더 경로와 CSS/JS cache bust를 함께 갱신한다.

## 실행 슬라이스

- 수정 파일: `render-report.js`, `render-home.js`, `styles/50-cart-detail.css`, `styles/60-urge.css`, `style.css`, `app.js`, `index.html`, 문서.
- 검증:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - `_site`에서 홈 mode 버튼 onclick이 `#tab-home,true`를 포함하는지 확인
  - `_site`에서 `id="report-body"`가 제거되고 `[data-report-body]`가 반영됐는지 확인
  - 운영에서 홈 `이번 달` 클릭 후 히어로가 홈 카드 스타일과 홈 문구를 유지하는지 확인
  - 운영에서 `월 MAX 게이지` 금액/한도와 퍼센트가 카드 오른쪽에서 잘리지 않는지 확인
