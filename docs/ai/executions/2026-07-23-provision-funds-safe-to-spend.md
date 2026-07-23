# 지출 관리 구조 재편 — 충당금 · 지금 써도 되는 돈 · 재배분 (진행 중 · 핸드오프)

> 이 문서는 진행 중 작업의 인수인계용입니다. 문맥 없이 이어받는 사람(코덱스 포함)을 위해 배경·설계·진행상태·남은작업·검증을 모두 담았습니다.

## 1. 작업 배경 (왜)

기존 앱의 두 축 중 **위젯 포인트 적립(절제 동기)** 은 효과적이나, **2주/월 지출 상한**은 행동에 영향을 주지 못함. 원인은 상한 모델이 현실의 지출 구조를 수용하지 못하기 때문:
- ① 돌발 의무지출(과태료 등) — 갑자기 나가야 하는 돈
- ② 특정 주에 몰리는 계획성 지출(헬스장 등록, 신발 구매)

이 둘이 상한을 깨면서 "어차피 못 지킬 숫자"가 되어버림. 목표는 **예상(predictability)/관리(manageability)/통제가능성(controllability)** 축으로 구조를 근본 재편.

## 2. 채택 컨셉 및 전제 (프레이밍 — 절대 훼손 금지)

사용자 선택: **B+A+C 하이브리드** (YNAB True Expenses + Roll-with-the-punches + Simple Safe-to-Spend)

| 접근 | 역할 | 핵심 전제 (충돌 신호 감지 대상) |
|---|---|---|
| B. Sinking Fund (충당금) — 기반 | 비정기 지출을 "예산 내 사건"으로 재정의 | 비정기 지출의 연간 총량을 대략 추정 가능 |
| A. Safe-to-Spend (지금 써도 되는 돈) | 히어로 지표를 상한 게이지 → 실시간 가용액으로 교체 | 고정비·예정지출을 미리 등록할 만큼 지출이 구조화됨 |
| C. Envelope 재배분 | 초과지출을 실패가 아닌 "트레이드오프 결정"으로 처리 | 초과 시점에 사용자가 짧은 재배분 결정을 할 의향 있음 |

**불변 조건**: 포인트 시스템(`domain/rewards/savings.js`, 위젯 v2)은 유지. 충당금 지출은 `excludedFromBudget`으로 처리되어 포인트 베이스라인 필터(`render-report.js`의 `!isBudgetExcluded`)를 이미 통과 → "과태료가 스트릭/베이스라인을 오염시키지 않음"이 코드 수정 없이 성립.

**사용자 확정 결정**:
1. 충당금 재원 = **예산에서 자동 차감**(STS 산식 반영, 카테고리 목표 불변)
2. 충당금 처리 지출 = 예산 집계 제외하되 카테고리 상세에서 **회색 항목으로 표시**(숨기지 않음)
3. 구현 범위 = **Phase 1+2+3(종합 위젯)**. 충당금 금액 자동 제안만 보류(Phase 4)
4. 기본값: 적립은 매월 1일 전액(예상성), 환급예정↔충당금 상호배타(펀드 우선), 리포트탭 히어로는 홈 검증 후 전환

## 3. 데이터 모델 (구현 완료)

### provision_funds — `users/{uid}/provision_funds/{fundId}` (신규 컬렉션)
`data/repositories/funds.js`. sessionCache 동기 getter 패턴(accounts와 동일).
```
{ name, emoji, order, monthlyProvision, startMonthKey('YYYY-MM'),
  openingBalance, active, createdAt, updatedAt }
```
함수: `loadProvisionFunds/getProvisionFunds/getActiveProvisionFunds/getProvisionFundById/saveProvisionFund/deactivateProvisionFund/listFundDrawTransactions(fundId)`. 모두 `data.js` 재수출 완료. `initData()`에서 `_loadProvisionFunds()` 로드 완료.

### 거래 연결 — 기존 tx 문서 확장 (인출 이중기입 없음, 파생)
충당금 지출 = `fundId`, `fundLabel`(비정규화), `excludedFromBudget:true`, `excludeReason:'fund_covered'`.
`domain/transactions/budget.js`에 `isFundCovered(tx)` 추가 완료. `isBudgetExcluded`가 이를 포함, `isReimbursementExpected`는 fund_covered면 false 반환(상호배타). `data/repositories/transactions.js`·`data.js`에 `isFundCovered` 재수출 완료.

