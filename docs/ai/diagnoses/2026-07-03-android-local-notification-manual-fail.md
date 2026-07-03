# Android 로컬 알림 수집 수동 검증 실패 진단

## 증상

사용자가 2026-07-03 수동 검증 결과 Android 알림 수집이 전혀 동작하지 않는다고 보고했다.

## 재현/검증 루프

- Windows 로컬 SDK에 Android command-line tools가 없어 공식 `commandlinetools-win-14742923_latest.zip`를 내려받아 설치했다.
- `sdkmanager`로 `system-images;android-35;google_atd;x86_64`를 설치했다.
- `avdmanager`로 `BudgetNotifApi35` AVD를 생성했다.
- 에뮬레이터를 headless로 부팅했고 `adb devices -l`에서 `emulator-5554 device` 상태를 확인했다.
- `npm.cmd run apk:build`로 APK를 빌드해 에뮬레이터에 설치했다.
- `cmd notification allow_listener com.aretenald.budget/com.aretenald.budget.BudgetNotificationService`로 알림 접근을 허용했다.
- `dumpsys notification`에서 `BudgetNotificationService`가 allowed/live notification listener에 올라온 것을 확인했다.
- 앱 private `SharedPreferences`에 `listener_connected` 로그가 기록되는 것도 확인했다.

## 확인된 사실

1. APK 설치, manifest 등록, 알림 접근 권한, 리스너 바인딩 자체는 동작한다.
2. 앱 큐 저장소는 실제 기기 경로와 같은 `SharedPreferences`에 기록된다.
3. Android shell의 `cmd notification post`는 `posting` 출력은 내지만 ATD 환경의 active notification 목록에 남지 않아 결제 알림 재현 수단으로 부적합했다.
4. 현재 앱 설정 화면은 queued/saved/failed 정도만 보여서, 실기기에서 “권한 문제 / parser discard / 저장 실패” 중 무엇인지 즉시 구분하기 어렵다.

## 우선 가설

1. 실제 금융/SMS 알림이 `PaymentNotificationParser`의 필터에서 버려진다.
   - 반증 필요: 실제 third-party 알림 발신 앱으로 결제 문구를 게시해 큐 생성 여부를 확인한다.
2. 큐에는 쌓이지만 로그인된 WebView flush가 실패한다.
   - 반증 필요: bridge가 반환하는 pending capture를 저장 함수까지 흘려보내는 테스트를 강화하고 실패 로그를 설정 화면에 노출한다.
3. 사용자가 기존 versionCode/cacheBust의 APK를 계속 설치/실행했다.
   - 완화: versionCode/cacheBust를 새로 올려 업데이트 여부를 분명히 한다.
4. Android 권한 상태 판별이 기기별 component 표기 차이 때문에 잘못 표시된다.
   - 완화: `enabled_notification_listeners` 비교를 더 견고하게 하고 enabled string 일부를 상태에 남긴다.

## 수정 방향

- 앱 안에 민감정보 없이 쓸 수 있는 진단 표면을 늘린다: 최근 ignored/error/log row와 bridge 상태를 설정 화면에서 더 명확히 보여준다.
- parser가 결제/SMS 본문 기반 후보를 더 넓게 받되 광고/인증/배송류는 계속 제외한다.
- APK versionCode/cacheBust를 올려 사용자가 확실히 새 APK를 설치하게 한다.
- 로컬 검증용 third-party notification poster APK 또는 스크립트를 추가해 `NotificationListenerService -> SharedPreferences queued capture`를 ADB로 자동 확인한다.
