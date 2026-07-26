# 예산 기간 통합 — 설정 ↔ 홈 불일치 해소 + 2주 주기 설정 (완료)

## 1. 문제 (사용자 보고)

> "'설정'에서 설정하는 기간이랑 홈탭에서 설정하는 기간이랑 불일치함. 2주단위로 설정할 수 있어야 하니 코드 수정해줘."

기간 설정이 두 군데에 따로 있었고, 서로 연결되지 않았다.

| | 설정 › 전체 예산 | 홈 탭 기간 설정 |
|---|---|---|
| 저장 필드 | `appSettings.budget.{cycle,startDay,customStartDate}` | `appSettings.biweeklyStartDate` + `STATE.viewMode`(메모리) |
| 선택지 | 매월 / 매주 / 직접 설정 — **2주 없음** | 이번 2주 / 이번 달 |
| 지속성 | Firestore 저장 | 보기 모드는 **저장 안 됨**(새로고침 시 초기화) |
| 실제 반영 | `weeklyBudgetFor` 분모에만 사용 | 홈·리포트 전 집계의 기준 기간 |

추가로 `budget.startDay`(매월 시작일)와 `budget.customStartDate`는 **아무 코드도 읽지 않는 죽은 설정**이었다.
즉 설정 화면에서 홈이 실제로 쓰는 2주 주기를 표현할 방법이 없었고, 반대로 홈에서 바꾼 기간은 설정에 남지 않았다.

## 2. 설계 — 기간 SSOT 하나

기간 판단은 전부 신규 순수 모듈 `domain/budget/period.js`를 거친다.

```
appSettings.budget.cycle       'monthly' | 'biweekly' | 'weekly' | 'custom'  ← 지금 적용 중인 주기 = 홈의 기간
appSettings.budget.cycleUnit   'biweekly' | 'weekly' | 'custom'              ← 월 모드에서 되돌아갈 단위(기억)
appSettings.budget.customDays  2~90                                          ← cycle==='custom' 주기 일수
appSettings.biweeklyStartDate  ISO date                                      ← 주기 시작 앵커(두 화면 공용, 기존 필드 유지)
```

- 홈의 보기 모드는 더 이상 독립 상태가 아니다. `STATE.viewMode`는 매 렌더마다 `budget.cycle`에서 파생된다.
- 홈의 기간 세그먼트/모달을 누르면 `budget.cycle`이 **저장**된다 → 설정 화면에 즉시 반영.
- 설정 화면에서 주기를 저장하면 홈이 같은 기간으로 그려진다.
- 월(`monthly`) ↔ 주기 왕복 시 사용자가 고른 단위를 잃지 않도록 `cycleUnit`에 기억한다.
- 앵커 필드는 `biweeklyStartDate` 하나로 유지 — DayBird 백엔드(`api/_lib/daybird-budget-source.js`)와의 호환을 깨지 않는다.

### 주기 길이 파라미터화

`14`가 하드코딩돼 있던 자리를 전부 설정값으로 바꿨다.

- `utils/cycles.js`: `cycleRangeForDate(now, anchor, days)`, `cycleRange(key, days)`, 진행도(`cycleProgressForRange`)는 범위 길이에서 분모를 뽑는다(`totalDays` 추가).
- `domain/funds/provision.js`: 충당금 주기 안분과 `remainingDays`가 주기 길이를 따른다.
- `features/report/budget-summary/state.js`: `targetFor(cat, monthKey, mode, cycleDays)`.
- `features/home/model.js`: 추세선 창(`trendWindow`)과 기간 라벨.

### 안분 기준

월 금액 → 주기 금액은 **4주(28일) 기준**: `round(monthly * cycleDays / 28)`.
2주는 정확히 `monthly / 2`라 **기존 동작과 값이 같다**(회귀 없음). 1주는 1/4, 직접 N일은 N/28.

## 3. 변경 파일

**신규**
- `domain/budget/period.js` — 기간 모델(정규화·일수·라벨·안분·`resolveBudgetPeriod`)
- `features/report/period-modal.js` — 홈/리포트 기간 설정 모달(컨트롤러에서 분리)
- `features/home/cards.js` — 홈 추가 카드 모델(최근 거래·예산 요약·소비 캘린더, `render-report.js`에서 분리)
- `test/domain-budget-period.test.mjs`

**수정**
- `data/repositories/settings.js` — `budget` 스키마에 `biweekly`/`cycleUnit`/`customDays` 추가, 기본 주기 `biweekly`. 죽은 `startDay`/`customStartDate` 제거
- `features/settings/screens/budget-overall.js` — 주기 라디오에 **2주** 추가, 공용 앵커 시작일 입력, 히어로/예산 금액이 현재 주기 기준
- `features/report/controller.js` — 기간 세그먼트가 `budget.cycle`을 저장, 라벨을 주기에서 파생
- `render-report.js` — `resolveBudgetPeriod`로 기간·보기모드 결정, `cycleDays` 전파
- `features/home/model.js`, `features/funds/home.js`, `features/report/budget-summary/{state,view}.js`, `features/report/subcategory-classifier/{controller,view}.js`, `features/settings/funds/index.js`, `render-settings.js` — 하드코딩 '이번 2주' 라벨을 설정된 주기 라벨로
- `domain/transactions/weekly.js` — `weeklyBudgetFor`가 `biweekly`/`custom`을 처리
- `api/_lib/daybird-budget-source.js` — 스냅샷 주기도 설정을 따름
- `styles/features/hd-modal.css`, `e2e/home.spec.mjs`, `docs/ai/contracts/home.contract.md`, `release.json`

## 4. 검증

- `npm test` — 169 pass / 0 fail (신규 11건 포함)
- `npm run lint` — 0 error
- `npm run verify` — 사전 존재 이슈(APK 미빌드) 외 신규 이슈 없음. 파일 길이 가드(`render-report.js` ≤650, `features/report/controller.js` ≤800)는 위 모듈 분리로 통과
- `npx playwright test` — 32 pass (4 뷰포트). 설정 01 스냅샷은 화면 변경분 반영해 갱신
- 실브라우저 왕복 확인: 설정에서 1주 저장 → 홈이 `이번 1주 포인트`로 전환, 홈 모달에서 2주 선택 → 설정 라디오가 2주로 표시

## 5. 남은 판단거리

- `budget.amount`는 이제 **한 주기 예산**이다. 기존 사용자가 월 예산으로 입력해 둔 값은 기본 주기(2주)에서 2주 예산으로 해석된다 — 설정 화면 라벨(`예산 금액 (2주 기준)`)로 드러나지만, 필요하면 마이그레이션(월 → 주기 안분) 여부를 별도로 결정해야 한다.
- '매월'은 달력 월 고정이다. 죽은 설정이던 `startDay`(매월 N일 시작)는 제거했고, 월 경계를 옮기려면 `monthKey`/월 목표 키 체계까지 손봐야 해 별도 작업으로 남긴다.
