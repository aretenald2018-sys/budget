# ADR: 휴대폰 알림 수집을 Android 로컬 수집기로 재구축

Status: Accepted

## 배경

기존 휴대폰 알림 수집 경로는 MacroDroid, `/api/ingest`, GitHub Actions `budget_ingest`, Gemini 기반 raw 파서, 그리고 별도 native APK ingest 전송 코드가 서로 겹쳐 있었다. 이 구조는 한 알림이 어느 경로를 탔는지 추적하기 어렵고, 오래된 endpoint/token/parser 조각이 남아 다음 수정에서 잘못 참조될 위험이 크다.

사용자는 휴대폰 알림에서 오는 가계부 데이터 수집에 한해 기존 백엔드/파서/native ingest 코드를 전부 버리고, 똑똑가계부류 Android 앱처럼 기기 권한을 받은 앱 자체가 알림을 읽는 구조를 요구했다.

Android 공식 API 기준으로 다른 앱 알림을 받는 정식 메커니즘은 `NotificationListenerService`다. 서비스는 manifest에 `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`와 `android.service.notification.NotificationListenerService` intent filter로 등록해야 하며, 실제 사용자는 Android 설정에서 알림 접근 권한을 직접 켜야 한다. 알림 본문은 `Notification.EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`, `EXTRA_TEXT_LINES`, `MessagingStyle` 메시지 등 notification extras에서 추출한다.

## 결정

휴대폰 알림 수집은 Android APK 내부의 `NotificationListenerService` 기반 로컬 수집기로 재구축한다.

- MacroDroid, `/api/ingest`, GitHub `repository_dispatch budget_ingest`, raw message 재처리, Gemini raw 파싱, `INGEST_TOKEN` 기반 native HTTP 전송을 휴대폰 알림 수집 경로에서 제거한다.
- 새 native 수집기는 알림을 로컬 큐에 저장하고, 네트워크 백엔드로 직접 보내지 않는다.
- WebView가 로그인된 뒤 JavaScript bridge로 로컬 큐를 읽어 기존 browser `data.js` Firestore 경계의 `saveTransaction` 흐름으로 거래를 저장한다.
- Android native 쪽은 토큰/API URL/GitHub PAT/Gemini key/Firebase service account를 저장하거나 전송하지 않는다.
- SMS broadcast receiver는 새 기본 수집 경로에 포함하지 않는다. 카드/은행 앱이 띄우는 상태바 알림을 수집 대상으로 한다.
- Gmail 영수증, 레시피 분석, 상품 미리보기처럼 휴대폰 알림 수집과 무관한 LLM/API 기능은 이 ADR의 삭제 대상이 아니다.

## 결과

- 휴대폰 알림 수집의 source of truth가 Android 알림 접근 권한과 로컬 큐로 단순화된다.
- 서버 secret이 APK/browser에 들어갈 이유가 사라진다.
- 앱이 완전히 닫혀 있어도 Android listener는 알림을 로컬 큐에 남길 수 있지만, Firestore 반영은 WebView 로그인 상태에서 앱이 열릴 때 수행된다.
- Android 설정에서 알림 접근 권한을 켜야 하며, 제조사 절전 정책이나 Android 보안 정책이 listener 동작을 제한할 수 있다.
- Android 15부터 OTP 같은 기밀 알림 내용은 notification listener에서 제거될 수 있으므로, 새 파서는 결제/승인/취소 알림 텍스트에만 의존하고 OTP 수집은 목표로 삼지 않는다.

## 검증 기준

- runtime/source 문서에서 기존 휴대폰 알림 수집 경로 참조가 제거된다.
- APK manifest에 새 `NotificationListenerService`가 등록되고, 기존 SMS receiver/native HTTP ingest/token 설정 코드는 남지 않는다.
- 실제 Android 기기에서 알림 접근 권한을 켠 뒤 결제 알림이 로컬 큐에 잡힌다.
- 앱을 열고 로그인하면 큐 항목이 거래로 저장되고 중복 알림은 중복 거래를 만들지 않는다.
- `npm.cmd run verify`, `npm.cmd run pages:build`, GitHub Pages 배포 workflow가 통과한다.

## 참고

- Android Developers: `NotificationListenerService` API reference
- Android Developers: `Notification` extras API reference
- Android Developers: Android 15 fraud prevention / confidential notification masking
