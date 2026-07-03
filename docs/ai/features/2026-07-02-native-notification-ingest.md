# Android 네이티브 알림 수집기 전환 계획

## 요청

MacroDroid 오류가 잦으므로 가계부 앱 자체가 폰 알림을 감지하고 서버 ingest로 전송하게 구조 변경한다.

## 그릴 결과

- 핵심 질문: 현재 웹앱/PWA만으로 다른 앱 알림을 읽을 수 있는가?
- 확인: 불가능하다. Android 네이티브 `NotificationListenerService`가 필요하다.
- 결정: 이미 존재하는 `android/` WebView APK에 네이티브 알림 수집기를 추가한다.
- 결정: 기본 전송 경로는 기존 `https://budget-api-liart.vercel.app/api/ingest` bridge로 한다.
- 결정: `INGEST_TOKEN`은 browser code/localStorage/APK source에 넣지 않고, APK 내부 네이티브 설정에서 사용자가 입력한 값을 Android private storage에 저장한다.
- 남은 가정: 사용자는 APK 설치 후 Android 설정에서 `알림 접근` 권한을 켤 수 있다.

## 현재 코드 확인

- `android/AndroidManifest.xml`
  - 현재 권한은 `INTERNET`뿐이며 `NotificationListenerService` 등록은 없다.
  - 앱 패키지는 `com.aretenald.budget`이다.
- `android/src/com/aretenald/budget/MainActivity.java`
  - 현재는 `https://aretenald2018-sys.github.io/budget/`를 띄우는 WebView wrapper다.
  - native bridge, notification access 설정 이동, 앱 내부 로그 UI 연결은 없다.
- `scripts/build-android-apk.mjs`
  - Gradle 없이 Android SDK toolchain으로 Java source 전체를 컴파일한다.
  - AndroidX/WorkManager 의존성은 없으므로 1차 구현은 platform API만 사용한다.
- `api/ingest.js`
  - `Authorization: Bearer <INGEST_TOKEN>`을 검증하고 `normalizeIncomingPayload()` 뒤 `ingestAndParse()`를 호출한다.
- `api/_lib/request-payload.js`
  - `source`, `sender`, `app`, `body`, `receivedAt`, `meta` payload를 이미 정규화한다.
- `config.js`
  - 현재 public API bridge origin은 `https://budget-api-liart.vercel.app`다.
- `scripts/verify-project.mjs`
  - APK support file 존재와 Pages artifact의 APK 포함을 검증한다.

## 아키텍처 결정

- ADR: `docs/adr/2026-07-02-native-android-notification-ingest.md`
- 수집 계층:
  - `BudgetNotificationListener extends NotificationListenerService`
  - `onNotificationPosted(StatusBarNotification sbn)`에서 결제 후보 알림만 정규화한다.
- 저장/재시도 계층:
  - `NativeIngestStore`가 Android private storage에 최근 로그/큐를 JSON으로 저장한다.
  - deterministic id로 중복 알림을 막는다.
- 전송 계층:
  - `NativeIngestClient`가 `/api/ingest`에 JSON POST를 보낸다.
  - 성공 시 response body 일부와 상태를 저장한다.
  - 실패 시 attempts/lastError를 저장하고 다음 flush까지 큐에 둔다.
- WebView 연결:
  - `BudgetNativeBridge`를 `addJavascriptInterface`로 제공한다.
  - JS에는 token 값을 넘기지 않는다.
  - JS는 권한 상태, 최근 로그, 설정 화면 열기, 테스트 flush 명령만 호출한다.
- UI:
  - 설정 탭에 `Android 알림 수집` 섹션을 추가한다.
  - 항목: 알림 접근 권한 상태, API bridge URL, token 설정 상태, 최근 수집/전송 로그, 테스트 전송 버튼.

## 실행 슬라이스

### 슬라이스 1: Android 알림 리스너와 최소 전송 큐

- 상태: 완료
- 파일:
  - `android/AndroidManifest.xml`
  - `android/src/com/aretenald/budget/MainActivity.java`
  - `android/src/com/aretenald/budget/BudgetNotificationListener.java`
  - `android/src/com/aretenald/budget/NativeIngestStore.java`
  - `android/src/com/aretenald/budget/NativeIngestClient.java`
