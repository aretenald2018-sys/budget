# 포인트 정산과 마이너스 잔액 실행 기록

## 실행 범위

- 계획 문서: `docs/ai/features/2026-07-08-reward-point-settlement-negative-balance.md`
- 실행 슬라이스: 슬라이스 1 `거래 기반 포인트 정산과 음수 잔액 표시`
- 적용 결정: `월간 잔액 기준`
- 결정 근거: 현재 홈 카드와 Android 위젯이 이번 달 누적/월 예상 구조이므로, 누적 이월 통장 설계는 별도 ADR로 분리한다.

## 변경 내용

- `transactions` 문서에 `rewardPointEntry: { pointItemId, pointItemLabel, direction: 'spend', amount }` metadata를 저장/삭제할 수 있게 했다.
- 거래 추가/상세 수정 모달에 `포인트 정산` 패널을 추가했다.
- 포인트 계산을 `earnedMonthPoints - spentMonthPoints = monthPoints`로 바꾸고, `monthPoints`는 음수를 보존한다.
- 포인트 정산 metadata는 포인트 잔액 차감에 추가 반영한다.
- 기존 reward expense type/category 규칙은 유지한다. 따라서 포인트 정산 거래라도 `categoryNames`에 포함되는 category면 오늘 소비/절약 적립 계산에 그대로 반영된다.
- 홈 포인트 row가 음수 잔액이면 `overdrawn` class와 `-24,642P` 같은 직접 표시를 사용한다.
- 거래 목록에는 포인트 badge와 `와인구매 정산 -50,000P` meta를 표시한다.
- Android 위젯 snapshot/store/provider도 음수 `monthPoints`를 보존한다.
- `scripts/verify-project.mjs`에 와인구매 25,358P 적립 + 50,000P 정산 = `-24,642P` smoke를 추가했다.
- 브라우저 cache-bust query를 `20260708-reward-point-settlement`로 갱신했다.

## 변경 파일

- `data.js`
- `utils/reward-savings.js`
- `render-report.js`
- `modals/tx-edit-modal.js`
- `render-tx.js`
- `android/src/com/aretenald/budget/RewardWidgetStore.java`
- `android/src/com/aretenald/budget/RewardWidgetProvider.java`
- `scripts/verify-project.mjs`
- `styles/20-records.css`
- `styles/60-urge.css`
- `app.js`
- `render-home.js`
- `modal-manager.js`
- `style.css`
- `index.html`
- cache-bust-only `data.js` import 갱신 파일들

## 검증

- RED: 기존 `buildRewardSavingsSummary()` fixture에서 정산 후 `-24,642P`가 나오지 않고 `monthPoints`가 양수로 남는 것 확인.
- GREEN:
  - 와인구매 정산 fixture: category 규칙상 적립 소비에 포함되지 않는 거래에서 `todaySpend = 0`
  - `earnedMonthPoints = 25,358`
  - `spentMonthPoints = 50,000`
  - `monthPoints = -24,642`
  - 기존 category 규칙 유지 fixture: 같은 포인트 정산 거래가 `생활` category면 `todaySpend = 50,000`
  - 삭제된 포인트 fallback fixture: `retiredPoint` / `삭제된 포인트` row가 `monthPoints = -1,000`, `settlementOnly = true`
- `npm.cmd run verify`: 통과
  - `verify-project passed (92 JS files checked).`
- `npm.cmd run pages:build`: 통과
  - `_site` artifact 생성
- runtime audit:
  - `staleImportFixed = true`
  - 와인구매 `monthPoints = -24,642`
  - `includedTodaySpend = 50,000`
  - 삭제된 포인트 fallback `monthPoints = -1,000`

## 미검증

- `not verified yet`: production 배포가 아직 되지 않아 `https://aretenald2018-sys.github.io/budget/`에서 로그인 후 실제 거래 추가/수정/삭제 UI flow는 확인하지 못했다.
- 프로젝트 규칙상 sandbox 장기 dev server를 띄워 UI 검증 완료로 간주하지 않았다.

## 다음 액션

- 리뷰 세션에서 변경 파일과 계획 대비 구현을 검토한다.
- 리뷰 통과 후 의도한 변경만 commit/push 가능한 상태인지 확인하고, GitHub Pages workflow와 production UI에서 다음 flow를 확인한다.
  - 홈 진입
  - 거래 추가 50,000원
  - `포인트 정산 -> 와인구매` 선택 저장
  - 홈 와인구매 row가 `-24,642P` 같은 음수 잔액과 빈 progress를 표시
  - 거래 수정/삭제 시 잔액 재계산
