# 포인트 3분화와 Android 위젯 계획

## 요청 원문

`오늘의 적립` 포인트 제도를 3분화한다.

- 현재 구현된 포인트는 `와인구매 포인트`로 삼는다.
- 새로 `고급재료 포인트`, `여행충당 포인트`를 추가한다.
- 설정창에서 각 포인트의 적립률을 직접 설정할 수 있게 한다.
- 현재 보이는 `120,000` 포인트 상한을 없앤다.
- 홈에서 `이번달` 버튼을 누르면 CSS가 깨지는 문제를 수정한다.
- 이후 `오늘의 적립` 관련 정보를 Android 위젯으로 만들어 휴대폰 배경화면에서 항상 볼 수 있게 하는 것까지 목표로 한다.

참고 이미지:

- `C:\Users\USER\.codex\attachments\9ddafe6d-3771-4125-a9ac-09343abeabd9\image-1.png`
- `C:\Users\USER\.codex\attachments\9ddafe6d-3771-4125-a9ac-09343abeabd9\image-2.png`

## 이해한 내용

- 목표:
  - 단일 `포인트`를 `와인구매`, `고급재료`, `여행충당` 3개 버킷으로 나눈다.
  - 기존 단일 포인트/적립률은 `와인구매 포인트`로 마이그레이션한다.
  - 각 버킷은 설정 화면에서 독립 적립률을 가진다.
  - 포인트 계산에는 더 이상 일/월 상한을 적용하지 않는다. 기존 `120,000` 월 상한 표시는 제거한다.
  - 홈의 `이번 달` 전환이 홈 모드 스타일과 문구를 유지하게 한다.
  - Android 홈 화면 위젯은 웹 변경 뒤 별도 APK 슬라이스로 구현한다.
- 비목표:
  - 이번 첫 실행 슬라이스에서 포인트 사용/차감 장부, 와인 구매 자동 차감, 고급재료/여행 예산 자동 이체는 만들지 않는다.
  - Android 위젯은 첫 웹 슬라이스에 끼워 넣지 않는다.
  - Gemini/API secret은 Android나 browser 코드로 옮기지 않는다.
- 사용자 흐름:
  - 홈에서 `오늘의 적립` 카드가 오늘 절약액과 3개 포인트의 오늘/이번달 적립을 보여준다.
  - 설정 > `보상 적립`에서 세 포인트의 적립률을 바꾸고 저장하면 홈 카드가 즉시 갱신된다.
  - 홈에서 `이번 2주`와 `이번 달`을 오가도 홈 카드의 CSS와 홈 전용 문구가 유지된다.
  - 이후 Android APK를 설치/업데이트하고 홈 화면에 위젯을 추가하면 최신 `오늘의 적립` 요약을 볼 수 있다.
- 데이터 가정:
  - `appSettings.rewardSavings.allocationRate`는 legacy 단일 적립률이다. 새 구조에서는 `pointRates.winePurchase`로 흡수한다.
  - 신규 `pointRates.premiumIngredients`, `pointRates.travelFund` 기본값은 `0`으로 시작한다. 사용자가 설정해야 추가 포인트가 쌓인다.
  - 세 적립률은 서로 독립이다. 합계가 100%를 넘는 것을 자동으로 막지 않는다.
- 열려 있는 질문:
  - 없음. 세 적립률 독립 계산을 기본 결정으로 두고 실행한다.

## 현재 코드 확인

- `utils/reward-savings.js`
  - 현재 단일 `allocationRate`, `dailyPointCap`, `monthPointCap`로 `todayPoints`, `monthPoints`, `projectedMonthPoints`를 계산한다.
  - 기본 월 상한은 `DEFAULT_MONTH_POINT_CAP = 120000`이다.
