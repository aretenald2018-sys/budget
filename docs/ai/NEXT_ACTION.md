# 다음 자동 액션

## 2026-07-12 앱 전체 리팩토링 계획

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-12-appwide-refactor-plan.md`
- 권장 시작점: 슬라이스 0 — 안전망과 기준선 분리
- 다음 액션: 계획 승인 후 `verify-project` 책임 분리, Node test 기반과 금융/Android 계약 fixture를 먼저 추가한다.
- 차단 질문: 권장 순서대로 슬라이스 0부터 실행할지, 특정 영역을 먼저 진행할지 선택한다.

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
