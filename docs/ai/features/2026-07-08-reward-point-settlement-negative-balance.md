# 포인트 정산과 마이너스 잔액 계획

## 요청

홈 `오늘의 적립` 카드에 보이는 포인트 항목 자체를 계속 CRUD 가능하게 유지하고, 각 포인트 항목에 실제 사용/정산 금액을 입력할 수 있게 한다. 예를 들어 현재 `와인구매` 잔액이 25,358P인 상태에서 와인 구매로 50,000원을 지출했다고 입력하면, 해당 항목이 마이너스통장처럼 `-24,642P`로 표시되어야 한다.

## 현재 확인

- `docs/ai/features/2026-07-03-reward-point-goals-progress-crud.md`의 슬라이스 1에서 이미 `rewardSavings.pointItems` 기반 포인트 항목 CRUD가 구현되고 production 확인까지 완료됐다.
- 현재 설정 화면은 `render-settings.js`에서 포인트 항목의 `label`, `rate`, `targetAmount`, `enabled`를 추가/삭제/저장한다.
- 현재 홈 카드는 `render-report.js`의 `rewardSavingsCard()`와 `rewardPointBucketRow()`가 만들고, 계산은 `utils/reward-savings.js`의 `buildRewardSavingsSummary()`가 한다.
- 현재 계산은 적립액만 bucket에 넣고 `safeAmount()`가 음수를 0으로 clamp한다. 따라서 사용/차감 후 음수 잔액을 표현할 수 없다.
- 기존 거래 추가/수정 모달은 `modals/tx-edit-modal.js`에 있고, 거래 CRUD는 `data.js`의 `saveTransaction()`, `updateTransaction()`, `deleteTransaction()`가 담당한다.
- `render-settle.js`의 정산 탭은 카카오페이/더치페이 성격의 `settlement_in/out`만 다룬다. 이번 요청의 정산은 사람별 정산이 아니라 포인트 항목 차감/사용 장부로 다루는 것이 맞다.
- Android 위젯은 `RewardWidgetProvider.java`에서 progress를 음수면 0%로 clamp하지만, `RewardWidgetStore.java`는 `monthPoints` 자체를 non-negative로 저장한다. 웹에서 음수 잔액을 만들면 위젯 snapshot도 최소 계약 수정이 필요하다.
- repo root 검색 결과 `sw.js`, `STATIC_ASSETS`, `CACHE_VERSION` 파일/상수는 없다. 서비스워커 cache bump 대상은 현재 없다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: 포인트 잔액을 현재 홈 카드의 월간 잔액으로만 볼 것인가, 월이 바뀌어도 계속 이어지는 누적 통장으로 볼 것인가?
- 추천 답변: **월간 잔액 기준으로 먼저 구현**. 이유는 현재 홈 카드와 Android 위젯이 `이번 달 누적 / 기준액`, `월 예상` 구조로 이미 검증되어 있고, 누적 이월형 통장은 과거 일별 적립 산식과 carry-over 정책까지 새로 정해야 해 별도 ADR급 변경이 된다.
- 사용자 답변: 명시 답변은 없었으나 `/goal` 계속 실행에서 추천 기본값으로 진행했다.
- 적용 결정: 이번 실행은 현재 화면과 맞는 **월간 잔액 기준**으로 한다.

## 목표

- 포인트 항목 CRUD는 기존 설정 화면 흐름을 유지한다.
- 거래 추가/수정 모달에서 지출 거래를 특정 포인트 항목의 사용/정산으로 연결할 수 있게 한다.
- 포인트 항목별 홈 row는 `적립액 - 정산/사용액 = 잔액`을 표시한다.
- 잔액이 음수면 progress는 0%로 유지하되, 숫자는 `-24,642P`처럼 음수로 명확히 보여준다.
- 예시: 와인구매 포인트 `monthPoints = 25,358`, 이번 달 와인구매 정산/사용액 `50,000`이면 홈 row의 잔액은 `-24,642P`가 된다.
- 해당 거래를 수정하거나 삭제하면 포인트 잔액도 즉시 다시 계산된다.

## 비목표

- 실제 은행/카드 계좌 잔액을 차감하거나 자동 이체하지 않는다.
- 카카오페이/더치페이 정산 탭의 사람별 정산 모델을 재설계하지 않는다.
- Gemini/API secret, Gmail/Android 알림 ingest, raw message 처리 경로는 건드리지 않는다.
- 포인트 기준액(`targetAmount`)을 적립/사용 상한으로 바꾸지 않는다. 기준액은 progress 100% 기준이다.
- 사용자가 누적 이월형 통장을 선택하지 않는 한, 월을 넘어가는 carry-over ledger는 만들지 않는다.

