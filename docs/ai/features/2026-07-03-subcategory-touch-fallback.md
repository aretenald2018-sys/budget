# 상세분류 미지정 터치 fallback 수정 계획

## 목표

카테고리 상세 모달의 `상세분류 미지정` 행을 Android/WebView 터치 환경에서도 안정적으로 눌러 `상세분류 지정` 시트를 열 수 있게 한다.

## 슬라이스 1: 터치 fallback 지연 처리

### 변경 범위

- `render-report.js`
  - `pointerup`에서 즉시 중첩 모달을 열지 않고 fallback timer를 예약한다.
  - 실제 `click` 또는 키보드 입력이 들어오면 예약된 fallback을 취소한다.
- `index.html`, `app.js`, `render-home.js`
  - 새 `render-report.js`가 로드되도록 cache-bust 문자열을 갱신한다.

### 비목표

- 상세분류 저장 로직 변경
- 카테고리/거래 데이터 구조 변경
- 환급 처리 UI나 거래 상세 모달 추가 수정

## 슬라이스 2: 텍스트 선택 방지 보강

### 변경 범위

- `render-report.js`
  - `상세분류 미지정` 액션 대상에서 `selectstart`/`contextmenu` 기본 동작을 막는다.
  - 기존 click, keyboard, delayed pointer fallback 경로는 유지한다.
- `index.html`, `app.js`, `render-home.js`
  - 새 `render-report.js`가 로드되도록 cache-bust 문자열을 갱신한다.

### 비목표

- 상세분류 저장 플로우 변경
- 거래 상세/환급 처리 UI 추가 변경
- 카테고리 데이터 구조 변경

## 검증

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 운영 배포 후 `https://aretenald2018-sys.github.io/budget/`에서 카테고리 상세 모달의 `상세분류 미지정` 행을 눌렀을 때 `상세분류 지정` 시트가 열린다.
- Android/WebView에서 같은 행을 길게 눌러도 텍스트 선택 메뉴가 뜨지 않는다.
