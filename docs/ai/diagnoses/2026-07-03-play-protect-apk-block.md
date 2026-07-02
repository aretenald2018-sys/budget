# Play Protect APK 설치 차단 진단

## 증상

웹에서 `budget.apk`를 내려받아 설치하려 하면 Android가 `기기 보호를 위해 앱 차단됨` 계열 메시지로 설치를 막는다.

## 원인 판단

Play Store 미등록 자체보다는 공개 APK에 포함된 민감 기능 조합이 원인일 가능성이 높다.

- APK는 `NotificationListenerService`를 선언한다.
- 이 서비스는 다른 앱의 알림 제목/본문을 읽고 결제 후보를 추출해 서버로 전송한다.
- Google Play Protect는 Play Store 밖 미검증 앱이 금융 사기에 자주 쓰이는 민감 권한/기능을 사용할 때 설치를 차단할 수 있다.
- Android 13+는 sideload 앱의 notification/accessibility 같은 restricted settings도 별도로 제한한다.

## 해결 방향

- 공개 웹 다운로드 APK는 WebView wrapper + 일반 `INTERNET` 권한만 남긴다.
- 공개 APK에서 `NotificationListenerService`, native ingest bridge/client/store 코드를 제외한다.
- native notification ingest는 별도 private/ADB build에서만 켤 수 있는 옵션으로 남긴다.
- 앱 설정 문구도 공개 APK 기준으로 MacroDroid 수집이 기본임을 명확히 한다.

## 남는 제약

- Play Protect의 최종 판정은 Google/기기 정책에 달려 있어 앱 코드만으로 100% 보장할 수 없다.
- 하지만 공개 APK에서 알림 접근 수집 코드를 제거하면 설치 차단 가능성을 크게 낮출 수 있다.
