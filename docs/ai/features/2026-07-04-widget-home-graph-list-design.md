# 위젯과 홈 그래프 목록형 디자인 계획

## 요청 원문

`/goal 가계부 앱 위젯 디자인 및 홈탭 내에서 렌더링되는 그래프를 2사진의 디자인 느낌으로 변경(색을 바꾸라는 의미는 아님)`

참고 이미지:

- `C:\Users\USER\Desktop\Tomato Project\budgetproject\.codex-remote-attachments\019f29da-9a60-7632-a24a-5deff51a200d\b50ce183-8353-47d2-92f7-6a9f4781a189\1-Photo-1.jpg`
- `C:\Users\USER\Desktop\Tomato Project\budgetproject\.codex-remote-attachments\019f29da-9a60-7632-a24a-5deff51a200d\b50ce183-8353-47d2-92f7-6a9f4781a189\2-Photo-2.jpg`

## 이해한 내용

- 목표:
  - Android 홈 화면 위젯의 정보 구조를 2번 사진의 목록형 위젯 프리뷰처럼 만든다.
  - 홈 탭 안에서 렌더링되는 그래프성 UI, 특히 `오늘의 적립` 포인트 진행선과 `이번 2주/이번 달 변동비` 게이지를 같은 목록형 위젯 문법으로 정리한다.
  - 2번 사진의 초록/회색 색상 자체를 가져오지 않고, 현재 앱의 `docs/design-system.md` 색상 토큰과 보라-블루 progress DNA를 유지한다.
- 비목표:
  - 포인트 계산식, 카테고리 예산 산식, Firestore 데이터 모델 변경.
  - Gmail/receipt/Android 알림 수집 로직 변경.
  - 홈 히어로 카드의 다크 그라디언트 색상 체계 변경.
  - 다른 탭의 리포트/목표 그래프까지 동시에 리디자인.
- 사용자 흐름:
  - 홈 탭에서 변동비 그래프가 한 장의 위젯 카드 안에 둥근 row 목록으로 보인다.
  - 각 row는 아이콘 또는 축약 라벨, 이름, 진행 bar, 우측 값이 한 덩어리로 읽힌다.
  - `오늘의 적립` 포인트 row도 같은 row 문법으로 보여서 Android 위젯과 홈 그래프가 같은 제품처럼 느껴진다.
  - Android launcher 위젯은 배경화면에서 현재처럼 `오늘의 적립` 값을 보여주되, 포인트 3개가 가로 텍스트 3칸이 아니라 세로 목록형 progress row로 보인다.
- 데이터 가정:
  - Android 위젯은 기존 `RewardWidgetStore` snapshot만 읽는다. 위젯에서 네트워크, Firestore, secret을 직접 쓰지 않는다.
  - progress 기준은 웹 홈 포인트 row는 기존 `targetAmount`, 변동비 row는 기존 category target을 사용한다.
  - Android 위젯의 row progress도 snapshot의 `monthPoints / targetAmount` 또는 값이 없을 때 0 상태를 사용한다.
- 열려 있는 질문:
  - 없음. 사용자가 "색을 바꾸라는 의미는 아님"이라고 명시했으므로 색상보다 구조, 반경, row rhythm, progress anatomy를 가져오는 것으로 확정한다.

## 참고 이미지 분석

- 1번 사진:
  - 현재 가계부 위젯은 다크 카드, 큰 `+145,481원`, 하단 3개 포인트 텍스트 컬럼 중심이다.
  - 정보는 보이지만 세 포인트가 progress 구조가 아니라 텍스트 덩어리로 분리되어 있어 "위젯 목록형" 느낌이 약하다.
- 2번 사진:
  - 핵심은 색상이 아니라 `큰 회색 preview well` 안에 `작은 흰색 rounded widget`이 놓이고, widget 내부가 3-4개의 둥근 horizontal bar row로 구성되는 점이다.
  - 4x2 preview는 각 row가 `아이콘/라벨/채워진 bar/우측 퍼센트`를 한 줄에 결합한다.
  - row 사이 간격은 작고, bar track은 pill 형태이며, 값은 우측 끝에 tabular number처럼 정렬된다.
  - 2x2 preview는 라벨을 줄이고 아이콘+값 중심으로 압축한다.

## 현재 코드 확인

- `render-home.js`
  - 홈 탭은 `renderReport({ rootSelector: '#tab-home', homeMode: true })`로 렌더한다.
