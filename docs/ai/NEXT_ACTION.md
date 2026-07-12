# 다음 자동 액션

## 2026-07-12 앱 전체 리팩토링 계획

- 상태: `complete` (비-E2E 검증 범위)
- 계획 문서: `docs/ai/features/2026-07-12-appwide-refactor-plan.md`
- 교정: 이전 전체 완료 표기는 무효화했다. 삭제된 욕구·마인드뱅크·와인 셀러 잔재, 대형 renderer의 혼합 책임, 분산 cache query를 추가로 제거했다.
- 완료: 현재 화면의 renderer/state/controller 경계, 앱 background sync 경계, `release.json` 기반 Pages release stamping을 완료했다.
- 최종 리뷰: `docs/ai/reviews/2026-07-12-appwide-refactor-corrected-audit.md`
- 검증: `npm.cmd test` 66/66, `npm.cmd run verify` 176 files, `npm.cmd run pages:build`, `git diff --check` 통과.
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
