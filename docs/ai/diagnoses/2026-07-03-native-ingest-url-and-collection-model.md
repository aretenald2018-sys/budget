# 네이티브 알림 수집 미등록 재점검

## 증상

문자 또는 금융 앱 알림이 Android 알림창에는 도착하지만 가계부 거래로 자동 등록되지 않는다.

첨부된 Claude 핸드오프는 2026-07-03 09:28 KST 하나카드 SMS 알림을 예로 들어, 서버 파서보다 Android 수집/전송 경로가 더 의심된다고 보았다.

## 점검 결과

Claude의 핵심 지적은 현재 코드에도 유효하다.

- `android/src/com/aretenald/budget/NativeIngestStore.java`
  - `DEFAULT_API_URL`이 `https://budget-snowy-iota.vercel.app/api/ingest`로 남아 있다.
  - `LEGACY_API_URL`이 현재 public bridge인 `https://budget-api-liart.vercel.app/api/ingest`로 되어 있다.
  - `normalizeApiUrl()`은 빈 값 또는 현재 bridge 값을 폐기된 기본값으로 되돌린다.
- `config.js`, `index.html`, `render-settings.js`는 `https://budget-api-liart.vercel.app`를 현재 API bridge로 사용한다.
- `scripts/verify-project.mjs`는 `budget-snowy-iota.vercel.app`를 금지하지만 `.js/.html` 중심으로 검사하여 Android Java 소스의 폐기 URL을 놓친다.
- 기존 2026-07-03 실행에서 `BudgetNotificationListener`가 카드 승인 SMS 본문 형식을 직접 인식하도록 보강되었으므로, 9:28 하나카드 SMS 본문 자체는 수집 후보가 될 가능성이 높아졌다.
- 서버 파서 스모크에는 해당 SMS fixture가 들어가 있어, 서버에 도착하기만 하면 `card_payment / 11000 / 뼈우림감자탕문정`으로 처리되는 경로는 검증되어 있다.

## 외부 앱 참고

2026-07-03 기준 공개 문서로 확인한 상용 앱 패턴은 다음과 같다.

- 편한가계부 Google Play 설명은 금융권 SMS를 자동으로 읽어 날짜, 금액, 내용, 계좌, 분류를 분석한다고 설명한다.
- 편한가계부 도움말은 SMS 자동인식 외에 카카오뱅크, S알리미, 원터치 알림 같은 금융 앱 PUSH 알림을 받으려면 Android `어플 알림 접근 권한`이 필요하다고 설명한다.
- 편한가계부 도움말은 금융 앱 알림은 과거 내용을 가져올 수 없고, SMS는 문자함/복사 붙여넣기/가져오기 흐름이 있음을 분리해서 설명한다.
- 똑똑가계부 Google Play 설명은 `SMS/MMS 은행·카드사 문자 자동 입력`과 `푸쉬 알림 어플의 입출금 메세지 자동 입력`을 모두 주요 기능으로 둔다.
- Google Play 정책은 SMS 권한을 민감 권한으로 제한하지만, 예산 추적/관리 앱의 `SMS 기반 자금 관리`는 검토 승인 대상 예외에 포함한다.

참고 링크:

- 편한가계부 Google Play: https://play.google.com/store/apps/details?hl=ko&id=com.realbyteapps.moneymanagerfree
- 편한가계부 SMS 도움말: https://help.realbyteapps.com/hc/ko/articles/360042747514
- 편한가계부 금융 앱 알림 도움말: https://help.realbyteapps.com/hc/ko/articles/360043221693
- 똑똑가계부 Google Play: https://play.google.com/store/apps/details?hl=ko&id=com.dencreak.spbook
- Google Play SMS/통화 기록 권한 정책: https://support.google.com/googleplay/android-developer/answer/10208820?hl=ko
- Android `NotificationListenerService`: https://developer.android.com/reference/android/service/notification/NotificationListenerService

## 판정

1순위 수정은 네이티브 기본 ingest URL과 URL 정규화 로직이다.

현재 상태에서는 알림이 정상 캡처되어도 `NativeIngestClient`가 폐기된 endpoint로 POST할 수 있다. 특히 설정 화면에서 현재 bridge URL을 저장해도 `normalizeApiUrl()`이 이를 legacy로 보고 폐기 endpoint로 되돌릴 수 있어, 사용자 설정으로도 우회하기 어렵다.

2순위는 검증 가드 보강이다.

`npm.cmd run verify`가 통과해도 Android Java 소스의 폐기 endpoint를 잡지 못하면 같은 회귀가 반복된다. 검증 스크립트는 Android native 소스도 금지 origin 검사 대상에 넣어야 한다.

3순위는 수집 방식의 보강 방향이다.

현재 앱은 상용 앱의 PUSH 알림 수집 방식과 같은 `NotificationListenerService` 경로만 구현한다. 상용 앱들은 SMS/MMS 직접 수신과 PUSH 알림 접근을 병행한다. 따라서 알림 접근이 꺼져 있거나, SMS 앱이 알림을 숨기거나, Android가 특정 알림 텍스트를 제한하면 현재 앱은 SMS를 직접 받을 대체 경로가 없다. 다만 SMS 권한은 민감 권한이므로 먼저 endpoint 문제를 고치고 실제 기기 로그를 확인한 뒤, 필요할 때 별도 opt-in 슬라이스로 추가하는 편이 안전하다.

## 추가 관찰

- `android/AndroidManifest.xml`의 notification listener service는 `android:exported="true"`다. Android 공식 예시는 `BIND_NOTIFICATION_LISTENER_SERVICE`와 함께 `exported="false"`를 사용한다. 미등록의 직접 원인으로 보긴 어렵지만 보안/정책 정합성 측면에서 함께 점검할 가치가 있다.
- 현재 worktree는 unrelated dirty/untracked 파일이 많다. production push 전에는 의도한 변경만 선별해야 한다.

## 재현/검증 루프

- 정적 재현:
  - `NativeIngestStore.java`에서 `budget-snowy-iota.vercel.app`가 발견되면 실패로 판정한다.
  - `normalizeApiUrl("https://budget-api-liart.vercel.app/api/ingest")`가 같은 값을 보존해야 한다.
- 서버 파서 재현:
  - 9:28 하나카드 SMS fixture가 `card_payment`로 파싱되어야 한다.
- 기기 검증:
  - 새 APK 설치 후 설정 > Android 알림 수집에서 API URL이 `https://budget-api-liart.vercel.app/api/ingest`로 보인다.
  - token 저장과 알림 접근 권한을 켠 뒤 새 결제 SMS/푸시가 최근 로그에 잡히고 `sent`가 된다.
  - 운영 raw/transaction에 해당 거래가 생성된다.
