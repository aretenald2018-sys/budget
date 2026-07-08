# 설정 예산 카테고리 라벨 줄바꿈 수정

## 요청

첨부 화면의 `설정 -> 예산 & 카테고리` 영역에서 `주거비용` 같은 카테고리명이 `주거 / 비용`처럼 두 줄로 갈라진다. 사용자는 해당 라벨이 한 줄 안에 들어오도록 요청했다.

## 진단

- 실제 대상 앱은 현재 Tomato Farm lite 체크아웃이 아니라 sibling repo `budgetproject`다.
- 화면 하단 탭(`뉴스`, `목표`, `거래`, `검토`)과 `budgetproject/app.js`의 탭 정의가 일치한다.
- `render-settings.js`의 `budgetGoalGroups()`가 예산 row 라벨을 plain `span`으로 렌더한다.
- `styles/00-foundation.css`의 `.budget-goal-row.rhythm.editable`은 `1fr 70px 104px 34px` grid라 모바일 폭에서 label column이 좁아지고, `.budget-goal-row span`에 nowrap/keep-all 계약이 없어 CJK 라벨이 중간 줄바꿈된다.

## 목표

- `주거비용`, `보험비용`, `통신비용`, `교통비용`, `생활비용`, `교육비용`, `카페비용`, `정신건강` 같은 짧은 한국어 카테고리명을 한 줄로 표시한다.
- 숫자 입력, 비용 성격 select, 수정 버튼은 같은 row 안에서 유지한다.
- 긴 라벨은 레이아웃을 밀어내지 않고 말줄임 처리한다.

## 비목표

- 카테고리 데이터 모델, 저장 경로, 자동분류 규칙은 변경하지 않는다.
- 설정 화면 전체 재디자인은 하지 않는다.
- `www`나 `_site` 산출물을 직접 수정하지 않는다.

## 실행 Slice 1

1. RED: 현재 CSS/DOM 계약에서 `budget-goal-label` nowrap 계약이 없어 실패하는 focused proof를 만든다.
2. `render-settings.js`의 예산 row 라벨에 전용 class를 추가한다.
3. `styles/00-foundation.css`의 예산 row grid를 모바일에서 label 우선으로 조정하고, label에 `white-space: nowrap`, `word-break: keep-all`, `overflow: hidden`, `text-overflow: ellipsis`를 적용한다.
4. 수정한 CSS가 배포 브라우저에 갱신되도록 `style.css` import query와 `index.html` stylesheet query를 갱신한다.
5. `npm.cmd run verify`, `npm.cmd run pages:build`, 모바일 browser visual QA를 수행한다.

## 검증 계획

- RED: focused source/layout proof가 현재 코드에서 실패한다.
- GREEN: 같은 proof가 통과한다.
- PASS: `npm.cmd run verify`.
- PASS: `npm.cmd run pages:build`.
- PASS: 390px 이하 모바일 browser QA에서 예산 row 라벨 `주거비용`이 한 줄이고, `생활비용`, `정신건강`도 두 줄로 갈라지지 않는다.
- Production deploy는 이 세션에서 commit/push가 안전할 때만 진행한다. 배포하지 못하면 `not verified yet`와 정확한 blocker를 기록한다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-08-settings-budget-label-nowrap.md`의 Slice 1만 실행한다. 변경 범위는 `render-settings.js`, `styles/00-foundation.css`, `style.css`, `index.html`, focused proof/QA artifact로 제한한다.