### budget_adjustments — `users/{uid}/budget_adjustments/{id}` (신규, 재배분/입금 원장)
`monthlyTargets`를 변경하지 않는 append-only 원장(결정 이력의 가시성·가역성). `funds.js`에 `listBudgetAdjustments/saveBudgetAdjustment/deleteBudgetAdjustment` 구현·재수출 완료.
```
{ monthKey, scope('cycle'|'month'), cycleStartDate,
  from:{kind:'category'|'fund'|'external', id, label},
  to:{kind:'category'|'fund', id, label},
  amount, note, occurredAt, createdAt }
```
수동 입금 = `from.kind='external'`.

### settings — `data/repositories/settings.js`
`DEFAULT_APP_SETTINGS.safeToSpend = { enabled:true, pacingMode:'period' }` + `normalizeSafeToSpendSettings` + `cloneAppSettings` 반영 완료.

## 4. 도메인 로직 (완료) — `domain/funds/provision.js` (순수 함수)

- `accruedProvision(fund, now)` = openingBalance + monthlyProvision × (startMonthKey~현재월 개월수, 당월 포함). 매월 1일 전액.
- `fundBalance(fund, drawTxs, adjustments, now)` = 적립 − Σ인출(fundId 일치, !hidden, card_payment|transfer_out) + Σ조정(to=펀드) − Σ조정(from=펀드). **음수 허용**.
- `buildFundStatus(...)` → `{accrued, drawn, balance, overdrawn, ...normalized}`.
- `buildSafeToSpendSummary({budgetTotal(B), spentTotal(S), funds, adjustments, mode, monthKey, cycleRange, controlCategoryNames, now})`:
  - `P` = 2주모드 Σround(monthlyProvision/2), 월모드 ΣmonthlyProvision (시작월 도래 & active 펀드만)
  - `A` = 조절비 카테고리 into−out 순액
  - `STS = B − P + A − S`. 반환 `{amount, budget, provisions, adjustments, spent, available, negative, spentRatio, daysRemaining, perDay}`.
  - 엣지: 펀드0개→P=0 자연강등, 초과인출→STS 미반영(이중처벌 방지), 주기중간 생성→당기 전액차감(비례배분 없음).
- `validateAdjustment`, `netAdjustmentFor(target, adjustments)`(카테고리/펀드 귀속 순액), `normalizeProvisionFund`, `normalizeMonthKey`, `monthKeyOf`.

`features/report/budget-summary/state.js`에 `effectiveTargetFor(cat, monthKey, mode, adjustments=[])` 추가 완료(빈 조정 시 targetFor와 동일 → 하위호환).

## 5. 화면 설계 (설계 확정, 일부 배선 남음)

### 홈 (render-report.js homeMode)
```
┌ 지금 써도 되는 돈  ₩384,000 ────────┐  히어로(지갑). 음수 시 경고색.
│  ▓▓▓░░ 지출 666,000                 │  진행바 = spentRatio
│  남은 8일 · 하루 ₩48,000            │  페이스 서브라인(perDay)
│  예산 B − 충당금 P − 지출 S ▾        │  내역(손실감 완화)
├ 충당금  잔액 42만 · 매월 +15만 ▸ ───┤  기본 컴팩트, 탭 확장. 중립 톤.
│  오늘의 적립 (포인트 카드 — 무변경)  │  보상 톤 유지, 시각 구분
├ 조절비 게이지  식비 105% [재배분] ──┤  초과 시 재배분 필
└ 목표방향 · 검토넛지 (기존) ─────────┘
```
### 거래 편집기: `fundAssignPanel`(사용안함+활성펀드+historyOnly), 환급예정 상호배타(펀드우선). **완료.**
### 재배분 모달: 초과액 프리필, 출처 여유 큰 순 + 여유 표시, external 옵션, 경로 안내. `features/funds/view.js`·`controller.js` **완료(배선은 홈에서 fundsState 세팅 필요, 6절)**.
### 설정 > 충당금: 펀드별 이름/이모지/월적립액(만원)/시작월/개시잔액/활성토글/추가, "월 적립 합계 → 2주 차감액" 요약. **남음(6절).**

