# 설정 예산 라벨 한 줄 표시 리뷰

## 판정

- Overall: `PASS`
- 코드/로컬 QA: `PASS`
- Production 배포/asset 검증: `PASS`
- Production 설정 row UI 검증: `not verified yet`
- 근거: 390x844 Chrome fixture에서 실제 `style.css`를 로드해 라벨 8개가 모두 `oneLine=true`임을 확인했고, `npm.cmd run verify`와 `npm.cmd run pages:build`가 통과했다. `c352348` 배포 workflow `28923720497`는 성공했고 production HTML/CSS/JS asset도 새 cache-bust와 label/nowrap 계약을 반환한다. 단, headless production QA profile에는 Firebase 로그인 세션과 카테고리 데이터가 없어 실제 설정 탭 예산 row는 직접 확인하지 못했다.

## 리뷰 범위

- 계획: `docs/ai/features/2026-07-08-settings-budget-label-nowrap.md`
- 실행: `docs/ai/executions/2026-07-08-settings-budget-label-nowrap.md`
- ULW: `.omo/ulw-loop/budget-label-nowrap-20260708/goals.json`
- 주요 변경 파일:
  - `render-settings.js`
  - `styles/00-foundation.css`
  - `style.css`
  - `index.html`

## 목표 검증

- 카테고리 라벨 전용 선택자: `PASS`
  - `render-settings.js`가 category label span에 `budget-goal-label`을 렌더링한다.
- 모바일 한 줄 표시: `PASS`
  - 390x844 fixture에서 `주거비용`, `보험비용`, `통신비용`, `교통비용`, `생활비용`, `교육비용`, `카페비용`, `정신건강` 모두 한 줄이다.
- 인접 control 유지: `PASS`
  - 같은 row에 금액 input, rhythm select, edit button이 유지된다.
- cache-bust: `PASS`
  - `style.css` import와 `index.html` stylesheet query를 갱신했다.

## 코드 리뷰

- 변경은 설정 예산 row의 markup/CSS에 한정돼 있다.
- grid 고정 폭을 줄이되 label column은 최소 폭을 보장한다.
- 긴 label은 ellipsis로 처리돼 row 높이를 늘리지 않는다.
- 새 dependency, framework, Firestore 변경 없음.

## QA 증거

- RED:
  - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-red.json`
  - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-red.png`
- AFTER:
  - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-after.json`
  - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-after.png`
  - `.omo/evidence/budget-label-nowrap-20260708/source-contract-after.txt`
- 명령:
  - `npm.cmd run verify`: 통과
  - `npm.cmd run pages:build`: 통과
- Production:
  - commit: `c352348 Keep settings budget labels on one line`
  - GitHub Pages workflow: `28923720497`, `success`
  - URL: `https://aretenald2018-sys.github.io/budget/`
  - production HTML: `style.css?...settings=20260708-budget-label-nowrap` 포함
  - production CSS: `styles/00-foundation.css?v=20260708-budget-label-nowrap` HTTP 200, `budget-goal-label`, `white-space: nowrap`, `word-break: keep-all`, `text-overflow: ellipsis` 포함
  - production JS: `render-settings.js` HTTP 200, `budget-goal-label` 포함

## 남은 차단점

- Production 설정 row UI 검증은 아직 수행하지 못했다. headless QA profile에 Firebase 로그인 세션/테스트 계정이 없어 `https://aretenald2018-sys.github.io/budget/`에서 설정 탭의 실제 예산 카테고리 row가 렌더되지 않았다. 사용자의 로그인된 브라우저에서 `설정 -> 예산 & 카테고리`로 들어가 `주거비용`, `보험비용`, `통신비용` 등이 한 줄인지 확인해야 한다.

## 결론

로컬 구현, 모바일 브라우저 QA, production 배포, production asset 확인은 통과했다. Production의 인증된 설정 row 화면만 `not verified yet`이며, blocker는 로그인 세션/테스트 계정 부재다.