- `data.js`
  - `DEFAULT_APP_SETTINGS.rewardSavings`에도 `allocationRate`, `dailyPointCap`, `monthPointCap`가 있다.
  - 정규화에서 `dailyPointCap`은 `50000`, `monthPointCap`은 `500000`으로 다시 제한한다.
- `render-settings.js`
  - 설정 화면 `보상 적립` 폼에 단일 `적립 배분율`, `일 상한`, `월 상한` 입력이 있다.
- `render-report.js`
  - 홈은 `renderHome()` -> `renderReport({ rootSelector: '#tab-home', homeMode: true })`로 구현되어 있다.
  - `rewardSavingsCard()`는 `포인트 ${monthPoints} / ${monthPointCap}`와 진행바를 표시한다.
  - `window.reportViewMode()`가 모듈 전역 `STATE.homeMode`, `STATE.rootSelector`에 의존한다.
- `styles/60-urge.css`
  - 홈 전용 히어로 스타일은 `.home-hero-card`와 `.home-cycle-mode-row`가 붙어야 적용된다.
  - `#tab-home .report-body`를 기대하는 규칙이 있으나 렌더 HTML은 `id="report-body"`만 만들고 `class="report-body"`가 없다.
- Android
  - 현재 `AndroidManifest.xml`에는 `MainActivity`와 `BudgetNotificationService`만 있다.
  - `AppWidgetProvider`, 위젯 `receiver`, `res/xml/*widget*`, `res/layout/*widget*`는 아직 없다.
  - `BudgetAndroidBridge`는 알림/SMS 수집 큐와 설정 열기 중심이다.
- 캐시/배포
  - repo root에 `sw.js`, `STATIC_ASSETS`, `CACHE_VERSION`은 없다.
  - CSS/JS 변경 시 `index.html`, `app.js`, 동적 import query string과 `style.css` import query string 갱신이 필요하다.

## 진단 결과

- 적용 트리거: `/diagnose`
- 증상: 참고 이미지 2에서 홈 탭인데 `이번 달` 전환 후 히어로가 홈 카드 스타일을 잃고 기본 버튼/텍스트처럼 보인다.
- 확인한 단서:
  - 이미지 2의 제목이 `2026-07 지출 합계`로 보인다. 홈 월간 모드라면 `2026-07 조절비`가 기대된다.
  - 이미지 2의 모드 버튼은 `.home-hero-card .report-mode-tabs button` 스타일을 받지 못한 native button처럼 보인다.
- 우선 가설:
  - `render-report.js`의 전역 `STATE`가 홈/리포트 두 사용처를 동시에 다루면서 `homeMode`가 false인 상태로 홈 root에 재렌더된다.
  - `id="report-body"`가 홈/리포트 양쪽에서 중복될 수 있고, `$('#report-body')`가 document 전역 조회라 잘못된 root를 갱신할 위험이 있다.
  - `report-body` class 누락 때문에 홈 responsive CSS 일부도 적용되지 않는다.
- 진단에 따른 수정 방향:
  - 모드 버튼 이벤트는 클릭된 root 기준으로 처리한다.
  - report body 조회는 `root.querySelector()`로 scope를 제한한다.
  - wrapper에 `class="report-body"`를 추가한다.
  - 홈에서 `이번 달`을 누른 뒤에도 `homeMode === true` 문구/클래스가 유지되는지 검증한다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: 기존 단일 포인트를 세 포인트 중 어디로 이관할 것인가?
- 추천 답변: `와인구매 포인트`. 사용자가 이미 “현재 구현된건 와인구매 포인트로”라고 지정했고, 기존 와인 보상 카드 맥락과도 맞다.
- 사용자 답변: 요청 원문에서 `와인구매 포인트`로 지정.
- 확정된 결정:
  - 기존 단일 적립률/누적 포인트 표시는 `와인구매 포인트`로 재해석한다.
  - `고급재료`, `여행충당`은 같은 절약액 기준에서 별도 적립률로 계산한다.
  - 상한은 계산과 UI에서 제거한다.
  - Android 위젯은 웹 산식/표시가 안정된 뒤 native 위젯으로 확장한다.
