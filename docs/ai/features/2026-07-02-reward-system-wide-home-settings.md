# 보상형 홈 디자인 시스템 확장 및 산식 설정 계획

## 요청

- `오늘의 적립` 카드만 다크 보상 톤으로 바뀌어 홈의 다른 카드와 시각 시스템이 맞지 않는다.
- 다른 홈 카드의 폰트 시스템, 폰트 사이즈, 색상, 게이지 색상도 `오늘의 적립` 카드와 맞춘다.
- `오늘의 적립` 메커니즘을 사용자가 수정할 수 있도록 설정창을 만든다.
- 설정 대상은 산식, 적립 비율, 일 상한, 월 상한, 기준 기간 등이다.

## 현재 확인

- 운영 홈은 `오늘의 적립` 카드만 `#20262d` 차콜 배경과 `#f3b7c8` 핑크 진행바를 사용한다.
- `이번 2주 변동비`, `이번 달 고정비`, `Dev Ideas`는 여전히 흰 카드/보라 게이지/기존 폰트 체계를 사용한다.
- 설정 화면은 `render-settings.js`의 설정 탭에서 렌더링되고, 사용자 설정은 `data.js`의 `appSettings` Firestore 문서에 저장된다.
- `오늘의 적립` 계산은 `utils/reward-savings.js`에서 실시간 계산하며, 현재 기본값은 lookback 180일, allocation 30%, daily cap 10,000원, monthly cap 120,000원이다.

## 결정

1. 홈 첫 화면의 보상 관련 카드들을 하나의 `home-reward-system` 톤으로 묶는다.
   - `오늘의 적립`
   - `이번 2주 변동비`
   - `이번 달 고정비`
   - `Dev Ideas`

2. 단순 색 덮어쓰기보다 토큰을 먼저 만든다.
   - `--reward-card-bg: #20262d`
   - `--reward-card-text: #ffffff`
   - `--reward-card-muted: rgba(255,255,255,.76)`
   - `--reward-card-soft: rgba(255,255,255,.18)`
   - `--reward-card-line: rgba(255,255,255,.12)`
   - `--reward-card-fill: #f3b7c8`

3. 설정은 새 탭이 아니라 기존 `설정 > 화면 & 소계획` 아래에 `보상 적립` 섹션으로 둔다.
   - 활성화 토글
   - 최근 기준 기간: 90/180/365일
   - 적립 배분율: 10/20/30/40/50%
   - 일 상한: 숫자 입력
   - 월 상한: 숫자 입력
   - 기준선 방식: 주간 트림 평균 / 단순 일평균
   - 초기화 버튼

4. 계산 유틸은 설정을 옵션으로 받는다.
   - `rewardSavings.enabled === false`이면 홈 카드를 숨기거나 비활성 상태로 표시한다.
   - `lookbackDays`, `allocationRate`, `dailyPointCap`, `monthPointCap`, `baselineMethod`를 반영한다.

## 실행 슬라이스

### 슬라이스 1: 홈 카드 디자인 통합 + 보상 산식 설정

- 목표: 홈의 주요 카드 시각 시스템을 `오늘의 적립` 카드와 맞추고, 설정 탭에서 보상 산식을 저장/적용할 수 있게 한다.
- 예상 수정 파일:
  - `data.js`
  - `utils/reward-savings.js`
  - `render-report.js`
  - `render-settings.js`
  - `styles/60-urge.css`
  - `style.css`
  - `app.js`
  - `render-home.js`
  - `index.html`
- 수정하지 말 것:
  - 포인트 차감 장부
  - OS 홈스크린 위젯
  - 와인 구매 자동 차감
  - 카테고리 구조 변경
- 검증:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - 운영 홈에서 `오늘의 적립`, `이번 2주 변동비`, `이번 달 고정비`, `Dev Ideas`가 같은 차콜/화이트/핑크 시스템으로 보인다.
  - 설정에서 배분율/상한/기준기간을 저장하면 홈 `포인트` 값과 진행바가 바뀐다.
  - 설정에서 보상 적립을 끄면 홈 보상 카드가 비활성/숨김 상태가 된다.

## 다음 액션

- 이 계획의 슬라이스 1을 clean worktree에서 실행한다.
- 실행 후 바로 리뷰 문서를 남기고 GitHub Pages 운영 배포까지 확인한다.
