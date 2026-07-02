# Android 수집 경로 추적성 진단

## 요청

Android 모바일의 결제내역(문자, 은행/카드/간편결제 앱 알림)을 앱 자체 파이프라인으로 ingest 할 수 있는지 다시 검증하고, MacroDroid 경로와 앱 자체 경로를 향후 구분/점검할 수 있게 한다.

## 확인 결과

- 웹앱/PWA 단독으로는 다른 Android 앱의 SMS/알림을 읽을 수 없다.
- 자체 수집 능력은 Android APK의 `NotificationListenerService`를 통해서만 가능하다.
- native client는 `/api/ingest`로 `meta.nativeIngest=true`를 보내야 한다.
- 기존 서버 normalizer는 top-level `meta` 객체를 보존하지 않아 native 표식이 raw 저장 시 유실될 수 있었다.
- 설정 화면에는 APK 내부 로그와 별개로 Firestore raw 기준 경로 요약이 필요하다.

## 판정

- 생산 앱의 웹/PWA만 보면 자체 수집 능력은 없다.
- APK에 native notification listener를 포함하면 자체 수집 능력이 생긴다.
- 추적성 보강 없이는 MacroDroid와 native 앱 경로를 안정적으로 구분하기 어렵다.

## 수정 방향

- Android APK에 `BudgetNotificationListener`와 native bridge를 추가한다.
- native payload는 `source=native_notification`, `ingestOrigin=android_native`, `ingestClient=android_notification_listener`를 보낸다.
- 서버 raw/transaction에 `ingestOrigin`, `ingestChannel`, `ingestClient`, `ingest` 객체를 저장한다.
- 설정 화면에 최근 raw 기준 `수집 경로 점검` 패널을 추가한다.