- 남은 가정:
  - 세 적립률은 독립이며 합계 100% 제한이 없다.
  - 신규 버킷 기본 적립률은 `0%`다.

## 결정 기록

- 결정: 새 설정 구조는 `rewardSavings.pointRates`로 둔다.
- 이유: legacy `allocationRate`를 보존 마이그레이션하기 쉽고, 이후 버킷별 이름/색/노출 순서를 확장할 수 있다.
- 되돌릴 수 있는가: 가능. legacy `allocationRate`를 계속 읽는 호환 레이어를 두면 rollback이 쉽다.

- 결정: 포인트 상한은 일/월 모두 active 계산에서 제거한다.
- 이유: 사용자는 현재 보이는 `120,000` 상한 제거를 요청했지만, 설정에는 `일 상한`도 있어 “상한 없는 포인트”와 충돌한다. 상한 입력을 남기면 사용자가 여전히 제한이 있다고 느낀다.
- 되돌릴 수 있는가: 가능. legacy 필드는 저장 문서에 남아도 계산에서만 무시하면 된다.

- 결정: Android 위젯은 웹 계산 결과를 native `SharedPreferences`에 snapshot으로 저장하고 `AppWidgetProvider`가 그 값을 렌더한다.
- 이유: 현재 APK는 WebView + JS bridge 구조이며 native Firebase SDK가 없다. 위젯에서 Firestore를 직접 읽게 만들면 인증/secret 문제가 커진다.
- 되돌릴 수 있는가: 가능. snapshot bridge만 제거하면 웹 기능에는 영향이 없다.

## 실행 슬라이스

### 슬라이스 1: 웹 포인트 3분화와 홈 `이번 달` CSS 복구

- 목표:
  - 홈/설정의 보상 적립을 3개 포인트로 바꾸고 상한 표시/계산을 제거한다.
  - 홈 `이번 달` 버튼이 홈 스타일과 홈 문구를 유지하도록 수정한다.
- 범위:
  - legacy 단일 `allocationRate`를 `와인구매 포인트` 적립률로 마이그레이션한다.
  - `고급재료 포인트`, `여행충당 포인트` 적립률 입력을 추가한다.
  - `dailyPointCap`, `monthPointCap`는 계산/표시/설정 UI에서 제거하거나 legacy-only로 무시한다.
  - `rewardSavingsCard()`를 3개 포인트 행 구조로 바꾼다.
  - `render-report.js`의 home/report 모드 전환을 root-scoped로 안전하게 고친다.
  - CSS와 cache-busting query string을 함께 갱신한다.
- 예상 수정 파일:
  - `data.js`
  - `utils/reward-savings.js`
  - `render-report.js`
  - `render-settings.js`
  - `styles/60-urge.css`
  - `style.css`
  - `index.html`
  - `app.js`
  - `render-home.js`
  - 필요 시 `scripts/verify-project.mjs`
- 수정하지 말 것:
  - Android native 위젯 구현
  - 포인트 사용/차감 거래 장부
  - Gmail/receipt/Android 알림 수집 로직
  - Firestore raw message 삭제
- 구현 메모:
  - 포인트 버킷 상수 예: `winePurchase`, `premiumIngredients`, `travelFund`.
  - `buildRewardSavingsSummary()`는 `pointBuckets` 배열을 반환한다. 각 row는 `key`, `label`, `rate`, `todayPoints`, `monthPoints`, `projectedMonthPoints`를 가진다.
  - 기존 `summary.todayPoints`, `summary.monthPoints`가 필요하면 와인 버킷 alias로 유지하거나 검증 스크립트와 함께 갱신한다.
  - cap 제거 뒤 진행바는 상한 대비 progress가 아니라 삭제하거나 “오늘/이번달/예상” 텍스트 중심으로 바꾼다.
  - 설정 저장은 빈 값 `0%`, 소수점 `0.1%` 단위, `0..100` 범위를 허용한다.
  - `reportModeControlHtml()`는 inline `onclick` 대신 `data-report-view-mode`와 root delegation으로 바꾸는 편이 안전하다.
  - `root.querySelector('[data-report-body]')`를 사용해 홈/리포트 `report-body` 중복 id 문제를 없앤다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - 운영 배포 후 `Deploy GitHub Pages` workflow 성공 확인.
  - 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 홈 탭 확인.