### 종합 위젯 — Android 4×2 "한 화면에서 모든 것"
```
지금 써도 되는 돈   ₩384,000     ← 1행 의사결정(주인공)
하루 ₩48,000 · D-8 ▓▓▓▓▓░       ← 2행 페이스+진행바
오늘 적립 +1,200p · 🔥12일       ← 3행 동기(기존 오늘카드 요약)
⚡18만 👟9만 💪15만 ⚠            ← 4행 안심(충당금 잔액, 초과시 ⚠)
```
기존 포인트버킷 4행 레이아웃 위에 STS·충당금 표시.
**데이터 파이프라인 완료**: schemaVersion은 **2 유지**(계약 안정성) + `safeToSpend:{amount,perDay,daysRemaining,spentRatio,negative,periodLabel}` + `funds:[{emoji,label,balance,overdrawn}]`(최대4)를 **추가 필드**로 실음. 웹(`buildRewardWidgetSnapshot` + `render-report.js` `widgetExtraFrom`/`widgetExtraState`) → Android 저장(`RewardWidgetStore.normalizeSafeToSpend`/`normalizeFunds`)까지 배선·영속화 완료. v2 계약(정확한 `JSON.stringify(buildRewardWidgetSnapshot(summary))` 문자열, schemaVersion 2) 보존.
**남은 작업(APK 재빌드 필요, 이 환경에서 검증 불가)**: `RewardWidgetProvider.java` + `android/res/layout/reward_widget.xml`에 STS 헤드라인 행 + 충당금 잔액 행 렌더링(신규 view ID). `android-checks.mjs` provider 토큰 목록 확장, `apk-version.json` versionCode/cacheBust bump + 설정 versionName 문자열, `npm run apk:build`. §1.6 4×2 레이아웃 참조.

## 6. 진행 상태 & 남은 작업 (코덱스 인수 지점)

### ✅ 완료
- `domain/funds/provision.js` (전체 도메인 로직)
- `data/repositories/funds.js` (provision_funds + budget_adjustments CRUD)
- `data.js` 재수출 + `initData` 로드
- `domain/transactions/budget.js` `isFundCovered` + 상호배타
- `data/repositories/settings.js` safeToSpend normalizer
- `features/report/budget-summary/state.js` `effectiveTargetFor`
- 거래 편집기: `features/transactions/editor/{view,controller}.js`, `modals/tx-edit-modal.js`, `render-tx.js` 충당금 칩
- `features/funds/{state,view,controller}.js` (충당금 카드/상세모달/재배분모달/입금 — UI+핸들러)

### ⬜ 남은 작업 (우선순위 순)
1. **홈 배선 — `render-report.js`** (가장 중요):
   - import: `getProvisionFunds, getActiveProvisionFunds, listBudgetAdjustments, listFundDrawTransactions, getAppSettings` (일부 이미 있음), `buildSafeToSpendSummary` (domain/funds/provision.js), `fundCardsHtml`(features/funds/view.js), `buildFundCardModels, setFundContext, fundsState, filterPeriodAdjustments, localISODate`(features/funds/state.js), `bindFundActions`(features/funds/controller.js), `effectiveTargetFor`(budget-summary/state.js).
   - homeMode에서: 펀드 로드(`getProvisionFunds()` 동기), 조정 로드(`listBudgetAdjustments({monthKey})`), 각 펀드 인출거래(`listFundDrawTransactions` 또는 cycleTxs/monthTxs에서 `fundId`로 필터). `buildSafeToSpendSummary` 계산 시 `budgetTotal = Σ effectiveTargetFor(controlCat, monthKey, mode, periodAdjustments)`, `spentTotal = Σ usedFor(controlCat, byCat)`.
   - 히어로 블록(현재 150–182행)을 homeMode일 때 STS 렌더로 교체: 라벨 "지금 써도 되는 돈", 금액 `summary.amount`(음수 경고), 진행바 `summary.spentRatio`, 메타 `예산 {B} − 충당금 {P} − 지출 {S}`, 서브라인 `남은 {daysRemaining}일 · 하루 {perDay}`.
   - 히어로와 `rewardSavingsCard` 사이에 `fundCardsHtml(buildFundCardModels(...), {expanded:fundsState.expanded})` 삽입.
   - `setFundContext({funds, drawTxsByFund, adjustments, periodAdjustments:filterPeriodAdjustments(...), categories:controlCategories, byCategory:byCat, monthKey, mode, cycleStartDate:localISODate(cycleRange.start), expanded})` 호출 → 모달들이 읽음.
   - `bindFundActions()` 호출(1회). 게이지 초과 필: `budget-summary/view.js` `gaugeRow`에서 `used > effectiveTarget`일 때 `reallocationPillHtml` 추가(현재 targetFor→effectiveTargetFor 전환 + options로 adjustments 전달 필요).
   - 비고: `budgetGaugeGroups`/`gaugeRow`가 `targetFor` 사용 중 → `effectiveTargetFor(…, adjustments)` 로 바꾸되 options에 adjustments 주입(기본 [] 하위호환).
