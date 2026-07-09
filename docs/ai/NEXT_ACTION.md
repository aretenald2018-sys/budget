# 다음 자동 액션

## 2026-07-10 Settings Input Density Redesign

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-10-settings-input-density-redesign.md`
- ULW 세션: `.omo/ulw-loop/input-density-20260710/`
- 요청: 설정·예산 입력칸의 두꺼운 box와 낮은 텍스트 밀도를 프로덕트 수준의 최소 표현으로 재설계한다.
- 확인: authenticated production 390×844에서 budget input/select는 surface fill·사방 border·10px radius, reward fields는 48px·14px radius·사방 border, reward point row는 277.6px로 측정됐다.
- 결정: 전역 `.tds-input`은 유지하고 `#tab-settings`의 예산/보상 편집 흐름만 transparent dense line-field와 divider-only inner surface로 바꾼다.
- 사용자 다음 액션: 계획 승인 또는 범위 변경.
- Codex 다음 액션: 승인 시 RED fixture부터 실행하고 한 슬라이스만 구현한다.

## 2026-07-10 GPS Route Rewrite

- 상태: `review_rerun_required_after_deploy`
- 계획 문서: `docs/ai/features/2026-07-10-gps-route-rewrite.md`
- 진단 문서: `docs/ai/diagnoses/2026-07-10-gps-route-rewrite.md`
- 요청: GPS 궤적 표시가 시작점/끝점만 보이고 거리도 0으로 남는 문제를 기존 가정 없이 처음부터 다시 구현한다.
- 현재 확인:
  - `data.js`에 `users/{uid}/run_activities` read/write boundary를 추가했다.
  - GPS route samples는 `route_chunks`에 저장하고 `routeRevision`이 일치하는 완성 chunk set만 hydrate한다.
  - route rewrite 시 legacy inline GPS fields와 obsolete chunks를 제거해 stale route가 되살아나지 않게 했다.
  - `utils/gps-route.js`/`utils/gps-route-core.js`/`render-run.js`/`styles/90-run.css`를 새로 만들고 앱 탭/Pages build/cache-bust에 연결했다.
  - route alias 후보가 섞여 있을 때 시작/끝 2점 alias보다 전체 GPS sample 배열을 선택하도록 고쳤다.
  - fixed meter delta thinning과 start/end endpoint synthesis를 제거했다.
  - SVG route는 cubic curve path로 렌더링하며, 원본 GPS 포인트 기반 거리/km marker 계산은 유지한다.
  - Android APK에 GPX/TCX/JSON route file import queue와 WebView bridge flush를 추가했다. Health Connect 자동 동기화는 아직 구현하지 않았다.
  - repo root에 `sw.js`가 없어 `STATIC_ASSETS`/`CACHE_VERSION` bump 대상은 없다.
- 검증 결과:
  - `npm.cmd run verify`: PASS (`verify-project passed (95 JS files checked).`)
  - `node .omo/evidence/gps-route-storage-audit-20260710/gps-route-contract-qa.mjs`: PASS
  - `node .omo/evidence/gps-route-storage-audit-20260710/gps-route-repro.mjs`: PASS
  - `node .omo/evidence/gps-route-storage-audit-20260710/android-route-import-contract-qa.mjs`: PASS
  - `npm.cmd run pages:build`: PASS (`_site` artifact 생성)
  - Playwright mobile fixture QA 390x844: full route 6 points, `2.84 km`, curved SVG path, 2개 km marker.
  - Full-route screenshot evidence: `.omo/evidence/gps-route-storage-audit-20260710/gps-route-ui-full-current.png`.
  - Two-point/endpoint-only QA: route path 미렌더링, `data-route-polyline-points=0`.
  - `git diff --check`: PASS
  - `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ANDROID_SDK_ROOT="$LOCALAPPDATA/Android/Sdk" JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" npm.cmd run apk:build`: PASS (`v2.1.9/20`)
- 다음 리뷰 슬라이스:
  - 코드/목표/컨텍스트 재리뷰 결과를 다시 수집한다.
  - production GitHub Pages 배포 전이면 `not verified yet`로 남기고, commit/push 가능 시 Pages workflow까지 확인한다.
