# 상세분류 미지정 클릭 이벤트 보강 계획

## 요청

- Discord 요청: `devreq_discord_1509472073414742107`
- 사용자가 이전 첨부 화면의 `미분류`가 클릭되지 않는다고 보고했다.
- 이전 첨부 이미지를 확인한 결과 화면은 `생활비용` 카테고리 상세 모달이며, 실제 타깃은 `상세분류 미지정` 요약 행이다.

## 진단

### 재현/피드백 루프

- 코드 확인: `render-report.js`의 `subcategorySummaryRowHtml()`은 `상세분류 미지정` 행을 `button.report-subcategory-row.actionable`로 렌더링한다.
- 이벤트 확인: `bindReportModal()`은 모달에 위임된 `click` 이벤트에서 `[data-report-action="open-subcategory-classifier"]`를 찾아 `openSubcategoryClassifier()`를 호출한다.
- 배포 확인 루프: 수정 후 `npm.cmd run verify`, `git diff --check`, GitHub Pages 배포본 HTTP 200 및 새 cache-bust 문자열 포함 여부를 확인한다.

### 가설

1. 모바일/WebView에서 행 내부 텍스트를 누를 때 이벤트 타깃이 일반 Element가 아니면 기존 `event.target.closest()` 경로가 무시될 수 있다.
2. 이전 수정은 텍스트 선택 방지 CSS 중심이라, 이미 캐시된 `app.js`/`render-report.js`를 보는 사용자는 JS 클릭 수정이 반영되지 않았을 수 있다.
3. `상세분류 미지정` 행은 버튼이지만 시트 안 동적 렌더링 영역이라 위임 핸들러가 실패하면 별도 fallback 없이 무응답처럼 보인다.

## 실행 슬라이스

### 슬라이스 1: 상세분류 미지정 모바일 탭 이벤트 보강

- `render-report.js`
  - `[data-report-action]` 탐색을 Element/Text node 모두 처리하는 helper로 통일한다.
  - 모바일 탭에서 합성 click이 누락되거나 늦게 들어오는 경우를 줄이기 위해 비마우스 `pointerup` fallback을 추가한다.
  - `report-category-modal`과 상세분류 지정 모달의 위임 이벤트가 같은 helper를 사용하게 한다.
- `app.js`, `render-home.js`, `index.html`
  - `render-report.js`/`app.js` cache-bust query를 새 값으로 갱신한다.

## 제외

- 새 상세분류 관리 기능 추가
- 카테고리 스키마 변경
- 거래 자동분류 로직 변경

## 완료 기준

- `상세분류 미지정` 행 탭이 `openSubcategoryClassifier()`로 연결된다.
- `npm.cmd run verify`가 통과한다.
- GitHub Pages 배포본이 새 JS cache-bust 문자열을 반환한다.
- 실제 Android 터치 검증은 이 환경에서 불가하면 `not verified yet`로 명시한다.