- `render-report.js`
  - `rewardSavingsCard()`가 홈 `오늘의 적립` 카드를 만든다.
  - `rewardPointBucketRow()`는 이미 `home-reward-point-progress` 진행선을 만들지만 2번 사진처럼 bar row 자체가 주요 시각 단위는 아니다.
  - `budgetGaugeGroups()`와 `gaugeRow()`가 홈 변동비 그래프를 만든다.
  - 홈 변동비는 `budgetGaugeGroups(homeVariableCategories, ..., { showIcon: false })`로 렌더되어 현재 icon이 빠지고 값은 아래 meta로 빠진다.
- `styles/20-records.css`, `styles/60-urge.css`
  - `.budget-gauge-panel`, `.budget-gauge-row`, `.gauge-track`, `.gauge-fill`, `.home-reward-point-*`가 실제 홈 그래프 표면을 만든다.
  - `#tab-home .home-variable-panel .gauge-fill*`는 홈에서 모든 게이지 fill을 `var(--grad-bar)`로 통일한다.
- `android/res/layout/reward_widget.xml`
  - 현재 위젯은 다크 vertical summary + 하단 3개 `TextView` 컬럼이다.
  - progress bar, row track, 2x2/4x2 density 대응은 아직 없다.
- `android/res/xml/reward_widget_info.xml`
  - 현재 launcher widget preview는 `@drawable/ic_launcher`라 실제 위젯 구조를 보여주지 않는다.
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
  - `RemoteViews`에 title, updated, saved, baseline, 세 bucket 텍스트를 채운다.
  - `RewardWidgetStore.snapshotJson()`만 읽고 network/secret 경로는 없다.
- `docs/design-system.md`
  - 기존 progress bar 규칙과 변동비 카드 규칙은 있으나, 이번 요청의 "목록형 위젯 그래프" primitive는 아직 없다.
- 캐시/배포:
  - repo root에 `sw.js`, `STATIC_ASSETS`, `CACHE_VERSION`은 없다.
  - CSS/JS 변경 시 `index.html`, `app.js`, `render-home.js`의 cache-busting query string과 `scripts/verify-project.mjs`의 canonical version 갱신이 필요하다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: 2번 사진에서 가져올 것은 색상인가, 구조인가?
- 추천 답변: 구조. 현재 앱의 브랜드 색상과 progress token은 유지하고, 2번 사진의 rounded list widget anatomy만 가져온다.
- 사용자 답변: 요청 원문에서 "색을 바꾸라는 의미는 아님"이라고 명시.
- 확정된 결정:
  - 색상은 `docs/design-system.md`의 현재 토큰을 유지한다.
  - 새 primitive 이름은 `목록형 위젯 그래프`로 두고, 웹 홈 그래프와 Android widget layout이 같은 row 문법을 공유하게 한다.
  - 홈 변동비와 오늘의 적립 포인트 row는 같은 계열로 보이게 하되, 기존 계산/데이터는 건드리지 않는다.
  - Android 위젯은 snapshot 기반 유지. 직접 Firestore 조회나 secret 경로는 추가하지 않는다.
- 남은 가정:
  - Android launcher의 실제 2x2/4x2 preview 품질은 실기기/에뮬레이터 launcher가 제공하는 preview 지원 수준에 따라 달라질 수 있다. 실행 시 가능한 범위에서 `previewImage` 또는 지원되는 `previewLayout`을 확인한다.

## 결정 기록

- 결정: 색상 변경이 아니라 row anatomy 변경으로 실행한다.
- 이유: 사용자가 색상 변경이 아님을 직접 명시했고, 앱의 기존 디자인 시스템도 progress bar를 보라-블루 token으로 통일하도록 요구한다.
- 되돌릴 수 있는가: 가능. CSS class와 Android layout/drawable 변경을 되돌리면 산식과 데이터에는 영향이 없다.

- 결정: 웹 홈 그래프와 Android 위젯을 별도 실행 슬라이스로 나눈다.
- 이유: 웹 홈은 browser/production UI 검증이 필요하고, Android 위젯은 APK build와 launcher widget 추가 검증이 필요하다. 한 슬라이스에 묶으면 수동 QA 표면이 달라진다.
- 되돌릴 수 있는가: 가능. 한 표면만 rollback하거나 수정할 수 있다.