- 사용자 다음 액션: 없음.
- Codex 다음 액션: 리뷰 게이트 완료 후 production 배포 가능 여부 판단.

## 2026-07-09 Coupang Gmail OAuth Recovery

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-09-coupang-gmail-oauth-recovery.md`
- 요청: 쿠팡 Gmail 영수증 통합 작업이 계속 막혔으므로, Codex가 할 수 있는 일과 사용자가 직접 해야 하는 일을 분리한다.
- 진단 결과:
  - `.env.local`에는 Gmail/Firebase/Gemini 관련 키 이름이 존재한다.
  - GitHub CLI는 `aretenald2018-sys` 계정으로 로그인되어 있고 workflow 실행/조회 권한이 있다.
  - 최근 Gmail sync job `28984852204`는 `gmail.error: "Bad Request"`로 실패했다.
  - local token endpoint smoke test도 `status=400`, `error=invalid_grant`, `hasAccessToken=false`로 실패했다.
  - 실패는 Gmail 검색 쿼리, 쿠팡 파서, Firestore 저장 전에 `GMAIL_REFRESH_TOKEN` 교환 단계에서 발생한다.
- 복구 결과:
  - 사용자가 `npm.cmd run gmail:auth`를 완료했고 `Gmail connected` 화면을 확인했다.
  - 새 token smoke test 통과: `ok=true`, `status=200`, `hasAccessToken=true`, `expiresIn=3599`.
  - `npm.cmd run github:secrets` 성공: `GMAIL_REFRESH_TOKEN` 포함 required secrets 6개 갱신.
  - `Budget Backend Jobs` 수동 sync run `29011951413` 성공.
  - Gmail sync summary: `count=3`, `created=2`, `enriched=1`, `updated=0`, `skipped=0`, `errors=0`.
  - Firestore 확인: `2026-07-08` 이후 쿠팡 receipt 3건 모두 `matchedTxId`, `receiptIds`, `receiptItemSummary`, `[쿠팡 영수증]` memo 연결됨.
  - Firestore 증거: `.omo/evidence/coupang-gmail-recovery-20260709/firestore-linkage.json`에 token/service-account/raw message 없이 `receiptId`, `matchedTxId`, `transaction.receiptIds`, `receiptItemSummary`, `memo` 검증 필드 보존.
  - 그중 1건은 기존 `android_local_sms` 거래 `쿠팡(쿠페이)`에 enrich되었고, 2건은 Gmail 거래로 생성됨.
  - production URL `https://aretenald2018-sys.github.io/budget/` HTTP 200 확인.
  - production UI 확인 완료: authenticated production app에서 `거래 -> 2026-07-09 -> 쿠팡 -4,990원 거래 상세`를 열어 `📄 쿠팡 영수증`, 품목명, `4,990원` 표시 확인.
  - UI 증거: `.omo/evidence/coupang-gmail-recovery-20260709/display-path.txt`, `.omo/evidence/coupang-gmail-recovery-20260709/production-coupang-detail.png`.
  - ulw-loop 세션: `.omo/ulw-loop/coupang-gmail-recovery-20260709/`, criteria C001/C002/C003 PASS 기록.
- 사용자 다음 액션: 없음.
- Codex 다음 액션: 없음.
- 남은 확인:
  - 없음.

