# Android 자체 수집과 경로 추적성 리뷰

## 결론

- 소스/빌드 기준으로 즉시 수정해야 할 문제는 발견하지 못했다.
- 웹/PWA 단독 수집은 불가능하고, 자체 수집은 새 APK 설치와 Android 알림 접근 권한에 의존한다.
- MacroDroid와 native 앱 경로는 앞으로 raw/transaction의 `ingestOrigin`으로 구분할 수 있다.

## 리스크

- 실제 `NotificationListenerService` 수신은 로컬/CI에서 자동 검증할 수 없다.
- 금융앱 allowlist와 결제 후보 필터는 실제 누락 사례가 생기면 보강해야 한다.
- 기존 Firestore raw/transaction은 일괄 마이그레이션하지 않았으므로 과거 데이터에는 `ingestOrigin`이 없을 수 있다.

## 검증 상태

- 로컬 verify/pages/APK 빌드 통과.
- GitHub Pages workflow run `28592454290` 성공.
- production URL `https://aretenald2018-sys.github.io/budget/`: HTTP 200.
- production APK URL `https://aretenald2018-sys.github.io/budget/downloads/budget.apk?v=20260702-ingest-trace`: HTTP 200.
- 운영 설정 화면에서 `수집 경로 점검`, `Android 알림 수집`, APK 링크 노출 확인.
- 남은 검증은 실제 Android 기기에서 알림 접근 권한을 켠 뒤 결제 알림이 `ingestOrigin=android_native`로 저장되는지 확인하는 것이다.
