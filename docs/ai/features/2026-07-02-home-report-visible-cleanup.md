# 홈/거래 상단 UI 정리 및 보조 금액 폰트 수정 계획

## 요청

- 스크린샷에서 X 표시된 항목을 제거한다.
  - 홈 상단 기간 이동 카드
  - 홈 `관리 카테고리` 섹션
  - 거래 탭 hero의 `자동 분류 정상` 배지
- 스크린샷에서 동그라미 표시된 홈 hero 보조 금액 줄의 폰트/줄바꿈을 다시 고친다.

## 진단 결과

- 진단 문서: `docs/ai/diagnoses/2026-07-02-home-report-visible-cleanup.md`
- 홈은 `renderReport({ homeMode: true })`를 재사용하므로 홈 전용 렌더 분기가 필요하다.
- 거래 탭의 정상 배지는 `render-tx.js`의 hero HTML에서 조건부로 직접 출력된다.
- 보조 금액 줄은 현재 `flex-wrap` 기반이라 모바일 폭에서 라벨/금액 배치가 흔들릴 수 있다.
- repo root에 `sw.js` 또는 `STATIC_ASSETS`/`CACHE_VERSION` 정의는 검색되지 않아 서비스워커 cache bump 대상은 없다.

## 실행 슬라이스 1 - 보이는 회귀만 정리

### 목표

- 홈 모드에서는 월/2주 이동 카드가 렌더링되지 않는다.
- 홈 모드에서는 `관리 카테고리` 섹션이 렌더링되지 않는다.
- 거래 탭에서 검토 대상이 없으면 `자동 분류 정상` 배지를 렌더링하지 않는다.
- 홈 hero 보조 금액은 `고정비 제외 조절비` 라벨과 금액이 카드 안에서 안정적으로 보이며 `원`만 떨어지지 않는다.
- 변경된 CSS/JS 경로의 cache-busting query를 갱신한다.

### 예상 변경 파일

- `render-report.js`
- `render-tx.js`
- `styles/60-urge.css`
- `style.css`
- `render-home.js`
- `app.js`
- `index.html`
- `docs/ai/NEXT_ACTION.md`

### 제외

- 예산/거래 데이터 변경
- 카테고리 구성 변경
- 거래 상세 모달 변경
- 운영 배포 강제 수행

## 검증 계획

- `node --check render-report.js`
- `node --check render-tx.js`
- `node --check render-home.js`
- `node --check app.js`
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- `_site` 아티팩트에서 새 cache-bust와 제거 대상 문자열을 확인한다.
- 운영 배포 가능 시 `https://aretenald2018-sys.github.io/budget/`에서 홈/거래 탭 UI를 확인한다.

## 다음 실행 시작점

`render-report.js`, `render-tx.js`, `styles/60-urge.css`만 기능적으로 수정하고, 관련 cache-busting query를 새 값으로 맞춘다.

## 실행 결과

- 상태: 실행/리뷰 완료
- 실행 문서: `docs/ai/executions/2026-07-02-home-report-visible-cleanup.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-02-home-report-visible-cleanup-review.md`
- 홈 모드에서는 기간 이동 카드와 `관리 카테고리` 섹션을 렌더링하지 않는다.
- 거래 탭에서는 검토 대상이 없을 때 `자동 분류 정상` 배지를 렌더링하지 않는다.
- 홈 hero 보조 금액은 라벨/금액 구조를 분리하고 금액 내부 줄바꿈을 막았다.
- `node --check`, `npm.cmd run verify`, `npm.cmd run pages:build`, `_site` 문자열 확인은 통과했다.
- 운영 Pages 배포 완료: commit `64232a8`, `Deploy GitHub Pages` run `28569569242` 성공.
- production HTTP 확인 완료: `/budget/`, `app.js`, `render-report.js`, `render-tx.js`, `styles/60-urge.css` 모두 `200`; 새 cache-bust 반영; 제거 대상 문자열 없음.
