# 홈 2주 시작일 설정 모달 전환 계획

## 요청

- Discord 요청: `devreq_discord_1510798058965831811`
- 요청자: 피노
- 원문: "2주 시작일 버튼이 너무 화면을 많이 차지하니 2주/한달 토글 옆에 작게 설정 버튼을 만들어서 그걸 클릭하면 모달을 띄워서 설정할 수 있게끔 하는 방식으로 변경"

## 그릴 결과

- 핵심 질문: 기존 홈 hero 안의 시작일 입력 form을 계속 노출할지, 토글 옆 설정 버튼으로 숨길지?
- 답변/결정: 토글 옆에 작은 설정 버튼을 두고, 클릭 시 bottom sheet 모달에서 시작일을 저장한다.
- 이유: 기존 `biweeklyStartDate` 저장/계산 기능은 유지하면서 홈 hero의 첫 화면 점유를 줄이는 것이 요청의 핵심이다.
- 남은 가정: 설정 버튼은 홈 hero에서만 노출하고 리포트 탭의 기존 2주/월간 전환에는 영향을 주지 않는다.

## 현재 코드 관찰

- `render-report.js`는 홈 모드에서 `.report-mode-tabs` 바로 아래에 `biweeklyStartControlHtml()` form을 직접 렌더링한다.
- 저장은 `saveBiweeklyStartDate(form)`이 `saveAppSettings({ biweeklyStartDate })`, `localStorage`, `refreshAppHeader()`, `renderReport()`를 처리한다.
- 모달은 `#modals-container`에 동적 삽입하고 `window.openModal()` / `window.closeModal()`로 여는 기존 패턴이 있다.
- 홈 hero 관련 CSS는 `styles/60-urge.css`에 있으며, `style.css`, `index.html`, `app.js`, `render-home.js`, `render-report.js`는 cache-busting query string을 사용한다.

## 실행 슬라이스 1

### 목표

- 홈 hero에서 넓은 시작일 form을 제거한다.
- `이번 2주` / `이번 달` 토글 옆에 작은 설정 버튼을 추가한다.
- 설정 버튼 클릭 시 모달에서 시작일, 현재 적용 범위, 저장 버튼을 표시한다.
- 저장 로직과 `biweeklyStartDate` 계산/동기화는 기존 동작을 유지한다.

### 변경 예상 파일

- `render-report.js`
- `styles/60-urge.css`
- `style.css`
- `index.html`
- `app.js`
- `render-home.js`
- `docs/ai/NEXT_ACTION.md`

### 하지 않을 것

- 격주 계산 규칙, Firestore 설정 스키마, 리포트 탭의 월 이동/드릴다운 동작은 바꾸지 않는다.
- 시작일을 여러 개 저장하거나 월간 모드 설정을 추가하지 않는다.

### 검증

- `node --check render-report.js`
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- `git diff --check`
- 실제 UI 확인 기준: 홈에서 토글 옆 설정 버튼이 작게 보이고, 버튼을 누르면 시작일 모달이 열리며 저장 후 모달이 닫히고 hero 기간/헤더 범위가 갱신된다.

## 다음 실행 프롬프트

`docs/ai/features/2026-06-01-home-biweekly-start-date-modal.md`의 실행 슬라이스 1을 구현한다. 홈 hero의 시작일 inline form을 토글 옆 설정 버튼과 모달 저장 flow로 바꾸고, cache-busting 및 검증을 수행한다.

## 실행 결과

- 홈 hero의 시작일 inline form을 제거했다.
- 홈 hero의 `이번 2주` / `이번 달` 토글 옆에 작은 설정 버튼을 추가했다.
- 설정 버튼 클릭 시 `#modals-container`에 bottom sheet 모달을 동적 생성하고, 모달 안에서 시작일과 현재 2주 범위를 확인한 뒤 저장하도록 바꿨다.
- 기존 저장 흐름(`saveAppSettings`, `localStorage`, 앱 헤더 갱신, 홈 재렌더)은 유지하고 저장 성공 시 모달을 닫게 했다.
- `index.html`, `app.js`, `render-home.js`, `style.css`의 cache-busting query string을 `20260601-biweekly-start-modal`로 갱신했다.

## 실행 검증

- `node --check render-report.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 95 JS files checked)
- `npm.cmd run pages:build`: 통과 (`_site` Pages artifact 생성)
- `git diff --check`: 통과
- 실제 로그인 UI 클릭 검증은 not verified yet. 프로젝트 규칙상 sandbox에서 장기 dev server를 시작해 검증 완료로 주장하지 않는다.
