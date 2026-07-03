# Android 네이티브 알림 수집기 실행 기록 - 슬라이스 1

## 범위

- `BudgetNotificationListener`를 Android manifest에 등록했다.
- 결제 후보 알림을 `title/text/bigText/textLines/package/postTime` 기준으로 정규화한다.
- `NativeIngestStore`가 Android private storage에 API URL, token 보유 여부, 전송 큐/로그를 저장한다.
- `NativeIngestClient`가 기존 `/api/ingest` bridge로 `source/sender/app/body/receivedAt/meta` payload를 전송한다.
- 전송 실패나 token 미설정 상태는 큐에 남기고, listener 연결/수동 flush에서 재시도한다.

## 변경 파일

- `android/AndroidManifest.xml`
- `android/res/values/strings.xml`
- `android/src/com/aretenald/budget/BudgetNotificationListener.java`
- `android/src/com/aretenald/budget/NativeIngestClient.java`
- `android/src/com/aretenald/budget/NativeIngestStore.java`

## 검증

- `node --check scripts/build-android-apk.mjs`: 통과
- `npm.cmd run apk:build`: 최종 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과

## 메모

- 빌드 환경에서 `ANDROID_HOME`과 `JAVA_HOME`이 PATH에 없어서 명령 실행 시 명시했다.
- Android SDK는 `C:\Users\USER\AppData\Local\Android\Sdk`, JBR은 `C:\Program Files\Android\Android Studio\jbr`를 사용했다.
