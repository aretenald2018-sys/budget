# 다음 자동 액션

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-05-reward-widget-point-progress-label.md`
- 실행 문서: `docs/ai/executions/2026-07-05-reward-widget-point-progress-label.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-05-reward-widget-point-progress-label-review.md`
- 현재 단계: Android 위젯 포인트/퍼센트 표시 확대 구현, 검증, production 배포 완료
- 다음 액션:
  - 없음.

## 최근 처리한 요청

- 요청: Android `오늘의 적립` 위젯 row를 더 읽기 쉽게 키우고, 퍼센트 왼쪽에 누적 포인트를 표시. 사용자가 production에서 바뀐 게 없어 보인다고 후속 요청.
- 결과:
  - production old APK metadata 원인을 확인했다.
  - row value를 `5,500p/12%` 형식으로 변경했다.
  - 위젯 폰트를 키우되 150dp widget host에서 세 row가 모두 보이도록 조정했다.
  - Android APK를 `v2.1.4/15`로 bump했다.
  - `npm.cmd run apk:build`, `npm.cmd run verify`, `npm.cmd run pages:build`를 통과했다.
  - GitHub Pages workflow `28729363053`가 성공했다.
  - GitHub Pages production metadata가 `v2.1.4/15`로 바뀐 것을 확인했다.
  - production APK를 emulator에 설치해 위젯 hierarchy에서 `5,500p/12%`, `12,000p/24%`, `900p/3%`를 확인했다.

## 상태값

- `idle`: 진행 중인 자동 액션 없음
- `needs_user_decision`: 사용자 결정이 필요함
- `ready_for_execution`: 다음 실행 슬라이스를 바로 진행
- `ready_for_review`: 직전 실행 결과를 바로 리뷰
- `ready_for_fix`: 리뷰에서 발견된 문제만 바로 수정
- `complete`: 현재 계획 완료

## 자동 진행 규칙

- 세션 시작 시 이 파일을 먼저 읽는다.
- 사용자가 `계속`, `다음`, `진행`, `리뷰해`, `해줘`처럼 짧게 말하면 이 파일의 `다음 액션`을 실행한다.
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다.
