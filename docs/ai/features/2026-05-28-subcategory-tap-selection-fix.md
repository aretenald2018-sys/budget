# 상세분류 요약 터치 선택 방지 계획

## 요청

- Discord 요청: `devreq_discord_1509471977742536756`
- 첨부만 전달된 요청이며, 스크린샷에는 카테고리 상세 모달의 `상세분류 미지정` 요약 행 텍스트가 Android 텍스트 선택 상태로 잡히고 OS 선택 툴바가 뜬 화면이 보인다.

## `/diagnose`

### 확인한 증상

- 사용자는 `상세분류 미지정` 행을 눌러 분류 모달을 열려는 흐름에서 텍스트가 선택되는 상태를 캡처한 것으로 보인다.
- `render-report.js`는 해당 행을 `button.report-subcategory-row.actionable`로 렌더링하고 `data-report-action="open-subcategory-classifier"` 위임 리스너로 모달을 연다.
- `styles/20-records.css`의 해당 버튼에는 `user-select`, `-webkit-user-select`, `-webkit-touch-callout`, `touch-action` 방지가 없다.

### 가설

1. 모바일 WebView/Chrome에서 버튼 내부 텍스트가 길게 눌리거나 터치 지연이 생기며 선택되는 것이 1차 원인이다.
2. 클릭 핸들러 누락은 가능성이 낮다. 버튼과 위임 리스너가 이미 연결되어 있다.
3. 모달 z-index나 마운트 위치 문제는 스크린샷 증상과 맞지 않는다.
4. 이전 CSS가 캐시에 남으면 수정이 반영되지 않을 수 있으므로 캐시 버스트 문자열 갱신이 필요하다.

## 실행 슬라이스 1

### 목표

`상세분류 미지정` 요약 행과 새 일괄 분류 시트의 선택 행에서 모바일 텍스트 선택/터치 콜아웃이 뜨지 않게 한다.

### 변경 파일

- `styles/20-records.css`
- `style.css`
- `index.html`

### 하지 않을 일

- `render-report.js`의 저장 로직, Firestore 업데이트 로직, 거래 필터링 로직은 변경하지 않는다.
- 상세분류 모달의 레이아웃이나 기능 범위를 넓히지 않는다.

### 검증

- `npm.cmd run verify`
- 정적 확인: `report-subcategory-row.actionable`, 분류 시트 체크 행에 `user-select: none` 계열 스타일이 적용되어 있는지 확인한다.
- 실제 UI 확인: 정상 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/`에서 리포트/홈의 카테고리 상세 모달을 열고 `상세분류 미지정` 행을 탭/길게 눌렀을 때 OS 텍스트 선택 툴바가 뜨지 않고 분류 시트가 열리는지 확인한다.

## 상태

- 실행 완료.
- 정적 검증: `npm.cmd run verify` 통과, CSS 선택 방지 규칙 및 캐시 버스트 문자열 확인 완료.
- 실제 UI 검증: not verified yet. 프로젝트 규칙상 sandbox에서 장기 dev server를 띄워 검증 완료로 주장하지 않는다.
