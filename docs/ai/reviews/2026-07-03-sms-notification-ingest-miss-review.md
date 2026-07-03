# S24 카드 승인 SMS 미인입 리뷰

## 결과

코드 변경과 실기기 검증 모두 통과했다.

## 확인한 점

- GitHub Pages workflow `28641297093`가 성공했고 production APK metadata가 `versionCode=8`, `versionName=2.0.7`, `signing.mode=github-secret`로 배포됐다.
- S24 Ultra에 production APK v2.0.7을 `adb install -r`로 설치했다.
- S24 알림 리스너를 재연결했을 때 `adb logcat -s BudgetNotifSvc:*`에 아래 수집 로그가 찍혔다.

```text
queued reason=active:listener_connected amount=11000 merchant=뼈우림감자탕문정 package=com.samsung.android.messaging
active_scan reason=listener_connected scanned=14 queued=1
```

- 앱을 잠금해제 후 열자 로컬 큐가 flush됐고, 거래 화면에 `2026-07-01 / 뼈우림감자탕문정 / -11,000원`이 표시됐다.
- 같은 화면에서 2026년 7월 캘린더와 `2026-07-01` 일자 합계에 해당 소비가 반영됨을 확인했다.
- 새로 들어온 Teams 알림들은 `ignored` 로그로 남아 결제 알림만 큐에 들어가는 것을 확인했다.

## 남은 리스크

- 릴리즈 APK의 앱 내부 SharedPreferences는 `run-as`로 직접 읽을 수 없다. 대신 이번 변경부터 `BudgetNotifSvc` logcat으로 posted/ignored/queued/active_scan을 확인한다.
- 실제 저장은 앱이 로그인된 상태로 열릴 때 WebView flush가 수행된다. 잠금 상태에서는 native queue까지만 확인 가능하다.
