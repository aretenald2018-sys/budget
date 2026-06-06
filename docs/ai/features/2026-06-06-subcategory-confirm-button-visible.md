# 상세분류 지정 확인 버튼 노출 수정 계획

## 요청

- Discord 요청: `devreq_discord_1512617813095747604`
- 사용자 보고: `확인버튼이 없음`
- 첨부 화면: `상세분류 지정` 하단 시트에서 거래 목록과 `취소`만 보이고 확정/저장 버튼이 보이지 않는다.

## `/diagnose`

### 재현/피드백 루프

- 첨부 이미지를 확인해 `상세분류 지정` 시트 첫 화면 하단에 `취소` 버튼만 보이는 증상을 확인했다.
- 정적 코드 확인:
  - `render-report.js`의 `subcategoryClassifierHtml()`은 `선택 거래 저장` 버튼을 실제로 렌더링한다.
  - `styles/20-records.css`의 `@media (max-width: 420px)`가 액션 버튼을 1열로 쌓아 `취소` 아래에 저장 버튼을 배치한다.
  - 긴 거래 목록과 모바일 안전 영역 때문에 저장 버튼이 첫 화면에서 보이지 않거나 하단에 가려질 수 있다.
- 수정 후 확인:
  - 액션 영역이 모바일에서도 `취소` + `확인` 2열로 항상 보이는지 정적 HTML/CSS로 확인한다.
  - `node --check render-report.js`, `npm.cmd run verify`, `git diff --check`를 실행한다.
  - 배포본에서 새 CSS cache-bust 문자열이 반영됐는지 확인한다.

### 가설

1. 저장 버튼은 없어진 것이 아니라 모바일 1열 레이아웃에서 `취소` 아래로 밀려 화면 밖에 놓인다.
2. 버튼 문구가 `선택 거래 저장`이라 사용자가 기대하는 `확인` 버튼으로 인식하기 어렵다.
3. `styles/20-records.css` import cache-bust가 오래돼 배포 후 CSS 수정이 즉시 반영되지 않을 수 있다.

## 실행 슬라이스

### 슬라이스 1: 상세분류 지정 시트 확정 버튼 가시화

- `render-report.js`
  - 확정 버튼 문구를 `확인`으로 줄여 모바일 2열 액션에서도 잘리지 않게 한다.
  - 저장 중/복구 문구도 같은 버튼 기준으로 정리한다.
- `styles/20-records.css`
  - 모바일에서도 액션 버튼을 2열로 유지한다.
  - 기존 거래 목록 내부 스크롤 구조는 유지하고, `취소` 아래로 확정 버튼이 밀리지 않게 한다.
- `style.css`, `index.html`, `app.js`, `render-home.js`
  - `styles/20-records.css`, `style.css`, `render-report.js`, `app.js` cache-bust 문자열을 갱신한다.

## 제외

- 상세분류 후보/저장 로직 변경
- 거래 목록 선택 방식 변경
- 카테고리 데이터 스키마 변경

## 완료 기준

- `상세분류 지정` 시트에서 모바일 첫 화면 하단에 `취소`와 `확인`이 함께 보인다.
- `확인` 클릭은 기존 `saveSubcategoryClassifier()` 저장 경로를 그대로 사용한다.
- 정적 검증과 프로젝트 검증이 통과한다.
- 배포가 가능하면 GitHub Pages 배포본에서 새 cache-bust 문자열을 확인한다.

## 실행 결과

- 상태: 실행 완료
- 구현 파일: `render-report.js`, `styles/20-records.css`, `style.css`, `index.html`, `app.js`, `render-home.js`
- 문서 파일: `docs/ai/features/2026-06-06-subcategory-confirm-button-visible.md`, `docs/ai/NEXT_ACTION.md`
- 변경 요약:
  - 상세분류 지정 시트의 저장 버튼 문구를 `확인`으로 바꾸고 기존 저장 핸들러를 그대로 사용하게 했다.
  - 모바일 `max-width: 420px`에서도 액션 영역을 2열로 유지해 `취소`와 `확인`이 같은 줄에 보이게 했다.
  - `style.css`, `index.html`, `app.js`, `render-home.js` cache-bust 문자열을 `20260606-subcategory-confirm`으로 갱신했다.
- 검증:
  - `node --check render-report.js`: 통과
  - `node --check app.js`: 통과
  - `node --check render-home.js`: 통과
  - `npm.cmd run verify`: 통과
  - `git diff --check`: 통과
- 실제 UI 검증: not verified yet. 인앱 브라우저 `iab` 세션과 로컬 Playwright/jsdom이 없어 로그인된 실제 앱에서 시트를 직접 열어 보지는 못했다.
