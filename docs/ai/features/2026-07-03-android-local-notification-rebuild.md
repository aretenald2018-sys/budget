# Android 로컬 알림 수집 재구축 계획

## 요청 원문

가계부의 휴대폰 알림으로 오는 데이터 수집 관련, 매크로드로이드/제머나이/네이티브apk알림수집 등 기존 벡엔드 코드 모조리 삭제하고 맨 처음부터 똑똑가계부 등 가계부어플들이 안드로이드 알림 수집하는 메커니즘을 그대로 구현. 하나의 찌꺼기조차 안 남아 잘못된 코드조각을 참조하는 일이 없게 할 것.

## 이해한 내용

- 목표: 휴대폰 알림 수집 경로를 기존 MacroDroid/Gemini/server/native-http-ingest 구조에서 완전히 끊고, Android 앱 자체의 알림 접근 권한 기반 로컬 수집기로 재구축한다.
- 비목표: Gmail 영수증 수집, 레시피/상품 LLM 기능, 기존 Firestore 거래 UI 전체 재설계는 이 계획의 범위가 아니다.
- 사용자 흐름: APK 설치 -> Android 알림 접근 권한 허용 -> 결제/승인/취소 알림 발생 -> 앱 로컬 큐 저장 -> 앱을 열고 로그인하면 거래 저장 -> 홈/거래 목록에 반영.
- 데이터 가정: 기존 거래 저장의 정식 경계는 browser `data.js`와 `users/{uid}/transactions`다. 과거 raw message 데이터는 삭제하지 않는다.
- 열려 있는 질문: 없음. 사용자가 기존 백엔드/기존 native ingest 삭제를 명시했으므로 server fallback은 두지 않는다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: 알림을 받은 즉시 백엔드로 전송하는 경로를 유지할 것인가, 아니면 Android 로컬 큐와 로그인된 WebView 저장으로 단순화할 것인가?
- 추천 답변: Android 로컬 큐 + WebView `data.js` 저장. 이유는 사용자가 backend/Gemini/token/native HTTP ingest 삭제를 요구했고, 현재 APK 빌드가 Gradle/Firebase SDK가 아닌 경량 `javac` 빌드라 native Firebase SDK 직접 저장보다 JS bridge가 기존 구조와 맞기 때문이다.
- 사용자 답변: 명시적으로 기존 백엔드와 기존 native APK 알림 수집을 전부 삭제하고 처음부터 구현하라고 지시함.
- 확정된 결정: ADR `docs/adr/2026-07-03-android-local-notification-ingest.md`를 새 source of truth로 삼는다.
- 남은 가정: 사용자는 Android 설정에서 알림 접근 권한을 켤 수 있고, Firestore 반영은 앱을 열었을 때 수행되어도 된다.

## 현재 코드 확인

