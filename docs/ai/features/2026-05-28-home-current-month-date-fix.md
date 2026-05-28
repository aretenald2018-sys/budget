# 홈 이번 달 날짜 오염 수정 계획

## 요청

- Discord 요청 `devreq_discord_1509523683583070288`
- 요청자: 피노
- 증상: 현재 2026년 5월인데 홈 화면의 `이번 달` 카드가 `2026-03 지출 합계`, `2026-03 · 전체`로 표시된다.
- 첨부 스크린샷: `docs/ai/inbox/requests/devreq_discord_1509523683583070288/attachments/01-Screenshot_20260528_204752.jpg`

## 진단 결과

- 홈은 `render-home.js`에서 `renderReport({ rootSelector: '#tab-home', homeMode: true })`를 호출해 리포트 렌더러를 재사용한다.
- `render-report.js`의 `STATE.monthKey`는 모듈 전역 상태이며 리포트 탭과 홈 탭이 공유한다.
- `window.reportMonthShift()` 또는 리포트 탭의 과거 월 탐색으로 `STATE.monthKey`가 `2026-03`이 되면, 홈의 `이번 달` 카드도 같은 값을 사용한다.
- 홈 상단 격주 라벨은 `new Date()` 기반이라 5월 현재 격주를 표시하지만, 월간 카드만 전역 `monthKey`를 사용해 서로 다른 기준이 섞인다.

## 가설

1. 홈과 리포트가 같은 `STATE.monthKey`를 공유해 리포트의 과거 월 상태가 홈에 노출된다.
2. 홈 상단 화살표가 `reportMonthShift()`를 호출해 홈에서도 월 상태를 과거로 이동시킬 수 있다.
3. 앱이 오래 열린 상태에서 날짜가 바뀌면 모듈 초기화 시점의 `monthKey`가 남을 수 있다.

## 실행 슬라이스

### 슬라이스 1: 홈 기준 월을 현재 월로 고정

- 상태: 실행 완료
- 범위:
  - `render-report.js`에서 홈 렌더링 시 사용하는 `monthKey`를 매 렌더 현재 월로 계산한다.
  - 홈 모드의 월 이동 버튼은 과거 월로 상태를 이동시키지 않게 막는다.
  - 리포트 탭의 월 이동 기능은 기존처럼 유지한다.
  - 수정된 JS가 배포본에서 갱신되도록 `render-home.js`, `app.js`, `index.html`의 cache-busting query string을 갱신한다.
- 수정하지 말 것:
  - 거래 데이터 파싱/저장 로직
  - 카테고리 목표 계산 방식
  - 홈/리포트 전체 디자인 개편
- 검증:
  - `node --check render-report.js`
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - 로컬 정적 서버에서 `/` HTTP 200 확인
  - DOM/브라우저 루프로 `STATE.monthKey`를 2026-03으로 오염시킨 뒤 홈 렌더링의 월간 카드가 현재 월 `2026-05`를 표시하는지 확인
- 완료 기준:
  - 홈 `이번 달` 카드는 현재 날짜 기준 `YYYY-MM`를 표시한다.
  - 리포트 탭에서 과거 월을 선택해도 홈으로 돌아오면 현재 월 기준으로 표시된다.
  - 리포트 탭의 과거 월 탐색은 회귀하지 않는다.

## 다음 실행 시작점

`render-report.js`의 홈 렌더 기준 월과 `reportMonthShift()` 홈 모드 동작을 수정한 뒤 cache-bust를 갱신하고 검증한다.

## 실행 결과

- `render-report.js`에서 홈 모드 렌더링에 쓰는 `monthKey`를 매번 현재 날짜 기준으로 계산하게 했다.
- 홈 모드에서 `reportMonthShift()`가 리포트용 전역 `STATE.monthKey`를 변경하지 않도록 막았다.
- `app.js`, `render-home.js`, `index.html`의 JS cache-busting query string을 `20260528-home-current-month-fix`로 갱신했다.

## 검증 결과

- `node --check render-report.js`: 통과
- `node --check render-home.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 96 JS files checked)
- `npm.cmd run pages:build`: 통과 (`_site` Pages artifact 생성)
- `git diff --check`: 통과
- 임시 로컬 정적 서버 `http://127.0.0.1:5501/`: HTTP 200 확인 후 종료
- 격리 DOM/모듈 스모크 테스트: 리포트 월 상태를 `2026-03`으로 오염시킨 뒤 홈 `이번 달` 렌더링이 `2026-05 지출 합계`, `2026-05 · 28일째`를 표시하고, 홈 모드 월 이동이 `2026-03`을 다시 만들지 않음을 확인
- not verified yet: in-app browser `iab`가 현재 세션에서 제공되지 않아 실제 로그인 세션 화면 클릭 검증은 수행하지 못했다.