## 2026-07-09 Reward Widget Custom Point Items

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-09-reward-widget-custom-point-items.md`
- 실행 문서: `docs/ai/executions/2026-07-09-reward-widget-custom-point-items.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-09-reward-widget-custom-point-items-review.md`
- 요청: 새로 추가한 포인트 항목이 Android 위젯에 표시되지 않는 문제를 개선한다.
- 적용 결정: 기존 RemoteViews 구조를 유지하고 snapshot/store/provider/layout을 최대 4개 포인트 row 계약으로 확장한다.
- 실행 결과:
  - `buildRewardWidgetSnapshot()`과 `RewardWidgetStore`가 네 번째 custom bucket을 보존한다.
  - `RewardWidgetProvider`와 `reward_widget.xml`에 네 번째 row slot을 추가했다.
  - custom bucket label은 `포인트` suffix를 제거해 표시하고 mark는 label 첫 글자를 사용한다.
  - `reward_widget_info.xml`을 `minHeight=180dp`, `minResizeHeight=160dp`로 갱신해 4-row layout 높이를 확보했다.
  - 사용자가 “문제가 여전히 그대로”라고 보고해 추가 진단했고, 기존 `v2.1.7` 변경은 JS cache-bust와 설정 저장 직후 widget snapshot refresh 경로가 부족했음을 확인했다.
  - `render-report.js`에 `refreshRewardWidgetSnapshot()`을 추가하고, 보상 적립 설정 저장/초기화 직후 Android widget snapshot을 UI 탭 상태와 무관하게 갱신하도록 했다.
  - `index.html`, `app.js`, `render-home.js`, `render-report.js`, `render-settings.js`의 reward widget 관련 cache-bust를 `20260709-reward-widget-refresh`로 올렸다.
  - `docs/design-system.md`에 Android 홈 화면 위젯 최대 4개 row 계약을 기록했다.
  - Android APK version을 `v2.1.8 / versionCode 19`로 올리고 settings 다운로드 cache-bust를 `20260709-reward-widget-refresh`로 갱신했다.
- 검증 결과:
  - RED: `npm.cmd run verify`가 `Reward widget snapshot buckets are wrong`로 실패, 네 번째 `gadgetFund` bucket 누락 확인.
  - 추가 RED: 새 verifier가 stale JS/cache/update 경로를 잡아 `refreshRewardWidgetSnapshot` 누락, `render-report.js`/`app.js`/`render-home.js`/`index.html` old cache-bust 누락으로 실패.
  - APK build: `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" JAVA_HOME='C:/Program Files/Android/Android Studio/jbr' npm.cmd run apk:build` 통과 (`v2.1.8/19`).
  - `npm.cmd run verify`: 통과 (`verify-project passed (92 JS files checked).`)
  - `npm.cmd run pages:build`: 통과 (`_site` artifact 생성)
  - `_site` artifact QA: `app.js?v=20260709-reward-widget-refresh`, `refreshRewardWidgetSnapshot`, `utils/reward-savings.js?v=20260709-reward-widget-refresh`, `v2.1.8`, `versionCode=19`, `cacheBust=20260709-reward-widget-refresh` 확인.
  - 부분 runtime evidence: `buildRewardWidgetSnapshot()` 직접 import 실행 결과 `count=4`, `gadgetFund`, `전자기기 포인트` 보존 확인.
  - APK artifact QA: `aapt2 dump badging public/downloads/budget.apk`에서 package `versionCode=19`, `versionName=2.1.8` 확인.
  - APK resource QA: `aapt2 dump xmltree`로 `minHeight=180dp`, `minResizeHeight=160dp`, `initialLayout=@layout/reward_widget` 확인.
  - Android AppWidgetHost QA: 임시 tall host `com.aretenald.widgethostqatall`에서 `RewardWidgetProvider`를 bind했고, UIAutomator hierarchy에서 `reward_widget_custom_row`, `reward_widget_custom_mark` text `포`, `reward_widget_custom` text `포인트 -`, `reward_widget_custom_value` text `-` 확인.
  - 배포 경로 확인: `.github/workflows/pages.yml`은 push 후 CI에서 `npm run apk:build`, `npm run verify`, `npm run pages:build`를 실행해 ignored APK artifact를 다시 생성한다.
  - production deploy: commit `bd54a69` push 후 `Deploy GitHub Pages` workflow `29049035246` success.
  - production asset QA:
    - `https://aretenald2018-sys.github.io/budget/?deploy=bd54a69` HTTP 200.
    - `index.html` app entry `app.js?v=20260709-reward-widget-refresh` 확인.
    - `render-report.js?v=20260709-reward-widget-refresh`에서 `refreshRewardWidgetSnapshot`, `reward-savings.js?v=20260709-reward-widget-refresh` 확인.
    - `render-settings.js?v=20260709-reward-entry-crud`에서 `refreshRewardWidgetSnapshot`, `v2.1.8`, `budget.apk?v=20260709-reward-widget-refresh` 확인.
    - `downloads/budget-apk.json`에서 `versionCode=19`, `versionName=2.1.8`, `cacheBust=20260709-reward-widget-refresh` 확인.
    - `downloads/budget.apk?v=20260709-reward-widget-refresh` HTTP 200.
