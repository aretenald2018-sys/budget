# 앱 전체 리팩토링 슬라이스 7 리뷰

## 결론

- 슬라이스 7 완료. Android capture v1, 로컬 queue 상태/재시도, 로그인 전후 WebView flush, reward widget v2 계약을 공통 fixture와 verifier로 고정했다.
- 동일 capture 재스캔은 attempts/backoff를 초기화하지 않는다. 실패는 30초·2분·10분 간격으로 최대 3회 재시도하며, 모든 원본 capture는 terminal 상태 이후에도 보존한다.
- APK를 `v2.3.0 / versionCode 24`로 올렸고 emulator listener/SMS fixture E2E와 production Pages 배포를 통과했다.
- 슬라이스 8 캐시·빌드·문서 최종 정리로 진행할 수 있다.

## 변경 경계

- `docs/contracts/android-local-capture.md`, `test/fixtures/android-contracts.json`: capture v1, queue 상태, widget v2, 보안 경계를 문서와 실행 fixture로 정의했다.
- `android/src/com/aretenald/budget/AndroidCaptureContract.java`: Java schema/source/terminal ack/retry 정책의 단일 소유자다.
- `PaymentNotificationParser.java`: capture source와 schema version을 공통 계약에서 가져온다.
- `NotificationCaptureStore.java`: 모든 capture를 보존하고 진단 log만 200건으로 제한한다. 동일 ID enqueue 차단, retry backoff, exhausted 상태, terminal ack allowlist를 적용했다.
- `utils/android-capture.js`, `utils/android-flush.js`: Web이 schema/source/id/amount/date를 검증하고 invalid/save failure를 native queue에 실패 기록한다.
- `test/android-flush.test.mjs`: 로그아웃 보존, 로그인 직후 flush, saved/duplicate/merged ack, invalid schema와 저장 실패를 fake bridge로 검증한다.
- `domain/rewards/savings.js`, `RewardWidgetStore.java`: Web/Java widget schema version을 각각 명시하고 Java가 알 수 없는 version을 저장하지 않게 했다.
- `render-settings.js`: failed/exhausted/attempt/next retry 상태와 APK `v2.3.0`을 표시한다.

## 계약과 회귀 방지

- Android native는 서버 endpoint, Firestore, secret에 직접 접근하지 않는다.
- 로그인 전에는 SMS scan, queue list, save, ack를 수행하지 않는다.
- 동일 capture ID는 상태와 관계없이 다시 enqueue하지 않는다.
- 원본 capture는 삭제하지 않고 status만 변경한다. diagnostic log만 별도 상한으로 압축한다.
- terminal 상태는 `saved`, `duplicate`, `merged`만 허용한다.
- capture v1과 widget v2 필드 parity를 `scripts/verify/checks/android-checks.mjs`가 검사한다.

## 검증

- `npm.cmd test`: 60/60 통과.
- `npm.cmd run verify`: 통과, 167개 JS 파일 검사.
- `npm.cmd run verify:recipes`: 11개 sample 통과.
- `npm.cmd run verify:registered-recipes`: 9개 등록 레시피 검사 완료.
- `npm.cmd run pages:build`: `_site` 생성 통과.
- `npm.cmd run apk:build`: Android Studio JBR와 로컬 SDK를 주입해 `v2.3.0/24`, 42,032 bytes APK 빌드 성공.
- `npm.cmd run verify:android-notification`: emulator에서 listener와 SMS scanner가 카드 승인, 출금, 취소, 네이버페이 결제/취소를 capture v1 queued payload로 저장하고 OTP를 제외했다. `adb install -r` update 경로도 통과했다.
- GitHub Pages workflow [29190108283](https://github.com/aretenald2018-sys/budget/actions/runs/29190108283): secret 기반 update-safe APK build, verifier, Pages build/deploy 성공.
- production APK metadata와 파일은 HTTP 200이며 `versionCode: 24`, `versionName: 2.3.0`, `signing.mode: github-secret`, `updateSafe: true`다.
- 로그인된 production 설정 화면에서 Android queue panel, `v2.3.0 · Android APK`, `budget.apk?v=20260712-android-contract-r1` 링크를 확인했다.
- 360px viewport에서 body 폭 352px/viewport 360px로 수평 overflow가 없고 console warning/error 0건이었다.
- 물리 기기의 실제 결제 알림 → 앱 로그인 → Firestore 저장 → 거래 화면 표시 전 과정은 `not verified yet`; 이 작업 환경에 연결된 물리 Android 기기와 실제 결제 알림이 없는 것이 정확한 제한이다. emulator local queue E2E와 Web fake bridge 저장 계약은 통과했다.

## 커밋

- `b006261` Strengthen Android capture contracts

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 8에서 cache version source, Pages/APK artifact 계약, 문서와 검증 명령을 최종 정리하고 전체 회귀 audit를 수행한다.