- `api/ingest.js`, `api/ingest/sms.js`, `api/ingest/notif.js`, `api/_lib/auto-ingest.js`, `api/_lib/server-parser.js`, `api/_lib/request-payload.js`, `api/client-parse.js`, `client-parse.js`가 기존 raw/Gemini/MacroDroid 수집 경로다.
- `.github/workflows/budget-backend.yml`에는 `repository_dispatch: budget_ingest`, `INGEST_TOKEN`, `GEMINI_API_KEY`, raw 처리 job이 남아 있다.
- `android/src/com/aretenald/budget/`에는 `BudgetNotificationListener`, `BudgetSmsReceiver`, `BudgetNativeBridge`, `NativeIngestClient`, `NativeIngestStore`가 있고, `scripts/build-android-apk.mjs`가 `--native` 플래그로 이들을 조건부 포함한다.
- `render-settings.js`, `app.js`, `scripts/build-pages.mjs`, `scripts/verify-project.mjs`, `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `package.json`에는 기존 수집 경로 문구와 검증 계약이 남아 있다.
- Android 공식 문서 기준 새 알림 수집은 `NotificationListenerService` manifest 등록과 사용자 알림 접근 권한이 필요하며, 알림 텍스트는 `Notification` extras에서 추출한다.

## 결정 기록

- 결정: 기존 휴대폰 알림 수집 backend와 기존 native HTTP ingest 구현을 먼저 삭제한 뒤, 새 Android 로컬 수집기를 별도 슬라이스로 구현한다.
- 이유: “찌꺼기 없음” 요구를 만족하려면 기존 코드를 고쳐 쓰는 방식은 위험하다. 먼저 삭제/검증 계약을 바꿔 stale code path가 빌드와 문서에 남지 않게 해야 한다.
- 되돌릴 수 있는가: 가능하지만 의도적으로 큰 구조 변경이다. 되돌릴 때도 새 ADR을 다시 작성해야 한다.

## 실행 슬라이스

### 슬라이스 1: 레거시 수집 경로 전면 삭제

- 목표: 기존 휴대폰 알림 수집 경로가 runtime code, build script, verify script, source 문서에서 참조되지 않게 한다.
- 범위:
  - MacroDroid webhook, raw message Gemini 파서, browser fallback parser, GitHub `budget_ingest`, native HTTP ingest/token/API URL 설정, SMS receiver 코드를 삭제한다.
  - `scripts/verify-project.mjs`를 새 금지 문자열/금지 파일 계약으로 바꾼다.
  - `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`, `package.json` 설명을 새 ADR 기준으로 갱신한다.
- 예상 수정 파일:
  - 삭제 후보: `api/ingest.js`, `api/ingest/sms.js`, `api/ingest/notif.js`, `api/client-config.js`, `api/client-parse.js`, `client-parse.js`, `api/_lib/auto-ingest.js`, `api/_lib/server-parser.js`, `api/_lib/request-payload.js`, `api/_lib/firestore-rest.js`, `scripts/github-ingest.mjs`, `scripts/reprocess-pending-raw.mjs`, `scripts/link-duplicate-raw.mjs`
  - 삭제 후보: `android/src/com/aretenald/budget/BudgetNativeBridge.java`, `android/src/com/aretenald/budget/BudgetNotificationListener.java`, `android/src/com/aretenald/budget/BudgetSmsReceiver.java`, `android/src/com/aretenald/budget/NativeIngestClient.java`, `android/src/com/aretenald/budget/NativeIngestStore.java`
  - 수정 후보: `.github/workflows/budget-backend.yml`, `scripts/build-android-apk.mjs`, `scripts/build-pages.mjs`, `scripts/verify-project.mjs`, `app.js`, `render-settings.js`, `data.js`, `package.json`, `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `index.html`
- 수정하지 말 것:
  - 기존 Firestore raw message 데이터 삭제
  - Gmail 영수증/레시피/상품 관련 LLM 기능 삭제
  - unrelated dirty UI 변경 revert
- 구현 메모:
  - `render-settings.js`에서 Android token/API URL/큐 재전송 UI와 browser fallback parse UI를 제거한다.
  - `app.js`에서 `client-parse.js` import와 fallback parsing loop를 제거한다.
  - `scripts/build-android-apk.mjs`는 `--native` ingest variant가 아니라 새 수집기 구현 전까지 기본 WebView APK만 빌드하도록 정리한다.
  - `scripts/verify-project.mjs`에는 runtime/source에서 `MacroDroid`, `budget_ingest`, `client-parse`, `server-parser`, `auto-ingest`, `INGEST_TOKEN` 기반 알림 수집, `NativeIngestClient`, `BudgetSmsReceiver`가 남으면 실패하도록 한다. Gmail/recipe 관련 `GEMINI_API_KEY`는 이 슬라이스의 금지 대상이 아니다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - `rg -n -i "MacroDroid|budget_ingest|client-parse|server-parser|auto-ingest|NativeIngestClient|BudgetSmsReceiver|INGEST_TOKEN|/api/ingest" . -g "!node_modules/**" -g "!docs/ai/outbox/**" -g "!docs/ai/inbox/**"` 결과를 검토하고, 허용되는 역사 문서/새 계획 외 runtime/source 잔존이 없음을 확인한다.
- 완료 증거:
  - 위 검증이 통과하고, 삭제된 파일을 어떤 import/build/copy/verify 경로도 참조하지 않는다.
  - production deploy는 아직 새 수집기가 없으므로 이 슬라이스에서는 기능 완료가 아니라 삭제 완료로만 판정한다.
- 다음 세션 시작 프롬프트: 이 계획의 슬라이스 1 `레거시 수집 경로 전면 삭제`만 실행한다. 앱 코드는 기존 수집 경로 삭제와 stale reference 제거만 하고, 새 Android listener 구현은 다음 슬라이스로 남긴다.

### 슬라이스 2: Android 알림 로컬 캡처 구현