- 리뷰 결과:
  - `PASS_WITH_GAPS`
  - 발견한 4-row widget height metadata 문제는 같은 세션에서 수정 완료.
- 남은 확인:
  - `not verified yet`: headless emulator에서 launcher 홈 화면에 widget을 배치하는 시각 QA는 자동화하지 못했다. 대신 custom `AppWidgetHost`로 실제 provider row hierarchy는 확인했다.
  - `not verified yet`: emulator의 installed production-signed APK는 non-debuggable이라 private widget snapshot을 직접 주입하지 못해 Android 런타임에서 `전자기기` 라벨이 표시되는 화면까지는 확인하지 못했다. JS snapshot 경로에서는 `전자기기 포인트` 보존을 확인했다.
- 다음 액션:
  - Android 실제 기기 또는 visible emulator에서 `v2.1.8` APK 설치 후 홈 화면 위젯을 배치하고 앱 로그인/설정 저장 뒤 새 custom 포인트 라벨이 표시되는지 확인한다.

## 2026-07-08 Reward Point Entry CRUD Settings

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-08-reward-point-entry-crud-settings.md`
- 실행 문서: `docs/ai/executions/2026-07-09-reward-point-entry-crud-settings.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-09-reward-point-entry-crud-settings-review.md`
- 요청: 설정 화면의 보상 적립 영역에 포인트 정산 `신규내역` CRUD가 보이지 않는 문제를 해결한다.
- 적용 결정: 기존 `transactions.rewardPointEntry` CRUD를 재사용하고, 설정 화면에 scoped 내역 목록과 `+ 신규내역` 진입점을 노출한다.
- 실행 결과:
  - 설정 `보상 적립` 카드에 `포인트 정산 내역` 목록과 `+ 신규내역` 버튼을 추가했다.
  - `+ 신규내역`은 기존 `openTxAddModal({ source: 'reward-settings', rewardPointEntry })`로 연결되고, modal title은 `포인트 정산 추가`, `포인트 정산` panel은 active로 열린다.
  - 내역 row click은 기존 `openTxEditModal(txId)`로 연결된다.
  - `20260709-reward-entry-crud` cache-bust를 settings renderer, modal bundle, reward settings CSS에 적용했다.
- 검증 결과:
  - `npm.cmd run verify`: 통과 (`verify-project passed (92 JS files checked).`)
  - `npm.cmd run pages:build`: 통과 (`_site` artifact 생성)
  - Pages artifact Playwright QA: `포인트 정산 내역`, `+ 신규내역`, 2개 entry row, modal `포인트 정산 추가`, active point panel, selected `winePurchase`, console error/warn 없음, mobile overflow 없음.
  - production deploy: commit `bd54a69` push 후 `Deploy GitHub Pages` workflow `29049035246` success.
  - production asset QA:
    - `https://aretenald2018-sys.github.io/budget/?deploy=bd54a69` HTTP 200.
    - `app.js?v=20260709-reward-widget-refresh`가 `render-settings.js?v=20260709-reward-entry-crud`를 import함.
    - `render-settings.js?v=20260709-reward-entry-crud` HTTP 200, `openRewardPointEntryCreate`, `reward-entry`, `refreshRewardWidgetSnapshot` 확인.
    - `styles/60-urge.css?v=20260709-reward-entry-crud` HTTP 200, `reward-entry-list` 확인.
    - `modals/tx-edit-modal.js?v=20260709-reward-entry-crud` HTTP 200, `openTxAddModal`, `rewardPointEntry`, `포인트 정산 추가` 확인.
