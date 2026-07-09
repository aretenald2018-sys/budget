# 위젯 custom 포인트 항목 표시 개선 계획

## 요청

위젯에 새로 추가한 포인트 항목이 표시되지 않는 문제를 개선한다.

## 진단 결과

- 적용 트리거: `/diagnose`
- 웹 홈 `오늘의 적립` 카드는 `summary.pointBuckets` 전체를 렌더링하지만, Android 위젯으로 넘기는 snapshot과 native store/provider는 3개 항목 계약에 묶여 있다.
- `utils/reward-savings.js`의 `buildRewardWidgetSnapshot()`은 `widgetSources.slice(0, 3)`으로 네 번째 이후 포인트 항목을 버린다.
- `android/src/com/aretenald/budget/RewardWidgetStore.java`도 `out.length() < 3` 조건으로 native 저장 시 다시 자른다.
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`는 고정 row 3개만 렌더링하므로, snapshot에 custom 항목이 들어와도 화면에 노출될 슬롯이 없다.

## 가설과 증거

1. 웹 snapshot builder가 custom 항목을 Android bridge payload에서 누락한다.
   - 증거: `utils/reward-savings.js`에서 `widgetSources.slice(0, 3)` 사용.
   - 판정: 확인.
2. native store가 snapshot 저장 시 custom 항목을 누락한다.
   - 증거: `RewardWidgetStore.normalizePointBuckets()`의 반복 조건이 `out.length() < 3`.
   - 판정: 확인.
3. native provider가 custom label을 표시할 수 없다.
   - 증거: provider가 index 0/1/2만 렌더링하고, `shortLabel()`이 기본 3개 key만 축약한다.
   - 판정: 확인.

## 결정

- 새 Firestore schema나 별도 Android collection adapter를 만들지 않는다.
- 현재 위젯의 list-style row anatomy를 유지한다.
- 이번 slice에서는 위젯 표시 슬롯을 4개까지 확장해 “기본 3개 + 새로 추가한 1개” 사용례를 해결한다.
- snapshot/store는 4개 항목까지 보존한다.
- provider는 bucket의 `label`을 직접 축약해 custom 포인트 이름을 표시한다.
- 더 많은 항목을 스크롤형 widget collection으로 표시하는 작업은 별도 Android widget 재설계로 남긴다.

## 실행 슬라이스 1: Android 위젯에 네 번째 custom 포인트 row 표시

- 상태: 승인됨, 바로 실행
- 범위:
  - `utils/reward-savings.js`
    - `buildRewardWidgetSnapshot()`이 최대 4개 `pointBuckets`를 보존하도록 수정한다.
  - `android/src/com/aretenald/budget/RewardWidgetStore.java`
    - native snapshot normalize 단계도 최대 4개를 보존한다.
  - `android/res/layout/reward_widget.xml`
    - 기존 row anatomy와 크기를 유지하며 네 번째 row slot을 추가한다.
  - `android/res/xml/reward_widget_info.xml`
    - 네 번째 row가 작은 위젯에서 잘리지 않도록 최소 높이 metadata를 4-row 레이아웃에 맞춘다.
  - `android/src/com/aretenald/budget/RewardWidgetProvider.java`
    - 네 번째 row를 렌더링하고 custom bucket은 `label` 기반 축약명을 표시한다.
  - `android/res/values/strings.xml`
    - 설명 문구가 “세 포인트”로 고정되어 있으면 새 최대 표시 개수에 맞게 고친다.
  - `scripts/verify-project.mjs`
    - snapshot 4개 보존, custom key/label 보존, provider/layout 네 번째 row 계약을 검증한다.
  - `docs/ai/NEXT_ACTION.md`
    - 실행 후 리뷰 대기 상태로 갱신한다.
- 수정하지 말 것:
  - 설정 화면의 포인트 정산 `신규내역` CRUD 대기 작업은 건드리지 않는다.
  - `transactions.rewardPointEntry` schema를 바꾸지 않는다.
  - 위젯을 scroll/list adapter 구조로 재설계하지 않는다.
  - production 재정 데이터에 임시 거래를 저장/삭제하지 않는다.

## 검증 방법

- RED:
  - `npm.cmd run verify`가 custom 네 번째 bucket 기대 조건에서 실패하는 것을 확인한다.
- GREEN:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
- 부분 runtime evidence:
  - Android device/emulator 위젯 런타임은 현재 세션에서 사용할 수 없으므로, native widget 직접 시각 QA는 `not verified yet`로 남긴다.
  - 대신 `buildRewardWidgetSnapshot()` 실제 import 실행, native source contract, layout/provider token 검증으로 snapshot-to-provider 계약을 확인한다.

## 완료 조건

- 네 번째 custom point bucket이 `buildRewardWidgetSnapshot()` 결과에 남는다.
- native store가 네 번째 bucket을 자르지 않는다.
- provider/layout에 네 번째 row slot이 있고 custom label을 표시할 수 있다.
- `npm.cmd run verify`와 `npm.cmd run pages:build`가 통과한다.
- Android 실기기/에뮬레이터 위젯 직접 확인은 불가 시 정확히 차단 사유를 남긴다.

## 실행 결과

- 실행 문서: `docs/ai/executions/2026-07-09-reward-widget-custom-point-items.md`
- 상태: 실행 완료, review session 대기.
- RED: `npm.cmd run verify`가 `Reward widget snapshot buckets are wrong`로 실패했고, snapshot에 `gadgetFund`가 없음을 확인했다.
- GREEN:
  - `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" JAVA_HOME='C:/Program Files/Android/Android Studio/jbr' npm.cmd run apk:build` 통과, `v2.1.7/18` APK 생성.
  - `npm.cmd run verify` 통과, `verify-project passed (92 JS files checked).`
  - `npm.cmd run pages:build` 통과, `_site` artifact 생성.
  - `git diff --check` 통과.
- review session fix:
  - 네 번째 24dp row가 기존 `android:minHeight=150dp` widget metadata에서 잘릴 수 있어 `reward_widget_info.xml`을 `minHeight=180dp`, `minResizeHeight=160dp`로 갱신했다.
  - APK를 다시 빌드해 `aapt2 dump xmltree`로 `minHeight=180dp`, `minResizeHeight=160dp`, `initialLayout=@layout/reward_widget`가 APK에 포함된 것을 확인했다.
- 부분 runtime evidence:
  - `buildRewardWidgetSnapshot()` 직접 import 실행 결과 `count=4`, `gadgetFund`, `전자기기 포인트` 보존 확인.
- emulator evidence:
  - AVD `BudgetNotifApi35`에 `public/downloads/budget.apk` 설치 성공.
  - 설치 package: `versionCode=18`, receiver `.RewardWidgetProvider` 등록 확인.
- `not verified yet`:
  - headless emulator에서 홈 화면 위젯 배치/시각 확인까지 자동화하지 못해 네 번째 row의 실제 launcher 렌더링은 직접 확인하지 못했다.
  - production deploy/push는 기존 dirty 작업이 섞여 있어 수행하지 않았다.