- 결정: `docs/design-system.md`에 먼저 `목록형 위젯 그래프` primitive를 추가한 뒤 코드에 적용한다.
- 이유: frontend skill의 design-system gate와 이 프로젝트의 기존 디자인 토큰 규칙을 만족해야 한다.
- 되돌릴 수 있는가: 가능. 해당 primitive 문서와 CSS/Android layout 변경만 되돌리면 된다.

## 실행 슬라이스

### 슬라이스 1: 홈 그래프 목록형 위젯 primitive

- 목표:
  - 홈 탭의 `오늘의 적립` 포인트 진행선과 `이번 2주/이번 달 변동비` 게이지를 2번 사진의 목록형 위젯 row 구조로 바꾼다.
- 범위:
  - `docs/design-system.md`에 `목록형 위젯 그래프` primitive와 상태 규칙을 추가한다.
  - `render-report.js`에서 홈 전용 graph row class/markup을 정리한다.
  - `rewardPointBucketRow()`를 `아이콘/축약 라벨 + label + filled track + 우측 값` 구조로 바꾼다.
  - 홈 `gaugeRow()`는 `homeMode && showIcon === false`일 때 목록형 widget row anatomy를 쓰도록 한다.
  - CSS는 `styles/60-urge.css` 중심으로 반경, row 높이, pill track, 우측 값 정렬, 340px 이하 보정을 추가한다.
  - `style.css`, `index.html`, `app.js`, `render-home.js` cache-busting query string과 `scripts/verify-project.mjs` canonical version을 갱신한다.
- 예상 수정 파일:
  - `docs/design-system.md`
  - `render-report.js`
  - `styles/60-urge.css`
  - 필요 시 `styles/20-records.css`
  - `style.css`
  - `index.html`
  - `app.js`
  - `render-home.js`
  - `scripts/verify-project.mjs`
- 수정하지 말 것:
  - Android native widget layout/provider.
  - 포인트 계산식, targetAmount 저장 구조, category target 산식.
  - 리포트 탭 전체 그래프와 목표 탭 finance chart.
  - Gmail/receipt/Android notification ingest.
- 구현 메모:
  - 홈 전용 class를 써서 리포트 탭의 기존 `.budget-gauge-panel` 동작을 망가뜨리지 않는다.
  - row 값은 `tabular-nums`와 `min-width: 0`/ellipsis를 같이 사용해 긴 카테고리명과 큰 금액이 겹치지 않게 한다.
  - 2번 사진의 `2x2/4x2` 텍스트는 UI에 노출하지 않는다. 그 사진의 preview density만 참고한다.
  - icon은 emoji가 아니라 기존 category emoji를 그대로 쓰거나, 없으면 짧은 한글/initial mark로 둔다. 새 emoji 장식은 추가하지 않는다.
  - progress fill은 `var(--grad-bar)`를 유지하고, 성공/경고 색상 확장을 새로 만들지 않는다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - 운영 배포 후 `Deploy GitHub Pages` workflow 성공 확인.
  - 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 홈 탭 진입.
  - 모바일 폭 기준으로 `오늘의 적립` 포인트 row와 `이번 2주/이번 달 변동비` row가 목록형 rounded widget row로 보이는지 visual QA.
  - 홈에서 `이번 2주` -> `이번 달` -> `이번 2주` 전환 후 row 구조, bar fill, 우측 값, 텍스트 줄바꿈을 확인한다.
- 완료 증거:
  - production URL HTTP 200.
  - 홈 `오늘의 적립`의 세 포인트가 목록형 progress row로 보인다.
  - 홈 `이번 2주/이번 달 변동비`가 2번 사진처럼 둥근 bar row 목록으로 보인다.
  - 색상은 앱 기존 토큰을 유지하고 2번 사진의 초록 팔레트를 그대로 가져오지 않는다.
  - 340px, 390px, 430px급 모바일 폭에서 텍스트/값/progress가 겹치지 않는다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 1 `홈 그래프 목록형 위젯 primitive`만 실행한다. Android native widget layout/provider는 아직 수정하지 않는다.

### 슬라이스 2: Android 홈 화면 위젯 목록형 레이아웃

- 목표:
  - Android 홈 화면 위젯을 2번 사진의 목록형 widget preview 느낌으로 바꾼다.
