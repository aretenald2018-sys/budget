# 홈 대시보드 화면 계약서

> 이 문서는 예시 계약서다. 현재 홈 화면 구현을 AI가 역공학해 채웠다.
> 코드에서 확정 가능한 동작은 사실대로 기록했고, 코드로 알 수 없는 갈리는 동작만 §4 미확정 질문으로 남겼다.
> 시각 기준(색·간격·타이포)은 여기 쓰지 않는다 — 그건 `docs/design-system.md`의 몫이다.
> 이 문서는 "어떻게 작동해야 하는가"만 정의한다.

- 상태: `draft` (§4 미확정 질문 6건 미답변 — 모두 답변/가정 처리되면 `confirmed`)
- 관련 코드:
  - 모델: `features/home/model.js` (`buildHomeModel`, `buildHero`, `buildTrend`, `trendWindow`, `buildCategories`, `buildGoals`)
  - 뷰: `features/home/dashboard.js` (`homeDashboardHtml`, `heroHtml`, `heroChartHtml`)
  - 컨트롤러: `features/report/controller.js` (`data-report-action` 핸들러)
  - 셸/탭: `index.html` (`.tab-content`, `.bottom-nav`)
- 마지막 갱신: 2026-07-24

## 1. 요소 계약

| 요소 | 유형 | 동작 | 데이터 | 완료 기준 |
| --- | --- | --- | --- | --- |
| 기간 세그먼트 (2주 / 달) | 세그먼트 컨트롤 | 하나만 선택. `set-report-mode`로 모드를 명시 지정 → `renderReport` 재실행(집계 데이터가 달라 재조회 필요). 기간 라벨·추세선·히어로 타이틀이 갱신된다. | 모드별 집계(`cycleTxs` / `monthTxs`, `byCat` / `byCatMonth`) | 선택한 모드의 값·라벨·추세선이 반영되고, 같은 모드를 다시 누르면 아무 동작 안 함(`next === STATE.viewMode`이면 early return) |
| 렌즈 세그먼트 (써도 되는 돈 / 쓴 돈) | 세그먼트 컨트롤 | 하나만 선택. `hero-lens`는 표시 전환일 뿐이라 전체 재렌더 없이 `.hd-hero` 요소만 `outerHTML`로 부분 교체 | 이미 로드된 `STATE.homeModel.hero` (재조회 없음) | 히어로 영역만 바뀌고 나머지 화면(KPI·카테고리·목표 등)은 그대로. 같은 렌즈 재선택 시 early return |
| 기간 라벨 버튼 (날짜 pill) | 액션 버튼 | `open-biweekly-start-settings` → 기간 설정 모달(`home-cycle-settings-modal`) 열림. 모달에서 보기 모드 전환 + 2주 시작일 입력·저장 | `STATE.biweeklyStartDate`, `STATE.cycleRange` | 모달에서 시작일 저장 시 `saveAppSettings` 호출, 저장 중 버튼 비활성, 성공 토스트 후 재렌더. 실패 시 오류 토스트, 값 롤백 |
| 알림(종) 아이콘 | 내비게이션 버튼 | `switch-tab` → `review` 탭. 미검토 건수 배지(`reviewCount`, 99 초과 시 `99+`) | `review.count` | review 탭 이동, 배지 수가 실제 검토 대기 건수와 일치 |
| 분석 보기 버튼 | 내비게이션 버튼 | `switch-tab` → `report` 탭 | — | report 탭으로 이동 |
| KPI 4칩 (수입/충당금/고정비/이번 달 예산) | 내비게이션 버튼 | 수입→`switch-tab` `tx`. 나머지 셋은 `open-settings-screen`으로 설정 drill-in 화면을 직접 연다: 충당금→`settings-funds-modal`, 고정비→`settings-screen-category-goals`, 이번 달 예산→`settings-screen-budget` | `income`, `fundBalance`, `fixedUsed`, `monthTargetAll` | 각 칩이 해당 설정 화면을 실제로 연다. `data-scroll-to`(닫힌 오버레이 안 섹션을 겨냥해 무동작이던 방식)는 금지 |
| 지출 카테고리 도넛 | 데이터 표시 + 드릴 | 지출 상위 5개 + `기타`(6번째 이후 합산). 각 범례 행은 `open-category`로 카테고리 거래 모달 열기(단, `기타`는 `drillName`이 없어 비클릭) | `buildCategories(byCat)` — `expense > 0`인 카테고리, 금액 내림차순 | 상위 5개 + 기타가 도넛·범례에 표시. 지출 0이면 빈 상태 "이번 기간 지출이 아직 없어요" |
| 충당금 섹션 | 데이터 표시 / 빈 상태 CTA | 충당금 있으면 각 주머니 행 → `open-fund` 모달. 없으면 CTA 버튼 → `open-settings-screen` `settings-funds-modal` | `buildFundsSection(fundModels)` (`active !== false`) | 주머니 목록 또는 빈 상태 CTA 중 하나가 항상 존재. CTA 를 누르면 충당금 관리 화면이 실제로 열린다 |
| 나의 목표 (카테고리 그룹) | 데이터 표시 + 드릴 | 각 목표 카드 → `open-goal-detail` 모달. 목표 미설정(`target<=0`)이면 "설정하기" → `settings-screen-category-goals`, 단 **미분류는 "정리하기" → `open-category`**(미분류 거래 드릴 + 소비처별 일괄 재분류). 초과(`percent>100`)면 "재배분" → `open-reallocation` | `buildGoals(...)` — 그룹 목록은 `categoryGroupsFrom(budgetCategories)`로 **데이터에서 유도**(하드코딩 금지), 미분류는 항상 마지막 | 사용자가 만든 그룹도 카드로 나타난다. 초과 시 danger 색 + 재배분 타깃 노출 |
| 포인트 섹션 | 데이터 표시 | 각 행 → `open`(리워드 포인트 모달). 상위 4개 버킷 | `buildPoints(rewardSummary)` | 포인트 내역 또는 빈 상태 "아직 포인트 내역이 없어요…" |
| 하단 내비게이션 | 내비게이션 버튼 | 홈 / 자산 / 와인 / 거래 / 설정 + 가운데 거래추가 FAB. 모든 탭에서 동일하게 노출 | — | 모든 탭에서 하단 내비가 유지되고, 현재 탭이 active로 표시 |

