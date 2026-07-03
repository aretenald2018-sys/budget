# Android 네이티브 알림 수집기 실행 기록 - 슬라이스 2

## 범위

- WebView에 `window.BudgetAndroid` native bridge를 추가했다.
- bridge는 알림 접근 권한 상태, API URL, token 저장 여부, 최근 로그를 JS에 제공한다.
- token 값은 JS로 반환하지 않고 저장/삭제 명령만 제공한다.
- 설정 탭에 `Android 알림 수집` 패널을 추가했다.
- 설정 패널에서 API bridge URL 저장, token 저장, 알림 접근 설정 열기, 큐 재전송, token 삭제를 수행한다.
- `index.html`, `app.js`, APK 다운로드 링크의 cache-busting query를 갱신했다.

## 변경 파일

- `android/src/com/aretenald/budget/MainActivity.java`
- `android/src/com/aretenald/budget/BudgetNativeBridge.java`
- `render-settings.js`
- `app.js`
- `index.html`

## 검증

- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `npm.cmd run apk:build`: 통과

## 남은 실제 기기 확인

- APK 설치 후 설정 탭에서 `Android 알림 수집` 패널이 보이는지 확인한다.
- `알림 접근 열기`가 Android 알림 접근 설정으로 이동하는지 확인한다.
- 알림 접근 권한을 켠 뒤 결제 알림이 `대기 -> 전송됨` 로그로 바뀌는지 확인한다.
