# 보상형 홈 디자인 시스템 확장 및 산식 설정 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-reward-system-wide-home-settings.md`
- 실행 슬라이스: `홈 카드 디자인 통합 + 보상 산식 설정`
- 실행 일시: 2026-07-02 KST

## 구현

- 홈 카드 디자인 시스템 확장
  - `--reward-card-*` 토큰을 만들고 `오늘의 적립`, `이번 2주 변동비`, `이번 달 고정비`, `Dev Ideas`에 공통 적용했다.
  - 홈 변동비 게이지 색상을 기존 보라 그라데이션에서 `#f3b7c8` 계열 포인트 색으로 맞췄다.
  - 홈 주요 카드의 배경, 텍스트, 보조 텍스트, 구분선, 상태 pill을 차콜/화이트 시스템으로 맞췄다.

- 보상 적립 설정
  - `appSettings.rewardSavings`를 추가했다.
  - 설정 탭 `화면 & 소계획` 아래에 `보상 적립` 폼을 추가했다.
  - 설정 항목: 활성화, 기준 기간, 기준선 방식, 적립 배분율, 일 상한, 월 상한, 초기화.
  - 저장 후 현재 탭을 새로고침해 홈 계산이 즉시 반영되게 했다.

- 계산 반영
  - `utils/reward-savings.js`가 `enabled`, `lookbackDays`, `allocationRate`, `dailyPointCap`, `monthPointCap`, `baselineMethod`를 받도록 했다.
  - `baselineMethod`는 `trimmed_weekly`와 `simple_daily`를 지원한다.

- 캐시 일관성
  - `data.js`를 import하는 화면 모듈의 query string을 `20260702-reward-settings-system`으로 통일했다.

## 검증

- `npm.cmd run verify`
  - 통과: `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` artifact 생성 완료.
- 산식 샘플 검산
  - 기본 설정에서 `todaySaved=10238`, `todayPoints=3071`, `monthPoints=3071`.
- `_site` 확인
  - `보상 적립`, `reward-settings-form`, `#tab-home .fixed-cost-panel`, `#tab-home .dev-idea-card`, `--reward-card-fill` 반영 확인.

## 남은 확인

- GitHub Pages 배포 후 운영 URL에서 홈 카드 스타일과 설정 저장 흐름을 직접 확인한다.