- 남은 확인:
  - `not verified yet`: 실제 production 계정에서 임시 포인트 정산 거래를 저장/수정/삭제하는 데이터 변경 QA는 사용자 허용 전에는 실행하지 않았다.
- 다음 액션:
  - 사용자가 production에 임시 포인트 정산 거래를 생성하고 바로 삭제해도 된다고 확인하면 저장/수정/삭제 흐름까지 확인한다.

## 2026-07-08 Reward Point Settlement Negative Balance

- 상태: `needs_user_confirmation`
- 계획 문서: `docs/ai/features/2026-07-08-reward-point-settlement-negative-balance.md`
- 실행 문서: `docs/ai/executions/2026-07-08-reward-point-settlement-negative-balance.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-08-reward-point-settlement-negative-balance-review.md`
- 요청: 포인트 항목 CRUD를 유지하고, 와인구매 같은 포인트 항목에 지출/정산 금액을 입력하면 홈 포인트 잔액이 음수까지 표시되게 한다.
- 적용 결정: `월간 잔액 기준`
- 실행 결과:
  - 거래 추가/수정 모달에 `포인트 정산` 패널을 추가했다.
  - `transactions.rewardPointEntry` metadata를 저장/삭제하고, 홈 포인트 계산에서 `earnedMonthPoints - spentMonthPoints = monthPoints`를 계산한다.
  - 음수 `monthPoints`를 웹 홈 row와 Android 위젯 snapshot/provider에서 보존한다.
  - 거래 목록에 포인트 badge와 `와인구매 정산 -50,000P` meta를 표시한다.
- 검증 결과:
  - GREEN fixture: 와인구매 `earnedMonthPoints=25,358`, `spentMonthPoints=50,000`, `monthPoints=-24,642`
  - 기존 category 규칙 유지 fixture: 같은 포인트 정산 거래가 `생활` category면 `todaySpend=50,000`
  - 삭제된 포인트 fallback fixture: `retiredPoint` row가 `삭제된 포인트`, `monthPoints=-1,000`, `settlementOnly=true`
  - `npm.cmd run verify`: 통과 (`verify-project passed (92 JS files checked).`)
  - `npm.cmd run pages:build`: 통과 (`_site` artifact 생성)
  - code/context 축소 재리뷰: PASS
  - 재확인(2026-07-08): `npm.cmd run verify`, `npm.cmd run pages:build`, `git diff --check` 통과
  - production deploy: commit `b6c757b` push 후 `Deploy GitHub Pages` workflow `28939892054` success
  - production asset: `/budget/` HTTP 200, `20260708-reward-point-settlement` 토큰 2건, `app.js`, `style.css`, `render-report.js` HTTP 200
  - production UI 저장 전 확인:
    - 홈/거래 탭 렌더링 및 console error/warn 없음
    - 거래 추가 모달에서 `포인트 정산` 패널 표시
    - 포인트 항목 option: `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트`
    - `포인트 정산` 체크 후 `와인구매 포인트`, `50000` 입력 시 panel `active`, `aria-hidden=false`
- 남은 확인:
  - `not verified yet`: production 실데이터에 임시 50,000원 거래를 저장/삭제하는 것은 재정 데이터 변경이라 사용자 확인 전에는 실행하지 않았다.
  - `not verified yet`: Android device/emulator widget runtime에서 음수 포인트 표시를 직접 확인하지 못했다.
- 다음 액션:
  - 사용자가 production에 임시 거래를 생성하고 바로 삭제해도 된다고 확인하면, `거래 추가 -> 포인트 정산 -> 와인구매 포인트 -> 50,000원 저장` 후 홈 `와인구매` row가 음수 잔액을 표시하는지 확인하고, 거래 수정/삭제로 잔액 복구까지 확인한다.

