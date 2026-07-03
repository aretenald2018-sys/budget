# Android 네이티브 알림 수집기 리뷰

## 결론

- 구현 리뷰 결과, 소스 레벨에서 발견한 즉시 수정 필요 버그는 없다.
- `INGEST_TOKEN` 같은 secret 이름이 browser code에 들어가던 placeholder 문제는 검증 중 발견해 제거했다.
- APK 빌드 스크립트의 Windows `.bat`/공백 경로 문제가 발견되어 `java -cp d8.jar`와 `java -jar apksigner.jar` 직접 실행 방식으로 수정했다.

## 확인한 위험

- 실제 `NotificationListenerService` 수신은 로컬 빌드로 검증할 수 없다. Android 기기에서 알림 접근 권한을 켠 뒤 실제 하나Pay/카드/은행 알림으로 확인해야 한다.
- 결제 후보 필터는 package/app label allowlist와 `원 + 결제/승인/이용/출금/입금/송금/카드` 계열 키워드를 함께 본다. 누락되는 금융 앱이 있으면 `FINANCE_SOURCE_MARKERS`를 추가해야 한다.
- 현재 worktree에 기존 변경이 많아 production push/deploy는 안전하게 수행하지 않았다.

## 검증 결과

- `node --check render-settings.js`: 통과
- `node --check app.js`: 통과
- `node --check scripts/build-android-apk.mjs`: 통과
- `$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; npm.cmd run apk:build`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과

## 운영 확인 절차

- 정리된 worktree에서 변경분을 commit/push한다.
- GitHub Pages workflow 성공을 확인한다.
- 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 새 APK를 내려받는다.
- Android 설정 탭에서 token 저장, 알림 접근 권한 켜기, 실제 결제 알림 후 최근 로그 `전송됨`을 확인한다.