## 결정 기록

- 결정: 별도 Firestore 컬렉션을 만들지 않고, 기존 `transactions` 문서에 포인트 정산 metadata를 붙인다.
- 이유: 사용자가 말한 “와인구매에 5만원을 지출”은 실제 거래와 같은 사건이고, 기존 거래 추가/수정/삭제가 이미 CRUD 표면을 제공한다. 새 컬렉션을 만들면 같은 지출을 거래 장부와 포인트 장부에 이중 입력해야 한다.
- 후보 필드:
  - `rewardPointEntry: { pointItemId, pointItemLabel, direction: 'spend', amount }`
  - `pointItemId`는 `rewardSavings.pointItems[].id`와 연결한다.
  - `amount`는 기본값으로 거래 금액을 사용하되, 수정 모달에서 별도 입력 가능하게 한다.
- 되돌릴 수 있는가: 가능. metadata가 없는 기존 거래는 현재처럼 계산된다.

## 실행 슬라이스

### 슬라이스 1: 거래 기반 포인트 정산과 음수 잔액 표시

- 상태: 실행 완료, 리뷰 대기
- 목표:
  - 기존 포인트 항목 CRUD를 유지하면서 거래 추가/수정 모달에 포인트 정산 연결 UI를 추가한다.
  - `buildRewardSavingsSummary()`가 포인트별 적립액, 사용액, 잔액을 계산하고 음수 잔액을 보존한다.
  - 홈 `오늘의 적립` row가 음수 잔액과 정산 메타를 표시한다.
- 범위:
  - `data.js`
    - transaction metadata를 정규화하는 helper를 추가한다.
    - `saveTransaction()`과 `updateTransaction()` 경로에서 `rewardPointEntry`를 안전하게 저장/삭제할 수 있게 한다.
  - `utils/reward-savings.js`
    - `options.transactions`에서 이번 달 `rewardPointEntry.direction === 'spend'` 금액을 항목별로 합산한다.
    - bucket에 `earnedMonthPoints`, `spentMonthPoints`, `monthPoints` 또는 `netMonthPoints`를 포함한다.
    - 표시용 잔액은 음수를 허용하고, progress 계산만 `Math.max(0, balance)`로 clamp한다.
  - `render-report.js`
    - point row meta를 `적립 +25,358 · 정산 -50,000 · 잔액 -24,642`처럼 읽히게 조정한다.
    - 음수 잔액 row에는 `overdrawn` class를 붙이고 값은 `amount-neg` 계열 색으로 표시한다.
  - `modals/tx-edit-modal.js`
    - 거래 추가 모달과 거래 상세 수정 모달에 `포인트 정산` 접이식/토글 영역을 추가한다.
    - `포인트 항목` select는 `getAppSettings().rewardSavings.pointItems`에서 읽는다.
    - 정산 금액 기본값은 거래 금액이며, 사용자가 바꾸면 그 금액으로 차감한다.
    - 저장/수정/삭제 후 `window.refreshCurrentTab?.()`로 홈/거래 화면을 갱신한다.
  - `render-tx.js`
    - 포인트 정산이 연결된 거래 row에 작은 badge 또는 meta `와인구매 정산`을 표시한다.
  - `android/src/com/aretenald/budget/RewardWidgetStore.java`
    - `monthPoints` 또는 새 `netMonthPoints`는 음수를 보존하도록 저장한다.
  - `android/src/com/aretenald/budget/RewardWidgetProvider.java`
    - progress는 기존처럼 0..100으로 clamp하고, 텍스트는 음수 잔액을 표시한다.
  - `scripts/verify-project.mjs`
    - 와인구매 적립 25,358P와 정산 50,000P fixture가 `-24,642P`를 반환하는 smoke를 추가한다.
    - 모달 UI token, report 음수 token, Android snapshot 음수 보존 token을 검증한다.
  - cache-bust
    - `data.js`, `render-report.js`, `render-tx.js`, `render-settings.js`, `modals/tx-edit-modal.js`, `style.css`, `index.html`, `modal-manager.js`, 필요 시 `app.js` import query를 같은 버전 문자열로 맞춘다.
