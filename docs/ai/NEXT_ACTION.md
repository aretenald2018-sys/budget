# 다음 자동 액션

## 2026-07-11 Budget Boundary Release

- 상태: `ready_for_deploy`
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
- 남은 단계:
  - 최신 `main` 위 커밋을 push한다.
  - `Deploy GitHub Pages` workflow 성공과 production UI에서 러닝 탭 제거·설정 카드·포인트 사용 흐름을 확인한다.

## 별도 계획

- `docs/ai/features/2026-07-10-appwide-dense-line-field-rollout.md`는 앱 전역 입력 스타일을 위한 향후 계획이다. 이번 배포에는 부분 구현을 섞지 않는다.
- 쿠팡 Gmail 영수증 복구는 `docs/ai/features/2026-07-09-coupang-gmail-oauth-recovery.md`에 기록된 대로 완료 상태다.
