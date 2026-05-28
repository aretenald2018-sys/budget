# 홈 이번 달 날짜 오염 수정 리뷰

## 리뷰 대상

- 계획: `docs/ai/features/2026-05-28-home-current-month-date-fix.md`
- 슬라이스: 슬라이스 1 - 홈 기준 월을 현재 월로 고정
- 변경 파일: `render-report.js`, `render-home.js`, `app.js`, `index.html`, `docs/ai/features/2026-05-28-home-current-month-date-fix.md`, `docs/ai/NEXT_ACTION.md`

## 결과

- 발견된 차단 이슈: 없음
- `render-report.js`의 홈 렌더링은 이제 리포트 탭의 과거 `STATE.monthKey` 대신 현재 날짜 기준 `monthKey`를 사용한다.
- 홈 모드에서 `reportMonthShift()`가 리포트용 전역 월 상태를 변경하지 않으므로 스크린샷과 같은 `이번 달`/`2026-03` 혼합 표시가 재발하지 않는다.
- 리포트 탭은 기존 `STATE.monthKey`와 월 이동 흐름을 그대로 유지한다.
- `index.html` → `app.js` → `render-home.js`/`render-report.js` cache-busting 경로가 모두 갱신되어 배포본에서 새 JS를 다시 요청한다.

## 검증 확인

- `node --check render-report.js`: 통과
- `node --check render-home.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `git diff --check`: 통과
- 로컬 정적 서버 `/`: HTTP 200 확인
- 격리 DOM/모듈 스모크 테스트: 리포트 월 상태가 `2026-03`이어도 홈 월간 카드가 `2026-05`로 렌더링됨을 확인

## 잔여 리스크

- not verified yet: in-app browser `iab`가 없어 실제 로그인 세션에서 홈 화면을 직접 클릭해 확인하지 못했다.
- 배포는 리뷰 이후 별도 단계에서 GitHub Pages 경로로 진행한다.