- 수정하지 말 것:
  - 기존 `rewardSavings.pointItems` schema를 깨지 않는다.
  - `pointRates` legacy alias를 제거하지 않는다.
  - `settlement_in/out` 더치페이 화면의 의미를 포인트 정산으로 바꾸지 않는다.
  - `_site` 산출물을 직접 수정하지 않는다.
- 구현 메모:
  - 포인트 정산 UI는 동적 버튼/선택 요소에 `type="button"`과 `data-*` 속성을 사용하고 delegated listener로 처리한다.
  - `rewardPointEntry.pointItemId`가 삭제/비활성화된 항목을 가리키면 홈 계산에서는 `pointItemLabel` fallback을 쓰되 설정에서 복구 가능하게 한다.
  - 일반 지출 합계에는 기존 transaction type/category 규칙을 유지한다. 포인트 정산 metadata는 홈 포인트 잔액에만 추가 반영한다.
  - `monthPoints` 이름을 계속 쓰면 기존 위젯/검증과 충돌이 적지만, 의미가 “net balance”로 바뀐다. 필요하면 `earnedMonthPoints`를 함께 두어 meta에서 적립/정산을 분리한다.
- 검증 방법:
  - RED: 현재 `buildRewardSavingsSummary()` fixture에서 `rewardPointEntry` spend가 무시되어 음수 잔액이 나오지 않음을 확인한다.
  - GREEN: 같은 fixture에서 와인구매 `earnedMonthPoints = 25,358`, `spentMonthPoints = 50,000`, `monthPoints = -24,642` 또는 `netMonthPoints = -24,642`를 확인한다.
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - 브라우저 UI QA:
    - production 또는 Pages artifact에서 로그인 후 홈 `오늘의 적립` 진입.
    - 거래 추가에서 50,000원 지출을 입력하고 `포인트 정산 -> 와인구매`를 선택해 저장.
    - 홈 와인구매 row가 음수 잔액으로 바뀌고 progress가 0% 또는 빈 track으로 보이는지 확인.
    - 거래 상세에서 정산 금액/항목을 수정하면 홈 잔액이 재계산되는지 확인.
    - 거래 삭제 후 홈 잔액이 원래 값으로 돌아오는지 확인.
  - production deploy:
    - `npm.cmd run verify`
    - `npm.cmd run pages:build`
    - 의도한 변경만 commit/push 후 `Deploy GitHub Pages` workflow success 확인.
    - `https://aretenald2018-sys.github.io/budget/`의 실제 UI에서 위 user flow 확인.
- 완료 증거:
  - 홈 포인트 row가 음수 잔액을 표시한다.
  - 거래 추가/수정/삭제가 포인트 잔액에 반영된다.
  - 기존 설정 포인트 항목 추가/삭제/저장 흐름은 유지된다.
  - `npm.cmd run verify`, `npm.cmd run pages:build`, GitHub Pages workflow, production UI 확인이 모두 통과한다.

## 차단 질문

포인트 잔액을 어떻게 이어갈지 결정이 필요하다.

1. **월간 잔액 기준으로 먼저 구현**: 현재 홈 카드 구조와 맞춰 이번 달 적립액에서 이번 달 사용액만 뺀다. 추천.
2. **누적 이월 통장으로 구현**: 월이 바뀌어도 음수/양수 잔액을 계속 이월한다. 이 경우 과거 적립 산식, 시작일, 이월 초기값을 정해야 해서 별도 설계가 필요하다.

## 다음 실행 프롬프트

사용자 결정이 `월간 잔액 기준`이면 이 계획 문서의 슬라이스 1 `거래 기반 포인트 정산과 음수 잔액 표시`만 실행한다. 앱 코드를 수정한 뒤 검증하고 `NEXT_ACTION.md`를 `ready_for_review`로 갱신한다.

사용자 결정이 `누적 이월 통장`이면 이 계획 문서를 먼저 ADR 포함 계획으로 확장하고, 앱 코드는 아직 수정하지 않는다.

## NEXT_ACTION.md 업데이트

- 실행 세션 종료 상태: 슬라이스 1 구현 및 `npm.cmd run verify`, `npm.cmd run pages:build` 통과
- 다음 자동 상태: `ready_for_review`
- 다음 액션: `docs/ai/executions/2026-07-08-reward-point-settlement-negative-balance.md`와 변경 파일을 기준으로 리뷰한다.
