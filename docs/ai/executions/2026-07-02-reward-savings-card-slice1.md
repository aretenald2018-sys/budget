# 보상형 절약 적립 슬라이스 1 실행 기록

## 기준 계획

- 계획 문서: `docs/ai/features/2026-07-02-reward-savings-rebrand-real-home.md`
- 실행 슬라이스: `계산 뷰모델과 오늘의 적립 카드`
- 실행 일시: 2026-07-02 KST

## 구현 범위

- `utils/reward-savings.js`
  - 최근 180일 조절비성 거래를 기준으로 일평균 기준선을 계산한다.
  - 오늘 실제 소비가 기준선보다 낮으면 `todaySaved`를 만든다.
  - 절약액의 기본 30%를 `포인트`로 적립하고, 일 상한 10,000원과 월 상한 120,000원을 적용한다.
  - 월 누적 포인트와 월 예상 포인트를 계산한다.

- `render-report.js`
  - 홈 모드에서만 최근 190일 거래를 추가 로드한다.
  - `isBudgetExcluded(tx)` 거래는 포인트 계산에서 제외한다.
  - 홈 히어로 바로 아래에 `오늘의 적립` 카드를 추가한다.
  - 카드 안에서 적립액, 오늘 소비, 평소 기준선, 월 포인트 진행률을 함께 보여준다.
  - 사용자 표시명은 `포인트`로 통일한다.

- `styles/60-urge.css`
  - 사용자가 전달한 이미지 목업의 어두운 카드 톤을 `home-reward-card`에 적용했다.
  - 차콜 배경, 흰 텍스트, 분홍 진행바, 둥근 카드 반경을 사용한다.

- `index.html`, `app.js`, `render-home.js`, `style.css`
  - CSS/JS 캐시 버스트를 `20260702-reward-savings-card`로 갱신했다.

- `docs/ai/features/2026-07-02-reward-savings-rebrand-real-home.md`
  - 포인트 관련 명칭을 `points`, `point_wallet` 기준으로 정리했다.
  - 실제 와인 구매 카테고리인 `와인/야식`은 기존 거래 분류로 남긴다.

## 하지 않은 것

- 홈 히어로 문구를 `이번 2주 적립`으로 전면 교체하지 않았다.
- 포인트 차감 장부, 와인 구매 차감 흐름, OS 홈스크린 위젯은 구현하지 않았다.
- 운영 배포를 수행하지 않았다.

## 검증

- `npm.cmd run verify`
  - 통과: `verify-project passed (96 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` GitHub Pages artifact 생성 완료.
- 산식 샘플 검산
  - 기준선 35,238원, 오늘 소비 25,000원일 때 `todaySaved=10,238`, `todayPoints=3,071`로 계산됨.
- 빌드 산출물 확인
  - `_site/index.html`, `_site/app.js`, `_site/render-home.js`, `_site/render-report.js`, `_site/style.css`에 새 캐시 문자열 `20260702-reward-savings-card` 반영 확인.
  - `_site/render-report.js`에 `오늘의 적립`, `포인트`, `home-reward-card` 반영 확인.
- 서비스워커
  - repo root에 `sw.js`/`STATIC_ASSETS` 정의가 없어 `CACHE_VERSION` 갱신 대상 없음.

## not verified yet

- 해결: dirty worktree를 그대로 배포하지 않고 별도 clean worktree `budgetproject-reward-deploy`에서 카드 변경만 커밋했다.
- 커밋: `2d6df1f Add reward savings card`
- 배포: `git push origin HEAD:main`
- Pages workflow: `Deploy GitHub Pages` run `28574659899` 성공.
- 운영 URL 확인: `https://aretenald2018-sys.github.io/budget/`
- 운영 UI 상태: `오늘의 적립` 카드와 `포인트` 진행바가 홈 히어로 아래에 표시됨.
- 카드 스타일 확인: 배경 `rgb(32, 38, 45)`, 진행바 `rgb(243, 183, 200)`, radius `20px`.
