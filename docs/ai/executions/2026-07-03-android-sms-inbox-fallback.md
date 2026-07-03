# Android 문자함 fallback 수집 실행 기록

## 배경

- Samsung Messages 대화방을 전면에 열어 둔 상태에서 사용자가 같은 대화로 테스트 문자를 보내면 Android가 새 알림을 만들지 않을 수 있다.
- 이 경우 `NotificationListenerService`는 수집할 알림 객체가 없으므로 정상 구현이어도 거래가 생성되지 않는다.
- 해결은 알림 리스너를 유지하되, `READ_SMS` 권한이 허용된 APK에서 최근 SMS inbox를 로컬로 스캔해 같은 pending capture 큐에 넣는 것이다.

## 실행 내용

- Android APK에 `READ_SMS` 권한과 `SmsCaptureScanner`를 추가했다.
- 앱 진입, 앱 복귀, 문자 권한 승인 직후 최근 3일/최대 80건의 inbox 문자를 스캔한다.
- SMS scan 결과는 기존 `NotificationCaptureStore` 큐에 `android_local_sms` source로 저장하고, 웹뷰 flush가 로그인된 계정의 거래로 저장한다.
- 파서는 알림/SMS 공통 `parseFields` 경로를 사용하도록 리팩터링했다.
- 티머니 출금, KB국민카드 승인/취소, 네이버페이 결제완료/주문취소, 인증번호 무시 케이스를 Android E2E fixture에 추가했다.

## 검증

- `npm.cmd run verify:android-notification`
  - Android fixture 알림 1건 수집 통과
  - Emulator SMS inbox 스캔으로 141,000원 테스트, 뼈우림감자탕문정, 티머니, 쿠팡(쿠페이), 쿠팡이츠, 반석 크리스피 먹태, 티맵모빌리티 수집 통과
  - 네이버파이낸셜 인증번호 무시 통과
- `npm.cmd run verify`
- `npm.cmd run pages:build`

## 남은 실기기 확인

- S24가 ADB 목록에서 사라져 실기기 설치/로그 확인은 완료하지 못했다.
- 재연결 후 확인할 로그 태그는 `BudgetSmsScan`이며, 기대 로그는 `queued amount=141000 merchant=테스트` 형태다.