## 2026-07-08 Settings Budget Label Nowrap

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-08-settings-budget-label-nowrap.md`
- 실행 문서: `docs/ai/executions/2026-07-08-settings-budget-label-nowrap.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-08-settings-budget-label-nowrap-review.md`
- ULW: `.omo/ulw-loop/budget-label-nowrap-20260708/goals.json`
- 요청: 설정 화면의 예산 카테고리 row에서 `주거비용` 같은 한국어 라벨이 두 줄로 갈라지지 않고 한 줄에 표시되게 한다.
- 실행 결과:
  - `render-settings.js` 예산 row 라벨에 `budget-goal-label` class를 추가했다.
  - `styles/00-foundation.css`에서 editable grid 폭과 label nowrap/keep-all/ellipsis 계약을 수정했다.
  - `style.css`, `index.html` cache-bust를 `20260708-budget-label-nowrap`로 갱신했다.
- 검증 결과:
  - RED: `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-check.mjs red` 실패 확인
  - AFTER: `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-check.mjs after` 통과, 390x844 Chrome fixture에서 8개 라벨 모두 `oneLine=true`
  - 소스 계약: `.omo/evidence/budget-label-nowrap-20260708/source-contract-after.txt` 모두 `PASS`
  - `npm.cmd run verify`: 통과, `verify-project passed (96 JS files checked).`
  - `npm.cmd run pages:build`: 통과, `_site` artifact 생성
  - commit/push: `c352348 Keep settings budget labels on one line`을 `origin/main`에 push
  - GitHub Pages workflow: `28923720497`, success
  - production asset: `https://aretenald2018-sys.github.io/budget/` HTML/CSS/JS HTTP 200, `settings=20260708-budget-label-nowrap`, `budget-goal-label`, nowrap/keep-all/ellipsis 계약 확인
- 남은 확인:
  - `not verified yet`: headless QA profile에 Firebase 로그인 세션/테스트 계정이 없어 production 설정 탭의 실제 예산 카테고리 row는 직접 확인하지 못했다.
- 다음 액션: 사용자의 로그인된 production 브라우저에서 `설정 -> 예산 & 카테고리`로 들어가 `주거비용`, `보험비용`, `통신비용` 등이 한 줄인지 확인한다.

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-07-newsfeed-digest-clipboard.md`
- 실행 문서: `docs/ai/executions/2026-07-07-newsfeed-digest-clipboard.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-07-newsfeed-digest-clipboard-review.md`
- 현재 단계: 뉴스탭 다이제스트 클립보드 기능 구현, 리뷰, production 배포, production UI 검증 완료
- 다음 액션:
  - 없음.

## 실행 결과 요약

- 뉴스탭 상단 hero 영역에 `다이제스트` 버튼을 추가했다.
- 버튼 메뉴는 `일일 복사`, `주간 복사`를 제공한다.
- 복사 payload는 현재 렌더링된 60건이 아니라 `public/newsfeed/telegram-public-feed.json` full snapshot에서 날짜 범위를 필터링한다.
- `일일`은 snapshot 최신 KST 날짜 전체, `주간`은 최신 KST 날짜 기준 최근 7개 KST 날짜 전체를 복사한다.
- payload에는 metadata, source/date/url/messageId/text/links/attachments를 포함하고 message text는 임의 truncation하지 않는다.
- payload와 UI copy에는 `document_body_ingested=false`, `video_body_ingested=false`, `file_bytes_ingested=false`, `body=not_ingested` 한계를 명시했다.
- PDF/document 파일 bytes 또는 extracted text ingest는 구현하지 않았다.

## 검증 결과

- 재검증: 2026-07-07 현재 작업트리 기준 동일 결과 확인
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)
- `npm.cmd run pages:build`: 통과 (`_site` artifact 생성)
- 로컬 Pages artifact QA:
  - URL: `http://127.0.0.1:5501/`
  - 공개 뉴스 화면 진입 후 `다이제스트` 버튼과 메뉴 표시 확인
  - `일일 복사`: clipboard payload 115,472자, `2026-07-04T00:00:00+09:00`부터 `2026-07-04T23:59:59+09:00`, 155건
  - `주간 복사`: clipboard payload 4,939,507자, `2026-06-28T00:00:00+09:00`부터 `2026-07-04T23:59:59+09:00`, 6,417건
  - 두 payload 모두 `# 뉴스피드 다이제스트`, `## 메시지 전수`, `document_body_ingested=false`, `BEGIN TEXT`/`END TEXT` 포함 확인
  - 모바일 375x812 및 태블릿 768x900 viewport에서 버튼과 메뉴가 viewport 안에 있고 가로 overflow 없음 확인
  - 브라우저 console warning/error 없음
