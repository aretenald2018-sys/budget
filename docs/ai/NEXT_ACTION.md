# 다음 자동 액션

## 2026-07-24 개발 프로세스 개선 (계약서·ESLint·Playwright)

- 상태: `needs_user_decision`
- 완료 내용 (브랜치 `claude/app-dev-process-review-yynbbi`):
  - `WORKFLOW.md`에 화면 계약서 단계·버그 안정화 우선·장식용 데이터 금지 규칙 추가. `DEFINITION_OF_DONE.md`,
    `contracts/TEMPLATE.md`, `contracts/home.contract.md`(예시) 신설. GPT 프로세스 제안 취사선택 기록은
    `reviews/2026-07-24-process-proposal-review.md`.
  - ESLint 도입(`npm run lint`, CI 게이팅). lint가 발견한 실버그 의심 3건은 `ROADMAP.md` 백로그 참조.
  - Playwright 인프라: `?fixture=<scenario>` 데이터 계층 심, 홈 스모크, 시각 회귀 스냅샷 16장
    (320/360/390/412px × 4탭, 픽셀 diff CI 게이팅). 사용법은 `e2e-guide.md`.
- 검증: `npm run lint` 0 errors, `npm test` 143/143, `npm run test:e2e` 24/24,
  `BUDGET_VERIFY_SKIP_APK_ARTIFACT=1 npm run verify` 통과, `pages:build` 영향 없음.
- 사용자 결정 대기:
  1. `contracts/home.contract.md` §4의 객관식 질문 6건(폴백 그래프·`DEFAULT_MODEL`·로딩·오류·미래 날짜·홈 내비 변형)에
     답하면 계약이 `confirmed`가 되고 묶음 A 슬라이스를 시작할 수 있다.
  2. `ROADMAP.md` 근본원인 묶음 백로그(A~D + lint 발견 버그 3건 + '분석 보기' 겹침)의 착수 순서.
- 첫 CI 실행에서 시각 회귀가 폰트 차이로 실패하면 `e2e-guide.md`의 베이스라인 갱신 절차를 따른다.

## 2026-07-12 앱 전체 리팩토링 계획

- 상태: `complete` (비-E2E 검증 범위)
- 계획 문서: `docs/ai/features/2026-07-12-appwide-refactor-plan.md`
- 교정: 이전 전체 완료 표기는 무효화했다. 삭제된 욕구·마인드뱅크·와인 셀러 잔재, 대형 renderer의 혼합 책임, 분산 cache query를 추가로 제거했다.
- 완료: 현재 화면의 renderer/state/controller 경계, 앱 background sync 경계, `release.json` 기반 Pages release stamping을 완료했다.
- 최종 리뷰: `docs/ai/reviews/2026-07-12-appwide-refactor-corrected-audit.md`
- 후속 교정: 거래·계좌·카테고리 모달의 controller 분리와 거래 상세 재진입 listener/비동기 응답 guard를 추가했다. 재무 차트와 자산 사진 분석·티커 검색도 분리하고 목표 시나리오 계산 import 누락을 수정했다.
- 검증: `npm.cmd test` 71/71, `npm.cmd run verify` 184 files, `npm.cmd run pages:build`, `git diff --check` 통과.
- E2E: 사용자 지시에 따라 수행하지 않았으며 완료 증거로 주장하지 않는다.
- 차단 질문: 없음.

## 2026-07-11 Budget Boundary Release

- 상태: `complete`
- 배포 범위:
  - 러닝/GPS 탭, Android 위치 권한·서비스·공유 import, Firestore `run_activities` 경로를 제거한다.
  - 포인트 사용을 거래 metadata와 분리한 `reward_point_entries` 가상 원장으로 전환한다.
  - 설정의 월 예산을 요약 지표와 상위 카테고리 카드로 재구성한다.
  - Android APK를 `v2.2.1 / versionCode 23`으로 올려 기존 설치본이 갱신되게 한다.
- 완료한 검증:
  - Android APK 재빌드 통과 (`v2.2.1/23`).
  - `npm.cmd run verify` 통과.
  - `npm.cmd run pages:build` 통과.
  - 러닝 기능 파일·탭·Android bridge·빌드 산출물 재유입을 막는 회귀 검증을 추가했다.
  - `cb32948`을 `main`에 push했고, `Deploy GitHub Pages` workflow [`29138593083`](https://github.com/aretenald2018-sys/budget/actions/runs/29138593083)가 성공했다.
  - production (`https://aretenald2018-sys.github.io/budget/`)에서 러닝 탭 제거, 설정 예산 요약/카테고리 카드, 카테고리 편집 모달, 분리된 가상 포인트 사용 원장 모달을 실제로 확인했다.

## 별도 계획

- `docs/ai/features/2026-07-10-appwide-dense-line-field-rollout.md`는 앱 전역 입력 스타일을 위한 향후 계획이다. 이번 배포에는 부분 구현을 섞지 않는다.
- 쿠팡 Gmail 영수증 복구는 `docs/ai/features/2026-07-09-coupang-gmail-oauth-recovery.md`에 기록된 대로 완료 상태다.
