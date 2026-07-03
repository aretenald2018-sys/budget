# 상세분류 미지정 터치 클릭 실패 진단

## 요청

- Discord 요청: `devreq_discord_1509472073414742107`
- 추가 Discord 요청: `devreq_discord_1509480880790569112`
- 증상: 이전 첨부 이미지의 `상세분류 미지정` 행을 눌러도 상세분류 지정 모달이 열리지 않는다고 보고됨.
- 추가 증상: 같은 행이 클릭 대상이 아니라 일반 텍스트처럼 선택되고 Android 텍스트 선택 메뉴가 뜬다고 보고됨.
- 관련 이전 요청: `devreq_discord_1509461432754770051`

## 재현 기준

- 첨부 이미지는 `생활비용` 카테고리 상세 모달의 `상세분류 요약` 영역이다.
- 타깃 행은 `render-report.js`의 `button.report-subcategory-row.actionable[data-report-action="open-subcategory-classifier"]`로 렌더링된다.

## 원인

`bindReportModal()`의 터치 보강이 `pointerup`에서 즉시 `openSubcategoryClassifier()`를 호출했다. Android/WebView 계열에서는 `pointerup` 뒤 합성 `click`이 이어질 수 있는데, 중첩 모달이 먼저 열린 상태에서 합성 `click`이 새 overlay에 전달되면 새 모달이 바로 닫히거나 무응답처럼 보일 수 있다.

추가 요청 확인 시점의 운영 GitHub Pages는 아직 `app.js?v=20260703-data-auth-singleton`와 `render-report.js?v=20260703-data-auth-singleton`를 로드하고 있었다. 로컬의 `20260703-subcategory-touch-fallback` cache-bust와 지연 fallback 수정이 운영에 배포되지 않아 사용자는 이전 동작을 보고 있었다.

또한 Android/WebView에서 long press가 `selectstart` 또는 `contextmenu`로 이어지면 CSS `user-select: none`만으로는 텍스트 선택 UI가 남을 수 있으므로, 클릭 대상 행에서 해당 기본 동작을 명시적으로 막아야 한다.

## 수정 방향

- `click`/키보드 이벤트는 기존처럼 즉시 처리한다.
- 터치 `pointerup`은 즉시 열지 않고 짧게 지연한 fallback만 예약한다.
- 정상 `click`이 들어오면 예약된 fallback을 취소한다.
- `render-report.js`를 새로 받도록 `index.html`, `app.js`, `render-home.js` cache-bust 문자열을 갱신한다.
- `상세분류 미지정` 액션 대상의 `selectstart`/`contextmenu` 기본 동작을 막아 일반 텍스트 선택 UI가 뜨지 않게 한다.