- 구현:
  - manifest에 `BIND_NOTIFICATION_LISTENER_SERVICE` 서비스 등록.
  - `MainActivity`에 `ACTION_NOTIFICATION_LISTENER_SETTINGS` 이동 helper 추가.
  - 하나Pay/토스/네이버페이/카카오페이/카드/은행 앱 package allowlist 추가.
  - 알림 title/text/bigText/textLines/package/postTime을 payload로 정규화.
  - `/api/ingest` 전송과 실패 큐 저장.
  - token/API URL은 native private preferences에 저장하며 source에는 하드코딩하지 않는다.
- 제외:
  - SMS 직접 읽기.
  - GitHub `repository_dispatch` 직접 호출.
  - 기존 MacroDroid 경로 삭제.
  - 브라우저 localStorage에 secret 저장.
- 검증:
  - `node --check scripts/build-android-apk.mjs`
  - `npm.cmd run apk:build`
  - `npm.cmd run verify`

### 슬라이스 2: 설정 탭 UI와 native bridge

- 상태: 완료
- 파일:
  - `android/src/com/aretenald/budget/MainActivity.java`
  - `android/src/com/aretenald/budget/BudgetNativeBridge.java`
  - `render-settings.js`
  - `app.js`, `index.html`
- 구현:
  - WebView에 `window.BudgetAndroid` bridge 제공.
  - 설정 탭에 알림 접근 권한 상태와 설정 열기 버튼 추가.
  - token 입력은 JS가 값을 보관하지 않고 native bridge로 전달 즉시 private storage에 저장.
  - 최근 20개 native ingest 로그 표시.
  - 테스트 flush 버튼 제공.
- 검증:
  - `node --check render-settings.js`
  - `npm.cmd run apk:build`
  - `npm.cmd run verify`
  - Android 설치 후 설정 화면에서 `알림 접근 열기` 동작 확인.

### 슬라이스 3: 운영 검증과 MacroDroid 단계적 비활성화

- 상태: 운영 배포/기기 검증 대기
- 범위:
  - 새 APK를 Pages artifact로 배포.
  - Android 기기에 설치/업데이트.
  - 알림 접근 권한 켜기.
  - 하나Pay 테스트 알림 또는 실제 소액 결제 알림으로 수집/전송 로그 확인.
  - Firestore raw/transaction 생성 확인.
  - 안정화 후 MacroDroid 매크로는 즉시 삭제하지 않고 일정 기간 비활성화한다.
- 검증:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - GitHub Pages workflow 성공
  - 운영 URL `https://aretenald2018-sys.github.io/budget/`
- Android 설정 탭에서 `captured -> sent` 상태 확인

### 슬라이스 4: 서버 추적성 보강과 경로 점검 UI

- 상태: 실행 예정
- 배경:
  - native client는 `meta.nativeIngest=true`를 보내지만 서버 normalizer가 top-level `meta` 객체를 보존하지 않아 raw 저장 시 표식이 사라진다.
  - 운영 중에는 같은 결제가 MacroDroid와 native 앱 중 어느 경로에서 들어왔는지 빠르게 확인해야 한다.
- 파일:
  - `api/_lib/request-payload.js`
  - `api/_lib/auto-ingest.js`
  - `android/src/com/aretenald/budget/NativeIngestClient.java`
  - `data.js`
  - `render-settings.js`
  - `app.js`, `index.html`
- 구현:
  - incoming `meta` 객체와 `ingestOrigin`, `ingestClient`, `ingestChannel` 계열 필드를 보존한다.
  - raw/transaction 문서에 `ingestOrigin`, `ingestChannel`, `ingestClient`, `ingest` 객체를 저장한다.
  - native payload는 `source=native_notification`, `ingestOrigin=android_native`, `ingestClient=android_notification_listener`를 보낸다.
  - 설정 화면의 `계좌 & 데이터 소스` 섹션에 최근 raw 기준 `수집 경로 점검` 요약과 최근 항목을 표시한다.