- Production UI: 통과
  - commit: `4ad990c Add newsfeed digest clipboard export`
  - workflow: `28849376508`, success
  - URL: `https://aretenald2018-sys.github.io/budget/`
  - production cache-bust:
    - `app.js?v=20260707-newsfeed-digest-clipboard`
    - `style.css?...news=20260707-newsfeed-digest-clipboard`
  - standalone Chromium Playwright QA:
    - first newsfeed page 60 cards
    - `일일 복사` clipboard payload 523,176자
    - `주간 복사` clipboard payload 4,579,651자
    - payload markers: `# 뉴스피드 다이제스트`, `## 메시지 전수`, `document_body_ingested=false`, `body=not_ingested`
    - mobile 375x812 `scrollWidth=375`, digest button/menu viewport 내부
    - browser console warning/error 없음

## 변경 파일

- `data.js`
- `render-newsfeed.js`
- `styles/80-newsfeed.css`
- `scripts/verify-project.mjs`
- `index.html`
- `app.js`
- `modal-manager.js`
- `style.css`
- `render-home.js`
- `render-finance.js`
- `render-report.js`
- `render-review.js`
- `render-settings.js`
- `render-settle.js`
- `render-tx.js`
- `modals/account-modal.js`
- `modals/category-modal.js`
- `modals/tx-edit-modal.js`
- `urge/render-mindbank.js`
- `urge/render-urge-alternatives.js`
- `urge/render-urge-input.js`
- `urge/render-urge-result.js`
- `urge/render-wine-cellar.js`
- `docs/ai/features/2026-07-07-newsfeed-digest-clipboard.md`
- `docs/ai/executions/2026-07-07-newsfeed-digest-clipboard.md`
- `docs/ai/reviews/2026-07-07-newsfeed-digest-clipboard-review.md`
- `docs/ai/NEXT_ACTION.md`

## 수집 데이터 점검

- 공개 Telegram preview 메시지 본문은 현재 snapshot에 `text`로 저장된다.
- 현재 checked-in snapshot 기준:
  - source 71개
  - item 33,084건
  - `truncated=false`
  - `backfillComplete=true`
  - failed source 0개
- PDF/document/video 파일 본문은 현재 인입되지 않는다.
  - `api/_lib/telegram-public-feed.js`의 `extractAttachments()`는 image URL, video type, document type만 만든다.
  - `scripts/telegram-feed-static.mjs`의 `stableStaticFeedItem()`은 attachment를 `{ type }`만 남기도록 축약한다.
  - 따라서 digest는 message text 전수와 attachment metadata/한계 표시는 가능하지만, PDF/document 본문 분석은 아직 불가능하다.

## 다음 액션

- 없음. 이 뉴스피드 다이제스트 계획은 완료됐다.

## 보류된 별도 계획

- `docs/ai/features/2026-07-04-settings-option-line-inputs.md`
  - 설정 탭 옵션 입력/선택 라인형 UI 계획이다.
  - 이번 뉴스피드 요청과 충돌하지 않도록 실행하지 않았다.
  - 해당 파일과 `.omo/` 상태 파일은 이번 뉴스피드 커밋 범위에 포함하지 않는다.

## 상태값

- `idle`: 진행 중인 자동 액션 없음
- `needs_user_decision`: 사용자 결정이 필요함
- `ready_for_execution`: 다음 실행 슬라이스를 바로 진행
- `ready_for_review`: 직전 실행 결과를 바로 리뷰
- `ready_for_fix`: 리뷰에서 발견된 문제만 바로 수정
- `complete`: 현재 계획 완료

## 자동 진행 규칙

- 세션 시작 시 이 파일을 먼저 읽는다.
- 사용자가 `계속`, `다음`, `진행`, `리뷰해`, `해줘`처럼 짧게 말하면 이 파일의 `다음 액션`을 실행한다.
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다.