유형 규약:

- **세그먼트 컨트롤**: 항상 하나만 선택. 전환 시 영향 영역만 갱신하고 스크롤 위치·입력값을 보존한다.
  - 기간 세그먼트는 데이터 재조회가 필요해 `renderReport` 전체 재실행이지만, 이것도 "페이지 전체 강제
    새로고침"이 아니라 탭 컨텐츠 재렌더다(§5 참조).
  - 렌즈 세그먼트는 표시 전환일 뿐이라 `.hd-hero`만 `outerHTML`로 부분 교체한다.
- **내비게이션 버튼**: 이동 대상 탭과, 이동 후 유지되는 공통 셸(하단 내비게이션)을 명시한다.

## 2. 데이터 계약

계산 로직은 `features/home/model.js`의 순수 함수에 있고, 단위 테스트가 선행되어야 한다.

### 히어로 추세선 (`buildTrend`)

- 데이터 원천: 모드별 거래(`cycleTxs` 2주 / `monthTxs` 월), `renderReport(homeMode)`가 로드해 주입.
- 포함 대상 / 제외 대상: `card_payment`, `transfer_out` 유형만 포함. 그 외 유형(수입·내부 이체 등)은 제외.
- 기간 정의(`trendWindow`):
  - 2주 = 사이클 시작일(`cycleRange.start`)부터 14일.
  - 월 = 해당 월 1일부터 말일까지(그 달 일수).
- 집계 단위: 기간을 10개 버킷으로 나눠 각 버킷에 일자별 지출을 담고, 누적 합계(cumulative sum) 곡선으로 반환. 원 단위.
- 스케일: 곡선은 `0 ~ 예산` 스케일. 끝점 크기를 히어로 '쓴 돈'(`trendSpent`)에 맞춰 재스케일. 예산이 있으면 이상 페이스(0→예산) 점선을 함께 그림.
- 거래가 없는/짧은 구간: **곡선을 그리지 않는다**(§4 Q1 확정). `buildTrend`는 빈 배열을 반환하고, `heroChartHtml`은 '써도 되는 돈' 렌즈 + 예산>0 일 때만 "아직 지출 없음" 평평한 선을 그린다. 장식용 폴백 배열은 금지.

### 히어로 금액 (`buildHero`)

