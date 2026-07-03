# 네이버페이 Android 알림 정규화 실행 기록

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-naverpay-android-notification-normalize.md`
- 진단 문서: `docs/ai/diagnoses/2026-07-03-naverpay-android-notification-gap.md`
- Discord request: `devreq_discord_1510801802621223003`
- 실행 슬라이스: Slice 1 `Android 알림 네이버페이 결제완료 정규화`

## 변경 내용

- `android/src/com/aretenald/budget/PaymentNotificationParser.java`
  - `[네이버페이]자동결제안내` / `[네이버페이]결제완료안내` 전용 정규식을 추가했다.
  - URL 제거 후 금액 앞 결제처를 merchant로 추출하게 했다.
  - native capture JSON에 `paymentRail: "naverpay"`, `paymentRailResolved: true`, `actualMerchant`, `reason`을 포함하게 했다.
- `app.js`
  - Android capture의 `paymentRail`, `paymentRailResolved`, `actualMerchant`, `reason`을 Firestore transaction payload로 보존하게 했다.
  - merchant fallback에서 `actualMerchant`를 사용하게 했다.
  - `findSimilarTransaction()`이 네이버페이 충전 pair를 찾으면 `buildNaverPayDuplicateMergePatch()`로 기존 거래를 실제 결제 금액/가맹점으로 갱신하게 했다.
- `scripts/verify-project.mjs`
  - Android local notification parser가 네이버페이 결제완료 계약 필드를 유지하는지 검사한다.
  - `app.js`가 Android capture 결제 메타데이터를 보존하는지 검사한다.
  - `app.js`가 네이버페이 충전 pair merge helper와 `updateTransaction()`을 유지하는지 검사한다.
- `index.html`
  - `app.js` cache-bust query를 `20260703-naverpay-android`로 갱신했다.

## 검증

- `git diff --check` 대상 파일: 통과
- `node --check app.js`: 통과
- `node --check scripts/verify-project.mjs`: 통과
- `npm.cmd run verify`: 실패
  - 차단 사유: `public/downloads/budget-apk.json`은 `versionCode: 5`, `versionName: "2.0.4"`, `cacheBust: "20260703-public-native-v5"`인데, `android/apk-version.json`은 `versionCode: 6`, `versionName: "2.0.5"`, `cacheBust: "20260703-android-local-notification-v6"`이다.
- `npm.cmd run pages:build`: 실패
  - 차단 사유: stale APK metadata. `npm.cmd run apk:build` 선행 필요.
- `npm.cmd run apk:build`: 실패
  - 차단 사유: 현재 환경에 `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`가 없어 Android SDK를 찾지 못함.
  - 다음 명령: Android SDK가 설정된 정상 터미널에서 `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run apk:build`

## 남은 확인

- 실제 Android 기기에서 알림 접근 권한을 켠 APK가 요청 샘플 SMS/알림을 로컬 큐에 쌓고, 앱을 열었을 때 `900원 / 티맵 주차 / paymentRail: naverpay` 거래로 저장되는지 확인해야 한다.
- production 배포는 stale APK metadata와 unrelated dirty worktree 때문에 수행하지 못했다.