- 목표: 기존 native ingest 코드를 재사용하지 않고 새 `NotificationListenerService` 기반 로컬 캡처 레이어를 만든다.
- 범위:
  - 새 native 클래스 예: `BudgetNotificationService.java`, `NotificationCaptureStore.java`, `PaymentNotificationParser.java`, `BudgetAndroidBridge.java`
  - manifest에 listener service 등록
  - `Notification.EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`, `EXTRA_TEXT_LINES`, `EXTRA_MESSAGES`, ticker, package name, post time 수집
  - allowlist/denylist와 결제 후보 판별, deterministic id, 로컬 큐 저장
- 예상 수정 파일: `android/AndroidManifest.xml`, `android/src/com/aretenald/budget/*.java`, `scripts/build-android-apk.mjs`, `scripts/verify-project.mjs`, `android/res/values/strings.xml`
- 수정하지 말 것: native에서 HTTP 전송, token/API URL 저장, Gemini 호출, SMS receiver 재도입
- 검증 방법:
  - Java syntax/API compile은 APK build에서 확인한다.
  - verify script가 새 listener manifest와 금지된 legacy class 부재를 확인한다.
- 완료 증거: APK manifest에 새 listener만 있고 legacy ingest/token/SMS receiver 문자열이 없다.
- 다음 세션 시작 프롬프트: 슬라이스 2 `Android 알림 로컬 캡처 구현`만 실행한다.

### 슬라이스 3: WebView bridge와 Firestore 저장 연결

- 목표: 로그인된 WebView가 native 로컬 큐를 읽어 `data.js` 경계로 거래를 저장하게 한다.
- 범위:
  - bridge API: status, open notification settings, list/drain captures, ack/fail captures
  - `data.js`에 알림 캡처 -> 거래 저장 helper 추가 또는 기존 `saveTransaction` 재사용
  - `app.js` boot 후 로그인 상태에서 pending capture flush
  - 중복 거래 방지 키 설계
- 예상 수정 파일: `app.js`, `data.js`, `render-settings.js`, `android/src/com/aretenald/budget/*.java`, `scripts/verify-project.mjs`, `index.html`
- 수정하지 말 것: 서버 API route 재도입, browser localStorage에 raw notification body 장기 보관
- 검증 방법: mocked bridge로 flush unit/smoke 검증, `npm.cmd run verify`, `npm.cmd run pages:build`
- 완료 증거: mocked capture가 거래로 저장되는 흐름이 자동 검증되고, 실패 항목은 native 큐에 남는다.
- 다음 세션 시작 프롬프트: 슬라이스 3 `WebView bridge와 Firestore 저장 연결`만 실행한다.

### 슬라이스 4: 설정 UI, APK 배포, 운영 확인

- 목표: 사용자가 APK를 설치하고 알림 접근/큐 상태를 확인할 수 있게 운영 배포한다.
- 범위:
  - 설정 화면에 새 Android 알림 수집 상태, 알림 접근 열기, 최근 큐/저장 로그 표시
  - APK versionCode/cache-bust 갱신
  - Pages artifact에 새 APK 포함
  - 운영 GitHub Pages 배포
- 예상 수정 파일: `render-settings.js`, `style.css` 또는 관련 CSS, `android/apk-version.json`, `package.json`, `.github/workflows/pages.yml`, `scripts/verify-project.mjs`, `index.html`
- 수정하지 말 것: 로컬 dev server를 최종 검증으로 대체
- 검증 방법:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - 의도한 변경만 commit/push 후 GitHub Pages workflow 성공 확인
  - 운영 URL `https://aretenald2018-sys.github.io/budget/`와 APK metadata HTTP 200 확인
  - 실제 Android 기기에서 알림 접근 권한 허용 후 결제 알림 -> 앱 열기 -> 거래 생성 확인
- 완료 증거: GitHub Pages workflow 성공, production UI/APK 응답, Android 실기기 수집/저장 성공 스크린 또는 로그.
- 다음 세션 시작 프롬프트: 슬라이스 4 `설정 UI, APK 배포, 운영 확인`만 실행한다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고, 특히 stale legacy reference, 삭제된 파일을 참조하는 import/build/copy 경로, `INGEST_TOKEN`/Gemini/raw parser 재도입, APK manifest 권한, cache-bust 누락, 검증 공백을 우선 리뷰한다. 리뷰 중에는 새 기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 새 계획과 ADR 작성 완료.
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 슬라이스 1 `레거시 수집 경로 전면 삭제`
- 차단 질문: 없음
