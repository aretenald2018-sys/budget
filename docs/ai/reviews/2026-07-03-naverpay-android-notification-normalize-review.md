# 네이버페이 Android 알림 정규화 리뷰

## 결과

- source-level blocking finding: 없음.
- 리뷰 중 발견한 문제: `findSimilarTransaction()`이 네이버페이 충전 pair를 반환할 때 `app.js`가 중복 ack만 하고 기존 충전 거래를 실제 결제로 patch하지 않는 문제가 있었다.
- 조치: `buildNaverPayDuplicateMergePatch()`와 `updateTransaction()`을 사용해 기존 충전 거래를 실제 결제 금액/가맹점으로 갱신하도록 보강했다.

## 확인한 동작

- `PaymentNotificationParser.java`는 `[네이버페이]결제완료안내 ... 900원 http://naver.me/PayO` 형식을 네이버페이 결제 capture로 정규화하고 `paymentRail: "naverpay"` 계열 필드를 emit한다.
- `app.js`는 native capture의 `paymentRail`, `paymentRailResolved`, `actualMerchant`, `reason`을 transaction payload에 보존한다.
- 같은 시간창의 네이버페이 충전 거래가 있으면 새 거래를 버리지 않고 기존 거래를 실제 결제 정보로 patch한다.
- `index.html`의 `app.js` cache-bust는 `20260703-naverpay-android`로 갱신됐다.

## 검증

- 통과: `git diff --check` 대상 파일
- 통과: `node --check app.js`
- 통과: `node --check scripts/verify-project.mjs`
- 실패: `npm.cmd run verify`
  - 이유: `public/downloads/budget-apk.json`은 `versionCode: 5`, `versionName: "2.0.4"`, `cacheBust: "20260703-public-native-v5"`인데, `android/apk-version.json`은 `versionCode: 6`, `versionName: "2.0.5"`, `cacheBust: "20260703-android-local-notification-v6"`이다.
- 실패: `npm.cmd run pages:build`
  - 이유: stale APK metadata. `npm.cmd run apk:build` 선행 필요.
- 실패: `npm.cmd run apk:build`
  - 이유: 현재 환경에 `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`가 없다.

## 남은 리스크

- not verified yet: Java 변경은 Android SDK 환경에서 APK compile까지 확인하지 못했다.
- not verified yet: production Pages 배포를 수행하지 못했다.
- not verified yet: 실제 Android 기기에서 요청 샘플 알림이 `900원 / 티맵 주차 / paymentRail: naverpay`로 저장되는지 확인하지 못했다.