- 써도 되는 돈(STS): `safeToSpend.amount`(충당금 차감 후 가용액 B−P+A 기준). 없으면 `budget - spent`.
- 쓴 돈: `spent` = 조절 카테고리 사용액 합계(`usedFor`).
- 사용률: STS 렌즈는 `stsSpent / stsAvailable`, 쓴 돈 렌즈는 `spent / budget`. 원 단위, 소수 1자리 반올림.

### 카테고리 도넛 (`buildCategories`)

- 데이터 원천: `byCat`(카테고리별 집계). `expense > 0`만 포함.
- 정렬·묶음: 금액 내림차순 상위 5개 + 나머지 합산 `기타`. 백분율은 총액 대비 정수 반올림.
- 거래 없음: 빈 배열 → 빈 상태 문구.

### 목표 (`buildGoals`)

- 순서: **데이터에서 유도**한다 — `categoryGroupsFrom(budgetCategories)` (`domain/categories/groups.js`). 그룹 안 최소 `parentOrder` → 최초 등장 순, 미분류는 항상 마지막. 하드코딩 목록 금지(사용자가 만든 그룹이 홈에서 통째로 사라지던 버그의 원인).
- 사용/목표: 하위 카테고리별 `usedFor` / `effectiveTargetFor` 합산.
- 초과 시: 가장 초과한 하위 카테고리를 재배분 타깃으로 노출.
- 목표 미설정(`target<=0`): `percent: null` + 구조화된 `action`. 미분류는 `{label:'정리하기', reportAction:'open-category'}`, 나머지는 `{label:'설정하기', reportAction:'open-settings-screen', settingsScreen:'settings-screen-category-goals'}`.

- 미래 날짜: **명시 정의 없음** — 버킷 인덱스는 `[0, span-1]`로 클램프되므로 미래 거래가 마지막 버킷에 몰릴 수 있음. §4 Q5에서 확정한다.

## 3. 상태 행렬

| 상태 | 히어로(추세선/금액) | 카테고리 도넛 | 충당금 | 목표 |
| --- | --- | --- | --- | --- |
| 로딩 | **미정의** (§4 Q3) | 미정의 | 미정의 | 미정의 |
| 데이터 있음 | 실제 누적 지출 곡선 + STS/쓴 돈 금액 | 상위 5 + 기타 도넛·범례 | 주머니 목록(잔액·초과 경고) | 카테고리별 게이지·분수 |
| 데이터 없음 | 금액 0원 + **스파크라인 미렌더**(지어낸 곡선 금지) | 빈 상태 "이번 기간 지출이 아직 없어요" | 빈 상태 CTA "돌발 지출 대비 주머니가…" → 충당금 관리 화면 | 빈 상태 CTA "아직 목표가 없어요…" → 카테고리 목표 화면 |
| 오류 | **미정의** (§4 Q4) | 미정의 | 미정의 | 미정의 |
| 저장 중 | (홈에서 직접 저장 없음) | — | — | 기간 설정 모달 저장 시 submit 버튼 비활성 + 성공/실패 토스트 |

로딩·오류 상태가 비어 있는 것이 이 계약서의 핵심 공백이다. 정상 화면만 정의되어 있어 §4에서 확정이 필요하다.

## 4. 미확정 동작 (객관식 질문)

### Q1. 추세 데이터가 없거나 짧을 때 어떻게 보일지

**확정 (2026-07-27)**: 장식용 폴백 배열을 제거했다. 지출 이력이 없으면 곡선을 그리지 않고,
'써도 되는 돈' 렌즈에서 예산이 있을 때만 "아직 지출 없음" 평평한 선을 그린다(예산이 아직
그대로 남아 있다는 것 자체가 사실이므로 정직하다).
- 근거: 장식용 데이터는 실데이터와 구분이 안 돼 데이터 불일치로 읽힌다(`WORKFLOW.md` "장식용 데이터 금지" 위반).
- 회귀 방지: `e2e/home.spec.mjs` "빈 계정에는 가짜 소비 곡선·목업 수치가 없다 (empty)".

### Q2. `DEFAULT_MODEL`(하드코딩 샘플 금액)의 지위

