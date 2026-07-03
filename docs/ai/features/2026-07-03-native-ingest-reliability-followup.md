# 네이티브 알림 수집 신뢰성 보강 계획

## 요청

메시지 또는 알림이 도착해도 가계부에 자동 등록되지 않는 문제를 Claude 핸드오프와 상용 가계부 앱 사례를 참고해 점검하고, 필요한 수정안을 정리한다.

## 그릴 결과

- 핵심 질문: 상용 앱처럼 SMS 직접 수신과 Android 알림 접근 수집을 병행할 것인가?
- 결정: 병행한다. 사용자가 2026-07-03에 "둘다 병행해서 끝까지 구현"을 명시했다.
- 구현 순서: 현재 네이티브 전송 URL 회귀를 고치고, 같은 실행에서 SMS 직접 수신 receiver를 기존 native ingest queue에 합류시킨다.
- 남은 가정: 실제 기기에 설치된 APK가 최신 소스에서 빌드된 것이고, Android 알림 접근 권한과 ingest token이 설정되어 있어야 한다.
- 추가 확인: 2026-07-03 실사용 SMS 실패 후 재점검에서 APK 서명키가 빌드마다 바뀌어 업데이트 설치가 실패할 수 있는 구조, SMS runtime permission을 WebView 설정 UI에만 의존한 구조, receiver 필터가 과도하게 좁은 구조를 발견했다.

## 참고 진단

- `docs/ai/diagnoses/2026-07-03-native-ingest-url-and-collection-model.md`
- 기존 계획: `docs/ai/features/2026-07-02-native-notification-ingest.md`
- 기존 ADR: `docs/adr/2026-07-02-native-android-notification-ingest.md`

## 실행 슬라이스

### 슬라이스 1: 네이티브 ingest endpoint hotfix + SMS 직접 수신 병행

- 상태: 완료
- 파일:
  - `android/src/com/aretenald/budget/NativeIngestStore.java`
  - `android/src/com/aretenald/budget/NativeIngestClient.java`
  - `android/src/com/aretenald/budget/BudgetSmsReceiver.java`
  - `android/src/com/aretenald/budget/BudgetNativeBridge.java`
  - `android/AndroidManifest.xml`
  - `render-settings.js`
  - `app.js`, `index.html`
  - `scripts/verify-project.mjs`
  - `docs/ai/executions/2026-07-03-native-sms-notification-ingest.md`
- 구현:
  - `DEFAULT_API_URL`을 `https://budget-api-liart.vercel.app/api/ingest`로 맞춘다.
  - 현재 bridge URL을 legacy로 간주해 폐기 URL로 되돌리는 `normalizeApiUrl()` 동작을 제거한다.
  - 정말 이전 값 마이그레이션이 필요하면 `budget-snowy-iota.vercel.app`만 현재 bridge로 치환한다.
  - `BudgetSmsReceiver`를 추가해 `RECEIVE_SMS`로 새 SMS를 직접 수신한다.
  - SMS receiver는 금융/결제 후보 본문만 `NativeIngestClient`에 넣고, 개인 문자 일반 본문은 큐에 저장하지 않는다.
  - SMS receiver는 실제 카드사 문구 차이를 감안해 금액/결제/금융 키워드 후보를 더 넓게 잡고, `goAsync()`로 큐 저장/전송 생존성을 보강한다.
  - native payload가 `ingestChannel=notification|sms`, `ingestClient=android_notification_listener|android_sms_receiver`를 구분해 보낸다.
  - `MainActivity`가 앱 실행 시 `RECEIVE_SMS` runtime permission을 직접 요청해 WebView 설정 UI 배포 전에도 권한을 받을 수 있게 한다.
  - WebView 설정 화면에서 Android SMS 권한 상태와 권한 요청 버튼을 제공한다.
  - APK builder는 `.android-signing` keystore를 재사용하고, GitHub Pages workflow는 해당 signing directory를 cache한다.
  - `scripts/verify-project.mjs`가 Android Java 소스에서도 `budget-snowy-iota.vercel.app`를 금지하게 한다.
  - `scripts/verify-project.mjs`가 SMS runtime permission, receiver `goAsync()`, persistent APK signing 회귀를 잡는다.
  - 가능하면 native URL 상수와 `render-settings.js`의 `DEFAULT_NATIVE_INGEST_URL`이 서로 어긋나지 않는지 검사한다.
- 제외:
  - 과거 SMS inbox 읽기와 backfill.
  - MMS 본문 다운로드/파싱.
  - MacroDroid 삭제.
  - production push.
- 검증:
  - `node --check scripts/verify-project.mjs`
  - `node --check render-settings.js`
  - `node --check app.js`
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - Android SDK가 있으면 `npm.cmd run apk:build`

### 슬라이스 2: 알림 접근 UX와 기기 검증 체크리스트 보강

- 상태: 슬라이스 1에 포함해 완료
- 파일:
  - `render-settings.js`
  - `app.js`, `index.html` cache-busting query
  - 필요 시 `android/src/com/aretenald/budget/BudgetNativeBridge.java`
- 구현:
  - 설정 화면에서 API URL이 폐기 endpoint일 때 명확한 오류 상태를 보여준다.
  - 알림 접근 권한 꺼짐, token 없음, 최근 로그 없음, 전송 실패를 서로 다른 상태로 보여준다.
  - `queued` + `captured` 메시지가 사용자가 보기에는 “캡처됨, 전송 대기”로 읽히게 표시를 다듬는다.
- 제외:
  - SMS/MMS receiver.
  - 서버 파서 신규 패턴 확장.
- 검증:
  - `node --check render-settings.js`
  - `npm.cmd run verify`
  - 운영 URL에서 설정 화면이 로드되고 Android WebView에서 상태가 구분되어 보인다.

### 슬라이스 3: 선택형 SMS/MMS backfill 검토

- 상태: 보류
- 파일 후보:
  - `android/AndroidManifest.xml`
  - `android/src/com/aretenald/budget/BudgetSmsReceiver.java`
  - `android/src/com/aretenald/budget/NativeIngestClient.java`
  - `render-settings.js`
- 구현 후보:
  - `READ_SMS` 기반 과거 문자함 가져오기 또는 MMS 본문 다운로드가 필요하면 별도 수동 backfill 기능으로만 다룬다.
  - Google Play 배포를 고려한다면 SMS 권한 선언/개인정보 고지/권한 승인 요건을 별도 ADR로 확정한다.
- 제외:
  - 기본 SMS 앱 전환 요구.
  - SMS 전체 백업/동기화.
  - browser/localStorage secret 저장.
- 검증:
  - Android runtime SMS 권한 요청 흐름 확인.
  - 금융 SMS 1건이 native 로그와 서버 raw/transaction으로 이어지는지 확인.
  - 일반 개인 문자가 수집되지 않는지 확인.

## 다음 실행 시작점

슬라이스 1과 설정 UX/설치 신뢰성 보강은 구현/로컬 검증 완료했다. 남은 일은 production deploy와 실제 Android 기기에서 새 APK 설치 후 알림 접근, SMS 권한, token 저장, 결제 SMS/푸시 수집 로그를 확인하는 것이다. 기존 APK가 이전 임시 서명키로 설치되어 있으면 최초 1회는 삭제 후 재설치가 필요할 수 있다.
