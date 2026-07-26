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
- `test/domain-budget-period.test.mjs` — 기간 모델 + v1→v2 마이그레이션

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

- `npm test` — 173 pass / 0 fail (신규 15건 포함)
- `npm run lint` — 0 error
- `npm run verify` — 사전 존재 이슈(APK 미빌드) 외 신규 이슈 없음. 파일 길이 가드(`render-report.js` ≤650, `features/report/controller.js` ≤800)는 위 모듈 분리로 통과
- `npx playwright test` — 32 pass (4 뷰포트). 설정 01 스냅샷은 화면 변경분 반영해 갱신
- 실브라우저 왕복 확인: 설정에서 1주 저장 → 홈이 `이번 1주 포인트`로 전환, 홈 모달에서 2주 선택 → 설정 라디오가 2주로 표시

## 5. budget 스키마 v1 → v2 마이그레이션

`budget.amount`의 기준 기간이 '월'에서 '한 주기'로 바뀌어 일회성 이관을 넣었다.
`budget.schemaVersion`(현재 2)으로 판별하고, `getAppSettings`가 **정규화 전 원본 문서**에
`migrateLegacyBudget`(순수 함수)을 적용한 뒤 한 번만 되쓴다.
정규화가 v1 전용 필드(`startDay`/`customStartDate`)를 버리므로 순서가 중요하다.

### 실제 영향 범위 (이력 확인 결과)

`budget.amount`는 `b259d96`(2026-07-24)에 도입됐고 **유일한 writer(`budget-overall.js`)가 항상
`cycle`을 함께 저장**했다. 따라서 명시적으로 고른 주기는 그대로 보존되고, 기준 기간이 실제로
달라지는 경우에만 안분한다.

| v1 cycle | v1 amount 기준 | v2 cycle | 안분 |
|---|---|---|---|
| `monthly` | 월 | `monthly` | 없음 (기준 동일) |
| `weekly` | 1주 (구 `weeklyBudgetFor`가 amount를 그대로 반환) | `weekly` | 없음 (기준 동일) |
| `custom` | 월 (주기 정의가 없던 죽은 설정) | `custom` (기본 14일) | 월 → 주기 |
| 없음 | 월 (v1 기본값) | `biweekly` (v2 기본값) | 월 → 2주 |

즉 실제 사용자 데이터에서 금액이 바뀌는 경우는 `custom`을 골랐던 문서뿐이다.
v1의 `customStartDate`는 홈과 공유하는 앵커 `biweeklyStartDate`로 옮긴다(기존 앵커가 비어 있을 때만).

### 안전성

- **멱등**: 이관 결과는 원본 문서만의 함수라, 되쓰기가 실패해도 다음 로드에서 같은 값이 다시 계산된다. 이중 안분이 발생하지 않는다.
- **되쓰기 실패 허용**: 실패해도 이번 세션은 이관된 값으로 동작하고 경고만 남긴다.
- 새로 쓰는 모든 문서는 `normalizeBudgetSettings`가 `schemaVersion: 2`를 찍어 재이관 대상에서 빠진다.

### 검증 한계 (알려진 공백)

fixture 모드는 Firestore를 타지 않고 세션 캐시를 직접 채우므로, **되쓰기 경로 자체는 e2e로 실행되지 않는다.**
대신 ① 이관 규칙 4종 + 멱등성 단위 테스트, ② 원본→이관→정규화 순서 소스 계약 테스트,
③ 실브라우저에서 `domain/budget/period.js`를 직접 import 해 4종 규칙이 동일하게 나오는지 확인으로 덮었다.
실제 Firestore 되쓰기는 배포 후 v1 문서를 가진 계정에서 한 번 확인이 필요하다.

## 6. 남은 판단거리

- '매월'은 달력 월 고정이다. 죽은 설정이던 `startDay`(매월 N일 시작)는 제거했고, 월 경계를 옮기려면 `monthKey`/월 목표 키 체계까지 손봐야 해 별도 작업으로 남긴다.
- 시각 회귀 게이트의 `maxDiffPixelRatio: 0.02`는 이번 설정 01 화면 변경(~3% 차이)을 좁은 뷰포트(w320/w360)에서 통과시켰다. 베이스라인 4종은 수동 재생성했으나 임계값 자체를 조일지는 별도 판단.
