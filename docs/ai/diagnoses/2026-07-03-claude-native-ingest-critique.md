# Claude native ingest 검토 비판 수용 기록

## 결론

- `NativeIngestStore.java` URL 역전 지적은 삭제 전 native ingest 코드나 handoff 문서에는 적용될 수 있지만, 현재 runtime APK 소스에는 해당 파일과 HTTP ingest 경로가 없다.
- 현재 APK 수집 구조는 Android 로컬 큐(`NotificationCaptureStore`)와 WebView bridge flush이며, `/api/ingest`로 직접 POST하지 않는다.
- 따라서 현재 "문자/알림이 가계부 거래로 인입되지 않음"의 직접 원인을 `NativeIngestStore` URL로 단정하면 안 된다.

## 현재 상태 확인

- runtime Android 소스 검색 결과 `NativeIngestStore`, `NativeIngestClient`, `BudgetNativeBridge`, `BudgetSmsReceiver`, `/api/ingest` 없음.
- APK 문자열 검색에서도 `budget-snowy`, `budget-api-liart`, `/api/ingest`, `NativeIngest` 관련 문자열 미검출.
- HTTP 확인:
  - `https://budget-snowy-iota.vercel.app/api/ingest`: `401 Unauthorized`
  - `https://budget-api-liart.vercel.app/api/ingest`: `404 Not Found`
- 현재 `config.js`, `index.html`, `scripts/verify-project.mjs`는 `budget-snowy-iota.vercel.app`를 canonical origin으로 보고 있다.

## 수용한 부분

- 기존 E2E가 Android local queue 생성까지만 강하게 확인하고, SMS source가 거래 payload와 캘린더 지출 표시까지 이어지는지는 약했다.
- `scripts/verify-project.mjs`에 `android_local_sms` 샘플을 추가해 `141,000원 테스트`가 거래 payload로 변환되고 캘린더 `-141,000` 표시까지 집계되는지 확인하도록 보강했다.

## 남은 확인

- S24가 현재 `adb devices`와 Windows present device 목록에 없어 실기기 내부 큐/로그는 확인하지 못했다.
- 실기기가 다시 보이면 `BudgetSmsScan`, `BudgetNotifSvc`, `NotificationCaptureStore` 상태와 WebView flush 결과를 확인해야 한다.
