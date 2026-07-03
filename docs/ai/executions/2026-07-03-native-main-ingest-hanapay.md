# native 알림 수집 메인 경로 승격 실행

## 범위

- 계획 문서: `docs/ai/features/2026-07-02-native-notification-ingest.md`
- 실행 슬라이스: 슬라이스 5 `native 알림 수집 메인 경로 승격과 하나Pay 결정 파싱`

## 변경

- `BudgetNotificationListener`가 Android notification extras의 표준 text/bigText/textLines 외에 titleBig, subText, summaryText, infoText, messaging-style payload, 기타 text extras를 함께 수집하도록 확장했다.
- `NativeIngestStore`의 기본 API bridge를 실제 `/api/ingest` 응답 경로인 `https://budget-snowy-iota.vercel.app/api/ingest`로 바꾸고, 기존 `budget-api-liart` 저장값은 새 기본값으로 보정한다.
- `server-parser`에 `(결제|승인|취소|환불) 금액원 가맹점 / 결제수단 / MM.DD HH:mm` 형식의 카드 앱 알림 결정 파서를 추가했다.
- `verify-project`에 하나Pay 2,200원 fixture를 추가해 native notification 파서 회귀를 잡도록 했다.
- `npm.cmd run apk:build`로 `public/downloads/budget.apk`를 다시 생성했고, `npm.cmd run pages:build`로 Pages artifact를 갱신했다.

## 검증

- `node --check api/_lib/server-parser.js`: 통과
- `node --check scripts/verify-project.mjs`: 통과
- 하나Pay fixture 직접 파싱: `card_payment`, `amount=2200`, `merchant=씨유문정엠스테이트점`, `occurredAt=2026-07-03T08:40:00+09:00`
- `npm.cmd run apk:build`: 통과
- `npm.cmd run pages:build`: 통과
- `npm.cmd run verify`: 통과

## 남은 확인

- not verified yet: Android 실제 기기에서 새 APK 설치 후 알림 접근 권한을 켜고, 하나Pay 실제 결제 알림이 native 로그에서 `captured -> sent`가 된 뒤 거래로 생성되는지는 기기 알림 이벤트가 필요하다.
- not verified yet: 운영 GitHub Pages 배포는 현재 worktree에 여러 unrelated dirty/untracked 변경이 섞여 있어 안전하게 push하지 않았다.
