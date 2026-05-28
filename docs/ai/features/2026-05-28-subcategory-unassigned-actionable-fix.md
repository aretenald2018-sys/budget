# 상세분류 미지정 텍스트 행 수정 계획

## 요청

- Discord 요청: `devreq_discord_1509480880790569112`
- 첨부 화면에서 `생활비용` 상세 모달의 `상세분류 미지정` 요약 행이 눌러서 모달을 열어야 하는데 Android 텍스트 선택처럼 잡힌다고 보고했다.

## `/diagnose`

### 확인한 증상

- 스크린샷에는 `상세분류 미지정` 텍스트가 OS 선택 상태로 잡혀 있고, 요약 행 우측에 클릭 가능 표시인 chevron이 보이지 않는다.
- 현재 `render-report.js`는 `subcategorySummaryRowHtml()`에서 `STATE.activeDrill?.type === 'category'`이고 행 이름이 `상세분류 미지정`일 때만 `button.report-subcategory-row.actionable`을 렌더링한다.
- 따라서 클릭 이벤트 보강 이전에, 일부 렌더링 경로에서 미지정 행이 `div.report-subcategory-row` 일반 텍스트 행으로 떨어질 수 있는지가 핵심이다.

### 재현/피드백 루프

- 정적 재현: `subcategorySummaryHtml()`을 호출할 때 명시적인 문맥 인자를 넘기지 않고 전역 `STATE.activeDrill`에 의존하는 구조를 코드로 확인한다.
- 수정 후 코드 검증:
  - 카테고리 상세 모달 렌더링 경로가 `subcategorySummaryHtml(txs, { actionableUnassigned: true })`처럼 명시적으로 버튼 렌더링을 요청하는지 확인한다.
  - 환급 모달은 기존처럼 미지정 행을 일반 요약 행으로 유지하는지 확인한다.
  - `node --check render-report.js`, `npm.cmd run verify`, `git diff --check`.
- 실제 UI 검증:
  - 정상 터미널에서 앱을 열고 `생활비용` 상세 모달의 `상세분류 미지정` 행이 버튼/chevron으로 표시되고 탭 시 `상세분류 지정` 시트가 열리는지 확인한다.

### 가설

1. `subcategorySummaryRowHtml()`이 전역 `STATE.activeDrill`에 의존해, 렌더링 시점이나 다른 호출 경로에서 카테고리 문맥이 어긋나면 일반 `div`로 출력된다.
2. 이전 이벤트 보강은 이미 버튼인 행의 탭 처리를 강화했지만, 애초에 버튼으로 렌더링되지 않는 경우에는 효과가 없다.
3. 배포/캐시가 오래된 경우도 가능하므로 JS cache-bust 문자열을 다시 갱신해야 한다.
4. CSS 선택 방지 자체는 `.actionable`에만 걸려 있어, 일반 `div`로 떨어진 행은 OS 텍스트 선택을 막지 못한다.

## 실행 슬라이스

### 슬라이스 1: 미지정 요약 행 버튼 렌더링 문맥 명시

- `render-report.js`
  - `subcategorySummaryHtml()`과 `subcategorySummaryRowHtml()`에 명시적인 옵션을 추가한다.
  - `openReportCategoryTxs()`는 `상세분류 미지정` 행을 항상 actionable 버튼으로 요청한다.
  - `openReportReimbursementTxs()`는 환급 모달의 기존 읽기 전용 요약 동작을 유지한다.
- `app.js`, `render-home.js`, `index.html`
  - `render-report.js`와 `app.js` cache-bust query를 새 값으로 갱신한다.

## 제외

- 상세분류 저장 로직 변경
- 환급처리 로직 변경
- 카테고리/상세분류 스키마 변경
- 리포트 화면 전체 디자인 변경

## 완료 기준

- `생활비용` 카테고리 상세 모달에서 `상세분류 미지정` 행이 전역 상태에 의존하지 않고 버튼으로 렌더링된다.
- 버튼 행은 기존 위임 이벤트로 `상세분류 지정` 모달을 연다.
- 정적 검증과 프로젝트 검증이 통과한다.
- 실제 Android UI 검증이 불가하면 `not verified yet`와 필요한 확인을 명시한다.

## 실행 결과

- 상태: 실행 완료
- 구현 파일: `render-report.js`, `app.js`, `render-home.js`, `index.html`
- 문서 파일: `docs/ai/features/2026-05-28-subcategory-unassigned-actionable-fix.md`, `docs/ai/NEXT_ACTION.md`
- 변경 요약:
  - 카테고리 상세 모달은 `subcategorySummaryHtml(txs, { actionableUnassigned: true })`를 호출해 `상세분류 미지정` 행의 버튼 렌더링을 명시한다.
  - 환급 모달은 `actionableUnassigned: false`로 기존 읽기 전용 요약 행을 유지한다.
  - `subcategorySummaryRowHtml()`의 버튼 판정에서 전역 `STATE.activeDrill` 의존을 제거했다.
  - `index.html`, `app.js`, `render-home.js`의 JS cache-bust 문자열을 `20260528-subcategory-actionable-fix`로 갱신했다.
- 검증:
  - `node --check render-report.js`: 통과
  - `node --check app.js`: 통과
  - `node --check render-home.js`: 통과
  - `npm.cmd run verify`: 통과
  - `git diff --check`: 통과
- 실제 Android UI 검증: not verified yet. 이 환경에서는 정상 터미널의 장기 dev server나 실제 Android WebView를 열어 탭 동작을 확인하지 않았다.