- 완료 증거:
  - 홈 `오늘의 적립` 카드에 `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트`가 보인다.
  - `포인트 n / 120,000` 형식과 월 상한 진행바가 보이지 않는다.
  - 설정 화면에서 세 적립률을 각각 저장할 수 있고 홈 표시가 갱신된다.
  - 홈에서 `이번 2주` -> `이번 달` -> `이번 2주`를 눌러도 버튼이 native 스타일로 깨지지 않고, 월간 제목이 홈용 문구로 유지된다.
  - production URL이 HTTP 200이고 위 UI 상태가 재현된다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 1 `웹 포인트 3분화와 홈 이번 달 CSS 복구`만 실행한다. Android 위젯과 포인트 차감 장부는 구현하지 않는다.

### 슬라이스 2: 웹 슬라이스 리뷰

- 목표:
  - 슬라이스 1 변경에서 산식 마이그레이션, 상한 제거, 홈/리포트 상태 분리, cache-busting 누락을 리뷰한다.
- 범위:
  - 변경 파일과 계획 문서 대조.
  - `npm.cmd run verify`, `npm.cmd run pages:build`, production UI 검증 증거 확인.
- 예상 수정 파일:
  - `docs/ai/reviews/2026-07-03-reward-points-triple-android-widget-web-review.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 새 기능 추가.
- 검증 방법:
  - 리뷰 중 발견한 문제를 재현 가능한 항목으로 기록한다.
- 완료 증거:
  - 문제가 없으면 다음 상태를 Android 위젯 실행 대기로 둔다.
  - 문제가 있으면 다음 상태를 focused fix로 둔다.
- 다음 세션 시작 프롬프트:
  - 이 계획과 슬라이스 1 실행 변경 파일을 읽고 리뷰한다. 새 기능은 구현하지 않는다.

### 슬라이스 3: Android 위젯 snapshot bridge

- 목표:
  - 웹에서 계산된 `오늘의 적립` 요약을 Android native 저장소에 넘기는 최소 계약을 만든다.
- 범위:
  - WebView bridge에 `updateRewardWidgetSnapshot(json)` 또는 동등한 메서드를 추가한다.
  - 홈 보상 카드 렌더 후 Android bridge가 있으면 snapshot을 전달한다.
  - native는 `SharedPreferences`에 최신 snapshot과 갱신 시각을 저장한다.
  - 아직 홈 화면 위젯 UI는 만들지 않는다.
- 예상 수정 파일:
  - `android/src/com/aretenald/budget/BudgetAndroidBridge.java`
  - 새 파일 후보: `android/src/com/aretenald/budget/RewardWidgetStore.java`
  - `render-report.js`
  - `utils/reward-savings.js`
  - `scripts/verify-project.mjs`
  - `scripts/build-android-apk.mjs`
  - `android/apk-version.json`
  - `render-settings.js`의 APK cache-bust 링크
  - `index.html`, `app.js` 등 cache-busting 대상
- 수정하지 말 것:
  - Android 홈 화면 widget receiver/provider 등록
  - native Firebase/HTTP/secret 추가
- 구현 메모:
  - snapshot에는 `todaySaved`, `todaySpend`, `dailyBaseline`, 세 `pointBuckets`, `updatedAt`만 담는다.
  - bridge 실패는 웹 렌더를 막지 않는다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run apk:build`
  - Android emulator/실기기에서 앱 홈 진입 후 SharedPreferences snapshot 저장 확인.