2. **카테고리 드릴 모달 회색 표시**: fund_covered 거래를 회색+"충당금 처리됨" 라벨(집계 제외, 이력 가시). 위치: report category drill(현재 `render-report.js`/`features/report/*` category modal).
3. **설정 충당금 섹션 — 신규 `features/settings/funds/index.js` + `render-settings.js` + `features/settings/controller.js`**: `budgetGoalGroups` 패턴 참고. `data-fund-*` 위임 액션. `saveProvisionFund/deactivateProvisionFund` 사용. 저장 후 `refreshRewardWidgetSnapshot()` 호출.
4. **종합 위젯 — 데이터 파이프라인 완료, 렌더링만 남음**: `buildRewardWidgetSnapshot`은 schemaVersion 2 유지 + `safeToSpend`/`funds` 추가 필드(extra 또는 summary에서 읽음). `RewardWidgetStore.java`가 두 필드 영속화. **남은 것은 순수 Android 렌더링**: `RewardWidgetProvider.java`가 저장된 `safeToSpend`/`funds`를 읽어 STS 헤드라인·충당금 잔액 행 표시(신규 view ID 필요) + `reward_widget.xml` 레이아웃 + provider 토큰 계약(`android-checks.mjs` line 453) + `apk-version.json` bump + `npm run apk:build`. 이 환경은 APK 빌드 불가라 미착수.
5. **테스트**: `test/funds-provision.test.mjs`(accruedProvision/fundBalance/buildSafeToSpendSummary 엣지), `test/report-budget-summary.test.mjs`(effectiveTargetFor 하위호환), `test/reward-contract.test.mjs`(fund_covered가 dailyBaseline/todaySpend 불변 + v2/v3 snapshot shape), `test/transaction-editor-view.test.mjs`(fundAssignPanel 렌더+상호배타+type=button/data-* 계약), `test/settings-repository-contract.test.mjs`(safeToSpend 정규화).
6. **캐시버스팅**: 수정된 JS/CSS의 쿼리스트링을 `index.html`·`app.js`에서 갱신(AGENTS.md UI 규칙 3).
7. **검증/배포**: `npm run verify`(=node scripts/verify-project.mjs — data.js 경유·캐시버스팅 계약), `npm test`(node --test test/*.test.mjs). 배포는 AGENTS.md: production Pages(`npm run pages:build` 후 main 푸시 or `npm run deploy:pages`). **단, 이 작업은 designated 브랜치 `claude/spending-management-usability-6947az`에 커밋·푸시. main 직접 푸시는 사용자 승인 없이는 금지.**

## 7. 검증 방법 (수동, production Pages)
설정에서 충당금 생성 → 홈 히어로가 P만큼 감소·내역 표시 / 과태료 거래에 충당금 지정 → 카테고리 게이지·STS 지출에서 빠지고 펀드 잔액 감소, 포인트 "오늘" 무변화 / 지정 해제 → 복원 / 초과 인출 → 경고+재배분 → 게이지 목표 반영+이력 / 2주↔월 토글 / 음수 STS 스타일 / 안드로이드 위젯 v3 렌더(구 APK는 v2 폴백).

## 8. 리스크 (전제 충돌 감지 대상)
- 전제 C: 재배분 필을 계속 무시하면 "초과 시점 결정 의향" 전제 붕괴 → 자동 제안/롤오버(D) 리프레임 보고.
- 전제 B: 충당금이 매월 고갈/과잉 반복 시 연간 총량 추정 전제 재검토 → Phase 4 자동제안 앞당김.
- `BUDGET_MONTH_KEY='2026-05'` 고정 상수는 미변경(펀드는 자체 startMonthKey). 월키 정규화는 별도 슬라이스.
