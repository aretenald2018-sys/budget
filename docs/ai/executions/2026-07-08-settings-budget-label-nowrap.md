# 설정 예산 라벨 한 줄 표시 실행 기록

## 범위

- 계획: `docs/ai/features/2026-07-08-settings-budget-label-nowrap.md`
- 실행 슬라이스: Slice 1 `settings budget row label nowrap`
- 대상 화면: 설정 탭 예산 카테고리 row
- 목표: `주거비용`, `보험비용`, `통신비용`, `교통비용`, `생활비용`, `교육비용`, `카페비용`, `정신건강` 라벨이 모바일 row에서 한 줄로 유지된다.

## RED 증거

- 실행: `node .omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-check.mjs red`
- 결과: 실패 확인
- 증거:
  - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-red.json`
  - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-red.png`
- 실패 내용: 390x844 Chrome fixture에서 8개 라벨이 모두 전용 class/one-line 조건을 만족하지 않았다.

## 구현

- `render-settings.js`
  - 예산 row 카테고리명 span에 `budget-goal-label` class를 추가했다.
- `styles/00-foundation.css`
  - `.budget-goal-row.rhythm.editable` grid의 고정 폭을 줄이고 label column을 `minmax(88px, 1fr)`로 유지했다.
  - `.budget-goal-label`에 `white-space: nowrap`, `word-break: keep-all`, `overflow: hidden`, `text-overflow: ellipsis`를 추가했다.
  - 숫자 input/select에 `min-width: 0`을 추가해 좁은 grid에서도 control이 row를 밀지 않게 했다.
- `style.css`, `index.html`
  - foundation CSS와 top-level stylesheet cache-bust query를 `20260708-budget-label-nowrap`로 갱신했다.

## 검증

- 소스 계약:
  - `.omo/evidence/budget-label-nowrap-20260708/source-contract-after.txt`
  - 결과: `render-settings` class, foundation nowrap/keep-all/ellipsis, editable grid, cache-bust 모두 `PASS`
- 모바일 브라우저 QA:
  - 실행: `node .omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-check.mjs after`
  - 조건: Chrome headless 390x844, 실제 `style.css`와 settings budget row HTML 사용
  - 결과: `failures=0`, `labelClassCount=8`, 모든 label `oneLine=true`
  - 증거:
    - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-after.json`
    - `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-after.png`
- 프로젝트 검증:
  - `npm.cmd run verify`: 통과, `verify-project passed (96 JS files checked).`
  - `npm.cmd run pages:build`: 통과, `_site` artifact 생성
- Production 배포/asset 검증:
  - commit: `c352348 Keep settings budget labels on one line`
  - GitHub Pages workflow: `28923720497`, `success`
  - production URL: `https://aretenald2018-sys.github.io/budget/`
  - production HTML: HTTP 200, `style.css?...settings=20260708-budget-label-nowrap` 포함
  - production CSS: HTTP 200, `budget-goal-label` 및 nowrap/keep-all/ellipsis 계약 포함
  - production JS: HTTP 200, `render-settings.js`에 `budget-goal-label` 포함
- Production 설정 row UI:
  - `not verified yet`
  - blocker: headless QA profile에 Firebase 로그인 세션/테스트 계정이 없어 실제 설정 탭 예산 카테고리 row가 렌더되지 않았다.

## 후속 리뷰 포인트

- 로그인된 production Pages에서 설정 탭 진입 후 예산 row 라벨이 한 줄인지 확인한다.
- `style.css`와 `index.html` cache-bust는 production HTML에 반영됐다.
