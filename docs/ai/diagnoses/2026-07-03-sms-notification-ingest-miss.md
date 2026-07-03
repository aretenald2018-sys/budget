# S24 카드 승인 SMS 미인입 진단

## 증상

2026-07-03 KST, S24 Ultra에서 삼성 메시지 알림으로 카드 승인 문자가 도착했지만 Android APK 알림 수집 상태와 거래 캘린더에 반영되지 않았다.

```text
[Web발신]
하나2*0*승인 김*우 11,000원 일시불 07/01 19:54 뼈우림감자탕문정 누적2,664,049원
```

## 확인

- `adb devices -l`에서 S24 Ultra와 에뮬레이터가 모두 연결됨을 확인했다.
- S24의 `enabled_notification_listeners`에는 처음에 `com.aretenald.budget` 리스너가 없었고, `cmd notification allow_listener`로 알림 접근을 활성화했다.
- `dumpsys notification` 기준으로 `com.aretenald.budget/com.aretenald.budget.BudgetNotificationService`가 live notification listener가 됐다.
- 같은 S24의 활성 알림에는 삼성 메시지 패키지 `com.samsung.android.messaging`의 SMS 알림이 남아 있었고, `cmd notification get`으로 위 카드 승인 본문을 확인했다.
- 릴리즈 APK는 `run-as com.aretenald.budget`이 불가능해 앱 내부 SharedPreferences 큐를 ADB에서 직접 읽을 수 없었다.

## 판정

- 기존 APK는 릴리즈 실기기에서 수집 단계별 로그를 볼 방법이 없어 `onNotificationPosted` 미호출, 파서 무시, 로컬 큐 저장, WebView flush 실패를 구분할 수 없었다.
- 기존 서비스는 `onListenerConnected` 시점에 이미 알림창에 남아 있는 활성 알림을 재스캔하지 않았다. 알림 접근을 뒤늦게 켜거나 APK 업데이트 후 리스너가 재연결되는 경우 현재 떠 있는 결제 알림을 놓칠 수 있다.
- 삼성 메시지 같은 문자 앱은 패키지/앱 라벨이 제조사마다 달라질 수 있으므로, 메시지 앱 힌트와 결제 본문 신호를 별도로 취급해야 한다.

## 조치 방향

- `BudgetNotificationService`에 `BudgetNotifSvc` logcat 진단 로그를 추가한다.
- `onListenerConnected`에서 `getActiveNotifications()`를 훑어 현재 알림창에 남아 있는 결제 알림도 큐에 넣는다.
- 파서에서 삼성 전체 패키지를 금융 앱으로 오인하는 힌트는 제거하고, 메시지 앱 패키지의 결제/승인 SMS 본문은 후보로 통과시킨다.
- 에뮬레이터 E2E fixture에 위 S24 SMS 본문을 넣어 회귀 검증한다.
