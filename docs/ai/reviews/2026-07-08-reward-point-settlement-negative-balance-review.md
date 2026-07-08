# 포인트 정산과 마이너스 잔액 리뷰

## 리뷰 대상

- 계획 문서: `docs/ai/features/2026-07-08-reward-point-settlement-negative-balance.md`
- 실행 문서: `docs/ai/executions/2026-07-08-reward-point-settlement-negative-balance.md`
- 실행 슬라이스: `거래 기반 포인트 정산과 음수 잔액 표시`
- 적용 기준: `월간 잔액 기준`

## 리뷰 결과

- 상태: `needs_production_ui_verification`
- 코드/계산 검증: 통과
- production UI 검증: `not verified yet`
- Android widget runtime 검증: `not verified yet`

## 리뷰에서 발견한 차단 이슈와 조치

1. `render-report.js`가 변경된 `utils/reward-savings.js`를 옛 cache-bust 버전으로 import했다.
   - 조치: `utils/reward-savings.js?v=20260708-reward-point-settlement`로 갱신.
   - 검증: `scripts/verify-project.mjs`가 nested reward utility import 버전을 검사하도록 추가.

2. `rewardPointEntry`가 붙은 거래가 기존 reward expense 계산에서 강제로 제외됐다.
   - 조치: `isRewardExpense()`에서 metadata 기반 제외를 제거.
   - 결과: 기존 type/category 규칙은 그대로 유지되고, 포인트 metadata는 포인트 잔액 차감에만 추가 반영된다.
   - 검증: 같은 정산 거래가 `생활` category면 `todaySpend = 50,000`을 반환하는 fixture 추가.

3. 삭제/비활성 포인트 항목의 정산 fallback row가 홈 계산에 나타나지 않았다.
   - 조치: `pointItemsWithSettlementFallbacks()`로 정산 metadata만 남은 point item row를 생성.
   - 결과: 삭제된 `retiredPoint`도 `삭제된 포인트`, `monthPoints = -1,000`, `settlementOnly = true`로 반환.

4. 홈 row meta가 계획의 `적립 / 정산 / 잔액` 표현과 어긋났다.
   - 조치: row meta를 `적립 +...P · 정산 -...P · 잔액 -...P` 중심으로 변경.
   - 보조 meta는 `오늘`, `오늘 카드`, `월 예상`, progress, 적립률을 유지.

5. 새 UI/cache 계약 검증이 부족했다.
   - 조치: `verify-project`에 `포인트 정산`, `rewardPointEnabled`, `rewardPointAmount`, `overdrawn`, `formatPointBalance`, `spentMonthPoints`, `earnedMonthPoints`, overdrawn CSS, nested utility import checks 추가.

## 검증 증거

- Runtime audit:
  - `staleImportFixed = true`
  - 와인구매 `earnedMonthPoints = 25,358`
  - 와인구매 `spentMonthPoints = 50,000`
  - 와인구매 `monthPoints = -24,642`
  - 기존 category 규칙 유지: `includedTodaySpend = 50,000`
  - 삭제된 포인트 fallback: `retiredPoint`, `삭제된 포인트`, `monthPoints = -1,000`, `settlementOnly = true`
- `npm.cmd run verify`: 통과
  - `verify-project passed (92 JS files checked).`
- `npm.cmd run pages:build`: 통과
  - `_site` artifact 생성
- `git diff --check`: 통과
- 재확인(2026-07-08):
  - `npm.cmd run verify`: 통과 (`verify-project passed (92 JS files checked).`)
  - `npm.cmd run pages:build`: 통과 (`_site` artifact 생성)
  - `git diff --check`: 통과
  - production HTML: HTTP 200, `20260708-reward-point-settlement` 토큰 0건, 아직 미배포

## Review-Work 요약

- Goal gate: FAIL
  - 사유: production logged-in UI flow가 아직 `not verified yet`, review artifact가 당시 없었음.
- QA lane: INCONCLUSIVE
  - 사유: Node/build/source 검증은 통과, production 로그인 UI와 Android widget runtime은 실행 불가.
- Code quality lane: FAIL 이후 수정
  - 원인: stale nested `utils/reward-savings.js` import와 verify gap.
  - 조치 완료 후 축소 재리뷰 PASS.
- Security lane: INCONCLUSIVE
  - 확인된 취약점은 없음.
  - production/manual QA 증거 부족으로 승인 불가.
- Context mining lane: FAIL 이후 수정
  - 원인: category rule 보존, deleted/disabled fallback, meta 표현, UI/cache 검증 gap.
  - 조치 완료 후 축소 재리뷰 PASS.

## 남은 확인

- `not verified yet`: production에 아직 배포하지 않았으므로 `https://aretenald2018-sys.github.io/budget/`에서 실제 로그인 후 거래 추가/수정/삭제 flow를 확인하지 못했다.
- `not verified yet`: Android device/emulator widget runtime에서 음수 포인트 표시를 직접 확인하지 못했다.

## 다음 액션

1. 의도한 변경만 commit/push 가능한 상태인지 확인한다.
2. 사용자가 명시적으로 커밋/푸시를 요청하면 GitHub Pages 배포 경로를 진행한다.
3. GitHub Pages workflow success를 확인한다.
4. production에서 다음 UI flow를 직접 확인한다.
   - 홈 진입
   - 거래 추가 50,000원
   - `포인트 정산 -> 와인구매` 선택 저장
   - 홈 와인구매 row가 `-24,642P` 같은 음수 잔액과 빈 progress를 표시
   - 거래 상세에서 정산 항목/차감액 수정 시 홈 잔액 재계산
   - 거래 삭제 시 포인트 잔액 복구