- 완료 증거:
  - APK build가 통과한다.
  - Android bridge가 snapshot 저장 메서드를 노출하고 verify script가 이를 확인한다.
  - 앱 홈 진입 후 native 저장소에 세 포인트 snapshot이 남는다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 3 `Android 위젯 snapshot bridge`만 실행한다. 실제 AppWidgetProvider UI는 다음 슬라이스로 남긴다.

### 슬라이스 4: Android 홈 화면 위젯 구현

- 목표:
  - 휴대폰 배경화면에 추가 가능한 `오늘의 적립` Android App Widget을 만든다.
- 범위:
  - `AppWidgetProvider` 추가.
  - `AndroidManifest.xml`에 widget receiver 등록.
  - `res/xml/*widget_info.xml`, `res/layout/*widget*.xml` 등 위젯 리소스 추가.
  - `RewardWidgetStore` snapshot을 `RemoteViews`에 렌더.
  - 앱 홈 갱신, 앱 설치/부팅/위젯 업데이트 이벤트에서 위젯을 refresh.
- 예상 수정 파일:
  - `android/AndroidManifest.xml`
  - 새 파일 후보: `android/src/com/aretenald/budget/RewardWidgetProvider.java`
  - `android/src/com/aretenald/budget/RewardWidgetStore.java`
  - `android/res/xml/reward_widget_info.xml`
  - `android/res/layout/reward_widget.xml`
  - `android/res/values/strings.xml`
  - `scripts/build-android-apk.mjs`
  - `scripts/verify-project.mjs`
  - `android/apk-version.json`
  - `render-settings.js`
- 수정하지 말 것:
  - 위젯에서 Firestore 직접 로그인/조회.
  - server secret 또는 Gemini key 추가.
- 구현 메모:
  - 위젯은 마지막 snapshot을 표시한다. 앱을 열어 홈이 계산되면 최신값으로 갱신된다.
  - snapshot이 없으면 `앱을 열어 오늘의 적립을 갱신하세요` 같은 짧은 empty state를 표시한다.
  - 3개 포인트가 좁은 widget 안에서 줄바꿈/겹침 없이 보이도록 숫자와 라벨을 짧게 설계한다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run apk:build`
  - emulator/실기기에서 APK 설치 후 홈 화면에 widget 추가.
  - 앱 홈 진입 후 widget에 세 포인트와 갱신 시각이 표시되는지 확인.
- 완료 증거:
  - APK build가 통과한다.
  - Android launcher의 위젯 목록에 `오늘의 적립` 위젯이 나타난다.
  - 홈 화면 위젯이 `와인`, `재료`, `여행` 포인트 최신 snapshot을 표시한다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 4 `Android 홈 화면 위젯 구현`만 실행한다. 위젯에서 네트워크/Firestore 직접 조회를 추가하지 않는다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 버그, 회귀, 누락된 테스트, 오래된 캐시/서비스워커 이슈, UX 깨짐을 우선 리뷰한다. 특히 다음을 확인한다.

- 기존 단일 `allocationRate`가 `와인구매 포인트`로 안전하게 마이그레이션되는가.
- `120,000` 상한과 일/월 cap이 계산/UI에서 실제로 사라졌는가.
- 홈과 리포트가 `render-report.js` 전역 상태를 공유하면서 서로의 모드를 오염시키지 않는가.
- `이번 달` 버튼 클릭 후 홈 전용 CSS와 문구가 유지되는가.
- Android 위젯 슬라이스에서는 WebView snapshot 외 secret/network 경로가 추가되지 않는가.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 계획 작성 완료.
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 슬라이스 1 `웹 포인트 3분화와 홈 이번 달 CSS 복구` 실행.
- 차단 질문: 없음.
