# 포인트 목표 진행선과 설정 CRUD 실행

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-reward-point-goals-progress-crud.md`
- 실행 슬라이스: 슬라이스 1 `웹 포인트 목표 진행선과 설정 CRUD`
- 요청 범위:
  - 홈 `오늘의 적립` 포인트별 기준액 대비 선형 진행선 추가
  - 설정에서 포인트 항목 이름/적립률/기준액/사용 여부 CRUD
  - 기본 기준액 120,000 / 80,000 / 200,000원
  - 월예상 산식을 `오늘 적립액 * 월 일수`로 수정

## 구현 내용

- `data.js`
  - `rewardSavings.pointItems` 배열을 추가했다.
  - 기존 `pointRates`/`allocationRate` 저장값은 기본 3개 항목의 적립률로 마이그레이션한다.
  - `pointRates` alias를 계속 반환해 기존 코드와 위젯 fallback 계약을 유지한다.
- `utils/reward-savings.js`
  - 계산 소스를 고정 3개 bucket에서 `pointItems`로 확장했다.
  - 비활성 항목은 홈 bucket 계산에서 제외한다.
  - `targetAmount`를 bucket 결과에 포함했다.
  - `projectedMonthPoints`를 `todayPoints * daysInMonth`로 바꿨다.
- `render-report.js`
  - 홈 `오늘의 적립` 포인트 row에 `이번 달 누적 / 기준액`과 선형 progress bar를 추가했다.
  - 상단 문구를 `상한 없음`에서 `기준액 대비`로 바꿔 기준액이 cap처럼 보이지 않게 했다.
- `render-settings.js`
  - 기존 3개 적립률 입력을 포인트 항목 편집기로 교체했다.
  - 항목 추가/삭제는 `data-reward-point-action` delegated listener로 처리한다.
  - 저장 시 `pointItems`를 정규화하고 `pointRates` alias도 함께 저장한다.
- `styles/60-urge.css`
  - 설정 항목 편집 행, 빈 상태, 기준액 입력, 홈 진행선 스타일을 추가했다.
- Cache bust
  - `app.js`, `index.html`, `style.css`, `modal-manager.js`와 data import 사용 모듈의 query string을 `20260703-reward-point-goals`로 맞췄다.
- `scripts/verify-project.mjs`
  - 기본 기준액, CRUD UI 토큰, 홈 진행선 토큰, 오늘 기준 월예상 산식을 검증한다.

## 검증

- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; node --check .\data.js; node --check .\utils\reward-savings.js; node --check .\render-report.js; node --check .\render-settings.js; node --check .\scripts\verify-project.mjs`
  - 통과
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - 통과: `_site` 산출물 생성

## 미검증

- production GitHub Pages 배포 및 실제 UI 조작 검증은 아직 하지 않았다.
- 다음 리뷰 세션에서 변경 파일을 점검한 뒤, 커밋/푸시 가능 상태면 운영 배포와 production UI 확인으로 이어간다.

## 변경 파일

- `app.js`
- `data.js`
- `index.html`
- `modal-manager.js`
- `modals/account-modal.js`
- `modals/category-modal.js`
- `modals/tx-edit-modal.js`
- `render-finance.js`
- `render-home.js`
- `render-report.js`
- `render-review.js`
- `render-settings.js`
- `render-settle.js`
- `render-tx.js`
- `scripts/verify-project.mjs`
- `style.css`
- `styles/60-urge.css`
- `urge/render-mindbank.js`
- `urge/render-urge-alternatives.js`
- `urge/render-urge-input.js`
- `urge/render-urge-result.js`
- `urge/render-wine-cellar.js`
- `utils/reward-savings.js`
- `docs/ai/features/2026-07-03-reward-point-goals-progress-crud.md`
- `docs/ai/diagnoses/2026-07-03-reward-month-projection-formula.md`
- `docs/ai/executions/2026-07-03-reward-point-goals-progress-crud.md`
- `docs/ai/NEXT_ACTION.md`

## 다음 단계

- `docs/ai/features/2026-07-03-reward-point-goals-progress-crud.md`와 위 변경 파일을 대상으로 리뷰한다.
- 리뷰 중 새 기능은 추가하지 않는다.
