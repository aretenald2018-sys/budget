# 공개 APK와 native 수집 APK 이원화

## 배경

공개 웹 다운로드 APK에 `NotificationListenerService`를 포함하면 Play Protect가 금융 사기에 악용될 수 있는 민감 기능으로 판단해 설치를 차단할 수 있다. 그러나 앱 자체 notification ingest 기능은 제품 목표상 유지해야 한다.

## 목표

- 공개 `budget.apk`는 설치 차단 가능성을 줄이기 위해 안전형 WebView APK로 유지한다.
- native notification ingest는 같은 소스/같은 signing key의 private native APK variant로 유지한다.
- public/native variant가 빌드 시점에 명확히 갈라지도록 한다.
- public APK에는 native ingest/JS bridge 문자열이 남지 않게 한다.
- native APK에는 `BudgetAndroid` bridge, token 저장, notification listener, 서버 전송 큐가 살아 있게 한다.

## 배포 전략

- 기본 GitHub Pages 배포: public APK만 배포한다.
- native 수집 APK: `npm.cmd run apk:build:native`로 `.android-private/budget-native.apk`에 생성한다.
- native APK는 공개 Pages에 올리지 않는다. 설치는 ADB 또는 Google Play internal testing/internal app sharing 같은 신뢰 배포 경로를 사용한다.

## 검증 기준

- `npm.cmd run apk:build`:
  - `nativeIngestEnabled=false`
  - `NotificationListenerService` 없음
  - `addJavascriptInterface` 없음
- `npm.cmd run apk:build:native`:
  - `nativeIngestEnabled=true`
  - `notification-listener` component 있음
  - `BudgetNativeBridge`, `NativeIngestClient`, `addJavascriptInterface` 있음