- 범위:
  - `reward_widget.xml`을 큰 금액 summary + 세 포인트 세로 progress row 구조로 바꾼다.
  - `RewardWidgetProvider`가 row별 label, value, progress를 채운다.
  - 필요하면 progress row용 drawable/layer-list를 추가한다.
  - `reward_widget_info.xml`의 크기, resize, preview를 실제 위젯 구조와 맞춘다. 지원 가능한 경우 dedicated preview drawable 또는 supported preview layout을 쓴다.
  - APK version/cacheBust와 설정 화면 다운로드 metadata를 갱신한다.
  - `scripts/verify-project.mjs`에 새 위젯 row 계약과 stale preview 방지 토큰을 추가한다.
- 예상 수정 파일:
  - `android/res/layout/reward_widget.xml`
  - `android/res/drawable/reward_widget_background.xml`
  - 새 drawable 후보: `android/res/drawable/reward_widget_row_background.xml`, `android/res/drawable/reward_widget_progress.xml`
  - `android/res/xml/reward_widget_info.xml`
  - `android/src/com/aretenald/budget/RewardWidgetProvider.java`
  - `android/apk-version.json`
  - `render-settings.js`
  - `scripts/verify-project.mjs`
  - 필요 시 `scripts/build-android-apk.mjs`
- 수정하지 말 것:
  - 위젯에서 Firestore, HTTP, Gemini/Firebase/Gmail secret 직접 조회.
  - Android notification/SMS ingest service.
  - 웹 홈 그래프 추가 리디자인.
- 구현 메모:
  - RemoteViews 제한을 우선 고려한다. 직접 custom view나 Compose는 추가하지 않는다.
  - 2x2 크기에서는 label을 짧게 유지하고, 4x2 이상에서는 label/value/progress를 모두 읽히게 한다.
  - snapshot이 없으면 기존 empty state를 유지하되 같은 row layout 안에서 `앱을 열어 갱신`이 보이게 한다.
  - 오늘 카드 보너스가 있는 bucket은 텍스트로만 조용히 표시하고, 새 강한 색상 체계를 만들지 않는다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run apk:build`
  - 가능하면 emulator/실기기에서 APK 설치 또는 업데이트.
  - launcher 위젯 목록에서 `오늘의 적립` 위젯 preview 확인.
  - 홈 화면에 widget 추가 후 앱 홈 진입으로 snapshot 저장, widget row 값/진행선 갱신 확인.
  - 운영 배포 후 `Deploy GitHub Pages` workflow 성공과 APK metadata HTTP 200 확인.
- 완료 증거:
  - APK build가 통과한다.
  - launcher widget 목록에서 `@drawable/ic_launcher`가 아닌 실제 위젯 형태 preview가 보이거나, 기기 제한으로 preview가 불가능한 경우 그 정확한 제한을 `not verified yet`로 기록한다.
  - 홈 화면 위젯이 세 포인트를 세로 목록형 progress row로 보여준다.
  - 2x2/4x2 resizing에서 텍스트가 겹치지 않는다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 2 `Android 홈 화면 위젯 목록형 레이아웃`만 실행한다. 웹 홈 그래프 추가 리디자인은 하지 않는다.

### 슬라이스 3: 디자인/기능 리뷰

- 목표:
  - 슬라이스 1-2가 요청의 구조적 디자인 목표를 만족하는지 리뷰한다.
- 범위:
  - 계획 문서와 변경 파일 대조.
  - `docs/design-system.md` primitive 준수 여부 확인.
  - cache-bust, service worker 대상 없음, APK metadata, production Pages 배포 상태 확인.
  - 홈 탭 visual QA와 Android widget QA 증거 확인.
- 예상 수정 파일:
  - `docs/ai/reviews/2026-07-04-widget-home-graph-list-design-review.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 새 디자인 개선이나 기능 추가.
- 검증 방법:
  - 리뷰 중 발견한 문제를 재현 가능한 항목으로 기록한다.
  - 문제가 있으면 다음 상태를 `ready_for_fix`로 둔다.
- 완료 증거:
  - 문제가 없으면 계획 상태를 `complete`로 둔다.
  - 문제가 있으면 focused fix 범위와 검증 방법이 명확하다.
- 다음 세션 시작 프롬프트:
  - 이 계획과 직전 실행 변경 파일을 읽고 리뷰한다. 새 기능은 구현하지 않는다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 버그, 회귀, 누락된 테스트, 오래된 cache-bust/service-worker 이슈, Android widget metadata, 홈 탭 visual QA 누락, 2번 사진 구조 반영 실패를 우선 리뷰한다. 리뷰 중에는 새 기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 계획 작성 완료.
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 슬라이스 1 `홈 그래프 목록형 위젯 primitive` 실행.
- 차단 질문: 없음.
