# 앱 전체 리팩토링 리뷰 - 슬라이스 0

## 범위

- 계획: `docs/ai/features/2026-07-12-appwide-refactor-plan.md`
- 슬라이스: 안전망과 기준선 분리
- 런타임 앱 동작 변경: 없음

## 변경 결과

- `scripts/verify-project.mjs`를 72줄 실행기와 책임별 검사 모듈로 분리했다.
  - `static-checks.mjs`: syntax, asset/import, browser/data/API, retired artifact.
  - `deployment-checks.mjs`: Pages/Actions/APK와 제거된 수집·러닝 경로.
  - `android-checks.mjs`: Android local capture와 reward widget 계약.
  - `domain-checks.mjs`: receipt, self-transfer, reward, newsfeed, 거래 상세 계약.
- `scripts/verify/runtime.mjs`에 root, 파일 순회, 실패 수집을 모았다.
- `scripts/verify/config.mjs`에 현재 배포/cache version 계약을 모았다.
- Node 내장 test runner와 4개 fixture 그룹을 추가했다.
  - Android notification/SMS capture.
  - self-transfer와 네이버페이 중복 병합.
  - Gmail receipt memo/link/category enrichment.
  - reward point baseline/projection.
- GitHub `Validate` workflow가 `npm test` 후 기존 verify를 실행하도록 했다.
- production UI 검증 기준을 `docs/refactor-smoke-matrix.md`에 기록했다.

## 리뷰 발견 사항

- 분리 직후 retired-token 검사가 검사 정의 파일 자신을 스캔해 30건을 보고했다.
  검사 모듈 자신만 명시적으로 제외하고 실제 소스 스캔 범위는 유지했다.
- 첫 fixture 기대값 3개가 기존 구현과 달라 테스트가 실패했다.
  런타임을 변경하지 않고 현재 계약에 맞게 fixture를 수정했다.
  - receipt item 수량 필드는 `quantity`가 아니라 `qty`다.
  - receipt link helper는 legacy link가 있을 때 `receiptId: ''`를 반환한다.
  - NaverPay merge patch는 `counterparty: null`, `body: null`을 유지한다.
- 새 검사 모듈도 syntax/import 검증 대상에 들어가 최종 JS 검사 수가 92개에서 103개로 늘었다.
- 차단 이슈나 런타임 회귀 증거는 없다.

## 검증

- `npm.cmd test`: 통과, 11 tests.
- `npm.cmd run verify`: 통과, 103 JS files checked.
- `git diff --check`: 통과.
- UI/runtime 파일을 변경하지 않아 production 화면 검증 대상은 아니다.

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 1에서 선택 탭 잔여 코드와 Pages/CSS 표면을 감사한다.