**확정 (2026-07-27)**: `DEFAULT_MODEL`(태우 · −191,323원 · 가짜 도넛/목표/포인트)을 삭제하고
전부 0/빈 배열인 `EMPTY_MODEL` 로 교체했다. 실모델 필드가 누락돼도 샘플 금액이 진짜 데이터처럼
노출될 수 없다.
- 근거: fixture 는 테스트 경로로 격리해야 한다(`WORKFLOW.md` fixture 4조건).
- 회귀 방지: `test/home-dashboard.test.mjs` "빈 모델은 목업 수치·가짜 곡선을 렌더하지 않는다" +
  `e2e/home.spec.mjs` 의 empty 시나리오 단언.

### Q3. 홈 진입 시 로딩 상태 (현재 정의 없음)

- (a) 스켈레톤
- (b) 이전 화면 유지 후 완료 시 교체 **← 추천**
- (c) 스피너
- 추천 사유: SPA 탭 전환이라 이전 화면을 유지하다 완료 시 교체하면 깜빡임이 적다. 최초 진입만 별도 스켈레톤을 검토.
- 사용자 답변: _(미답변)_
- 미답변 시 적용 기본값: (b) — `가정`

### Q4. 데이터 로드 오류 시

- (a) 오류 안내 + 재시도 버튼 **← 추천**
- (b) 빈 화면
- (c) 이전 값 유지 + 토스트
- 추천 사유: 재시도 없는 빈 화면은 막다른 길이다. 명시적 오류 + 재시도가 사용자가 회복할 수 있는 유일한 상태.
- 사용자 답변: _(미답변)_
- 미답변 시 적용 기본값: (a) — `가정`

### Q5. 미래 날짜 구간 표시 방식

추세선 버킷은 `[0, span-1]`로 클램프되어 미래 거래(예약·미래 일자)가 마지막 버킷에 몰릴 수 있다.

- (a) 미래 구간은 곡선에서 제외(경과 일수까지만 그림) **← 추천**
- (b) 미래 거래도 마지막 버킷에 포함(현행)
- (c) 미래 구간을 점선/흐리게 별도 표시
- 추천 사유: "지금 여기" 툴팁과 이상 페이스선의 의미상, 곡선은 경과분까지만 그려야 페이스 비교가 정확하다.
- 사용자 답변: _(미답변)_
- 미답변 시 적용 기본값: (a) — `가정`

### Q6. 홈 탭에서 finance 탭 내비 항목 숨김 유지 여부

`styles/features/home-dashboard.css`가 홈 탭에서만 `.bottom-nav [data-tab="finance"]`를 `display:none`으로 숨긴다.

- (a) 유지(홈에서 finance 진입점은 다른 곳에 있음) **← 추천**
- (b) 모든 탭에서 동일한 내비 항목 노출
- (c) finance 항목 자체를 내비에서 제거
- 추천 사유: 화면마다 내비가 달라지는 것이 근본원인 묶음 C의 문제다. 다만 이 결정은 `.bottom-nav` 통합(묶음 C) 슬라이스에서 함께 확정하는 것이 안전하다.
- 사용자 답변: _(미답변)_
- 미답변 시 적용 기본값: (a) — `가정` (묶음 C 슬라이스에서 재검토)

답변되면 해당 내용을 §1~§3에 반영하고 질문을 "답변됨: (x)"로 갱신한다.

## 5. 허용되지 않는 동작

- 세그먼트/렌즈 전환 시 **페이지 전체 강제 새로고침**(`location.reload` 등). 렌즈는 `.hd-hero` 부분 교체, 기간은 탭 컨텐츠 재렌더까지만.
- 추세선·금액을 **장식용 고정 배열**(`[8, 11, ...]`, `DEFAULT_MODEL` 샘플 금액)로 채우기 — 데이터가 없으면 빈 상태로.
- 세그먼트/렌즈 전환 시 **스크롤 위치 초기화** 또는 열려 있던 모달·입력값 소실.
- 동작이 정의되지 않은 버튼을 그리기(빈 핸들러). 이동/저장/실패 동작이 없으면 그리지 않거나 비활성 처리.
- 실데이터 로드 실패를 조용히 삼키고 샘플 데이터로 대체하기.

## 6. 완료 기준 연결

- 단위 테스트: `test/*.test.mjs` (`buildTrend`, `buildCategories`, `buildGoals`, `buildHero` 계산 로직)
- E2E/시각 회귀: `e2e/home.spec.mjs` (기간/렌즈 전환, 탭 이동, 320/360/390/412px) — Playwright 슬라이스 도입 후
- 공통 기준: `docs/ai/DEFINITION_OF_DONE.md`