- 제외:
  - MacroDroid 매크로 삭제 또는 비활성화.
  - Firestore 기존 문서 일괄 마이그레이션.
  - 기기 실결제 테스트 자동화.
- 검증:
  - `node --check api/_lib/request-payload.js`
  - `node --check api/_lib/auto-ingest.js`
  - `node --check render-settings.js`
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - 가능하면 APK 빌드와 운영 설정 화면의 경로 점검 카드 표시 확인.

### 슬라이스 5: native 알림 수집 메인 경로 승격과 하나Pay 결정 파싱

- 상태: 완료
- 배경:
  - MacroDroid는 기기/권한/매직텍스트 설정에 따라 같은 결제 알림도 누락하거나 잘못된 body를 보낼 수 있다.
  - 사용자는 MacroDroid 의존도를 낮추고 APK의 `NotificationListenerService`를 주 수집 경로로 쓰길 원한다.
  - 하나Pay 알림은 `(결제) 2,200원 ... / 신용(...) / 07.03 08:40 / 누적이용금액 ...` 형식이라 기존 `승인 ... 원 ... MM/DD HH:mm` 결정 파서만으로는 안정적이지 않다.
- 파일:
  - `android/src/com/aretenald/budget/BudgetNotificationListener.java`
  - `android/src/com/aretenald/budget/NativeIngestClient.java`
  - `android/src/com/aretenald/budget/NativeIngestStore.java`
  - `api/_lib/server-parser.js`
  - `scripts/verify-project.mjs`
- 구현:
  - native listener가 `EXTRA_TEXT`, `EXTRA_BIG_TEXT`, `EXTRA_TEXT_LINES`뿐 아니라 `titleBig`, `subText`, `summaryText`, `infoText`, messaging-style payload, 기타 text extras를 함께 수집한다.
  - native payload의 기본 endpoint를 실제 `/api/ingest` bridge로 정리하고 `source=native_notification`, `ingestOrigin=android_native`를 유지한다.
  - 서버 결정 파서에 하나Pay/카드 앱 `(결제|승인|취소|환불) 금액원 가맹점 / 결제수단 / MM.DD HH:mm` 형식을 추가한다.
  - 검증 스모크에 하나Pay 2,200원 알림 fixture를 추가한다.
- 제외:
  - MacroDroid 매크로 삭제.
  - SMS inbox 직접 읽기 권한 추가.
  - GitHub PAT를 APK에 저장하거나 GitHub `repository_dispatch`를 APK에서 직접 호출.
  - Vercel 운영 프로젝트 수동 재배포.
- 검증:
  - `node --check api/_lib/server-parser.js`
  - `node --check scripts/verify-project.mjs`
  - `npm.cmd run verify`
  - 가능하면 `npm.cmd run apk:build`
  - 최종 성공 판정은 Android 기기에서 알림 접근 권한을 켠 뒤 하나Pay 실제 알림이 native 로그 `captured -> sent`가 되고 거래로 생성되는지 확인한다.

## 보안 규칙

- Gemini API key, `FIREBASE_SERVICE_ACCOUNT`, GitHub PAT는 APK/browser에 넣지 않는다.
- `INGEST_TOKEN`은 source code, `config.js`, HTML, browser localStorage에 넣지 않는다.
- Android private storage에 저장되는 token은 사용자가 직접 입력한 런타임 설정값으로만 다룬다.
- native bridge는 token read API를 제공하지 않는다. 저장/삭제만 제공한다.

## 검증 한계

- 로컬/CI에서 `NotificationListenerService`가 실제 알림을 받는지는 검증할 수 없다.
- 최종 성공 판정은 Android 기기에서 알림 접근 권한을 켠 뒤 실제 결제 알림으로 확인해야 한다.

## 다음 실행 시작점

슬라이스 1, 2 구현과 로컬 APK/Pages 빌드는 완료했다. 남은 일은 정리된 worktree에서 production deploy를 수행하고, Android 기기에 APK를 설치한 뒤 알림 접근 권한과 실제 결제 알림 `captured -> sent` 로그를 확인하는 것이다.
