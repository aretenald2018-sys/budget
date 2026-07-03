# ADR: MacroDroid를 Android 네이티브 알림 수집기로 대체

## 상태

제안됨

## 배경

현재 실시간 결제 수집은 MacroDroid가 Android SMS/알림을 감지해 GitHub `repository_dispatch` 또는 `/api/ingest` 계열 endpoint로 전송하는 구조다. 최근 `하나Pay` 14:21 결제 알림처럼 Android 알림창에는 알림이 존재하지만 MacroDroid 매크로가 실행되지 않아 서버 로그 자체가 없는 사례가 반복됐다.

이 프로젝트에는 이미 `android/` WebView APK와 `npm.cmd run apk:build` 빌드 경로가 있다. 따라서 별도 앱을 새로 만들기보다 현재 APK에 Android 네이티브 수집 기능을 붙이는 편이 배포/설치 흐름을 단순하게 유지한다.

Android에서 다른 앱 알림을 읽으려면 `NotificationListenerService`가 필요하다. 이 서비스는 시스템이 새 알림 게시/제거 이벤트를 앱에 전달하는 공식 API이며, 서비스 선언에는 `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`가 필요하다. 사용자는 Android 설정의 `알림 접근` 화면에서 앱 권한을 직접 켜야 한다.

## 결정

현재 `com.aretenald.budget` APK에 `NotificationListenerService` 기반 수집기를 추가한다.

기본 전송 경로는 기존 Vercel API bridge의 `/api/ingest`다.

- 기본 URL: `https://budget-api-liart.vercel.app/api/ingest`
- 인증: Android private `SharedPreferences`에 저장한 ingest token을 `Authorization: Bearer ...`로 전송
- 금지: `INGEST_TOKEN`을 APK 소스, browser JS, WebView `localStorage`, GitHub Pages 정적 파일에 넣지 않는다.
- 허용: 사용자가 APK 내부 네이티브 설정에 직접 입력한 token을 앱 private storage에 저장한다.
- 대안: GitHub `repository_dispatch` 직접 호출은 fallback으로만 고려한다. 알림마다 Actions run이 생기고 응답 본문이 없어 폰 내부 상태 추적이 불리하다.

수집 대상은 allowlist 방식으로 시작한다.

- 1차 allowlist: `하나Pay`, 토스, 네이버페이/네이버파이낸셜, 카카오페이, 주요 카드/은행 앱 패키지
- allowlist 밖 알림은 저장/전송하지 않는다.
- 알림 본문은 `Notification.EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`, `EXTRA_TEXT_LINES`, package name, post time으로 정규화한다.

전송 실패는 앱 내부 큐에 남긴다.

- 각 알림은 deterministic id로 dedupe한다.
- 성공/실패/대기 상태, HTTP status, 마지막 오류, 시도 횟수, 마지막 시도 시간을 앱 private storage에 남긴다.
- 앱 설정 화면에서 최근 수집 로그를 볼 수 있게 한다.

## 결과

장점:

- MacroDroid 트리거 앱 목록/권한/HTTP 액션 분리로 생기는 “로그 없음” 상태를 줄인다.
- 수집, 전송, 실패 원인이 앱 내부 로그로 보인다.
- 현재 APK 배포 경로를 재사용한다.

단점:

- 사용자가 Android `알림 접근` 권한을 직접 켜야 한다.
- APK에 네이티브 코드와 설정 UI가 늘어난다.
- token을 기기 private storage에 저장하므로, 기기 분실/루팅 환경에서는 기존 MacroDroid token 저장과 유사한 보안 리스크가 있다.

## 검증 기준

- `NotificationListenerService`가 manifest에 등록되고 Android 설정의 알림 접근 목록에 앱이 나타난다.
- 사용자가 권한을 켜면 테스트 알림/실결제 알림이 앱 내부 로그에 `captured`로 남는다.
- `/api/ingest` 전송 성공 시 로그가 `sent`로 바뀌고 서버 raw/transaction 생성 결과를 기록한다.
- 전송 실패 시 로그가 `failed` 또는 `queued`로 남고 앱 재실행/다음 알림 시 재전송된다.
- `npm.cmd run apk:build`, `npm.cmd run verify`, `npm.cmd run pages:build`가 통과한다.

## 참고

- Android Developers: `NotificationListenerService`
- Android Developers: `Manifest.permission.BIND_NOTIFICATION_LISTENER_SERVICE`
- Android Developers: Android 13 `POST_NOTIFICATIONS` runtime permission
