# Android 오늘의 적립 위젯 리뷰

## 기준

- 계획 문서: `docs/ai/features/2026-07-03-reward-points-triple-android-widget.md`
- 실행 문서: `docs/ai/executions/2026-07-03-reward-widget-provider.md`
- 리뷰 대상: 슬라이스 4 `Android 홈 화면 위젯 구현`

## findings

- 발견된 코드 결함 없음.

## 확인한 내용

- `AndroidManifest.xml`에 `.RewardWidgetProvider` receiver, `APPWIDGET_UPDATE`, `@xml/reward_widget_info` metadata가 등록됐다.
- `RewardWidgetProvider`는 `AppWidgetProvider` + `RemoteViews`로 구현되어 마지막 `RewardWidgetStore` snapshot만 읽는다.
- 위젯은 `오늘의 적립`, 갱신 시각, 오늘 절약액, 평소 기준액, `와인`, `재료`, `여행` 오늘 포인트를 표시한다.
- snapshot이 없거나 파싱에 실패하면 `앱을 열어 갱신` empty state를 표시한다.
- 위젯 클릭은 `MainActivity`를 여는 `PendingIntent`로 연결되어 있다.
- `RewardWidgetStore.saveSnapshot()`은 저장 후 `RewardWidgetProvider.updateAll(context)`를 호출한다.
- provider/store에 Firestore 직접 조회, HTTP, Gemini/Firebase/Gmail secret 경로가 추가되지 않았다.
- APK 버전과 다운로드 cache-bust가 `v2.1.1` / `versionCode 12` / `20260703-reward-widget-provider-v12`로 맞다.

## 검증 확인

- `node --check`
  - `scripts/verify-project.mjs`
  - `render-report.js`
  - `utils/reward-savings.js`
- `npm.cmd run apk:build`
  - 통과: `public/downloads/budget.apk`, `v2.1.1/12`, `local-persistent`.
- `npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` 생성 완료.
- `git diff --check`
  - 통과.
- production 배포:
  - 커밋 `b2fc547`가 `main`에 푸시됨.
  - `Validate` workflow `28648832144` 성공.
  - `Deploy GitHub Pages` workflow `28648832113` 성공.
  - 운영 URL HTTP 200.
  - 운영 `index.html`에 `20260703-reward-widget-provider` cache-bust 반영 확인.
  - 운영 APK metadata `v2.1.1/12`, `20260703-reward-widget-provider-v12` 확인.

## residual risk

- 실제 휴대폰을 현재 연결할 수 없어 다음은 `not verified yet`:
  - APK 실기기 설치/업데이트.
  - launcher 위젯 목록에 `오늘의 적립` 위젯이 보이는지 확인.
  - 휴대폰 배경화면에 위젯 추가.
  - 앱 홈 진입 후 snapshot 저장과 위젯 최신값 표시 확인.

## 결론

- 슬라이스 4는 코드/빌드/정적 계약 리뷰 기준으로 통과.
- production 배포와 운영 APK metadata 확인까지 완료.
- 실기기 위젯 확인은 휴대폰 연결 가능한 시점에 별도로 해야 한다.
