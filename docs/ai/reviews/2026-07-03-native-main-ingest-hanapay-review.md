# native 알림 수집 메인 경로 승격 리뷰

## 결론

- 소스 리뷰 결과, 이번 슬라이스에서 발견한 즉시 수정 필요 버그는 없다.
- native 알림 수집 확장은 기존 `NotificationListenerService` 범위 안에서만 이루어졌고, SMS inbox 직접 읽기나 새 위험 권한은 추가하지 않았다.
- 하나Pay 2,200원 fixture는 Gemini 없이 결정 파서에서 원하는 거래 필드로 변환된다.

## 확인한 위험

- 실제 Android 알림 수신 여부는 로컬/CI에서 재현할 수 없다. 새 APK 설치, 알림 접근 권한 허용, 실제 하나Pay 알림으로 최종 확인해야 한다.
- `/api/ingest` bridge가 운영 Vercel에 최신 `server-parser`로 배포되지 않으면 APK는 알림을 보내도 서버 파서 변경이 반영되지 않을 수 있다.
- 기존 기기에 저장된 `budget-api-liart` URL은 새 APK에서 새 기본 bridge로 보정되지만, 사용자가 다른 URL을 직접 저장해둔 경우에는 설정 화면에서 수동 확인이 필요하다.

## 검증 결과

- `node --check api/_lib/server-parser.js`: 통과
- `node --check scripts/verify-project.mjs`: 통과
- 하나Pay fixture 직접 파싱: 통과
- `npm.cmd run apk:build`: 통과
- `npm.cmd run pages:build`: 통과
- `npm.cmd run verify`: 통과

## 운영 확인 절차

- 의도한 변경만 선별해 commit/push한다.
- GitHub Pages workflow 성공 후 `https://aretenald2018-sys.github.io/budget/downloads/budget.apk`를 새로 설치한다.
- 앱 설정에서 Android 알림 수집의 URL이 `https://budget-snowy-iota.vercel.app/api/ingest`인지 확인하고 token을 저장한다.
- Android 알림 접근 권한을 켠 뒤 하나Pay 실제 알림을 발생시킨다.
- 설정의 native 로그가 `captured -> sent`로 바뀌고 거래 탭에 해당 결제가 생성되는지 확인한다.
