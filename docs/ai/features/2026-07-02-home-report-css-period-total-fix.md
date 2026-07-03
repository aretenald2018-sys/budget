# 홈 리포트 CSS 및 기간 금액 기준 수정 계획

## 요청

- 홈 hero 카드의 `고정비 제외 조절비` 보조 게이지에서 금액 폰트/줄바꿈이 깨지는 문제를 수정한다.
- 홈의 `이번 2주`와 `이번 달` 금액 기준이 달라 보이는 문제를 수정한다.
- 카테고리 상세 시트의 거래 행과 `환급처리` 체크 영역이 기본 HTML처럼 보이는 CSS 회귀를 수정한다.

## 진단 결과

- `render-report.js`는 홈 화면도 리포트 렌더러를 재사용한다.
- 현재 `이번 2주` 모드는 `controlCategories`만 합산하지만, `이번 달` 모드는 `budgetCategories` 전체를 합산한다. 그래서 고정비인 `교통비용 110,000원`이 월간 hero 헤드라인에는 포함되고, `고정비 제외 조절비` 보조 게이지에는 제외되어 스크린샷처럼 `376,890원`과 `266,890원`이 동시에 보인다.
- `heroSecondaryProgress()`의 `.report-hero-secondary-head` 전용 CSS가 없어 긴 금액 문자열이 모바일 폭에서 `원` 단위까지 어색하게 줄바꿈된다.
- `render-report.js`의 카테고리 상세 모달은 `.report-tx-row`, `.report-tx-open`, `.report-refund-check`를 렌더링하지만, 해당 클래스의 행/체크 UI CSS가 부족해 거래 행과 환급 체크박스가 원시 컨트롤처럼 보인다.
- repo root에 `sw.js`가 없어 `STATIC_ASSETS`/`CACHE_VERSION` 갱신 대상은 없다.

## 실행 슬라이스 1

- 상태: 실행 완료
- 범위:
  - `render-report.js`
    - 홈 모드에서 `이번 달` hero 헤드라인도 고정비 제외 조절비 기준으로 계산한다.
    - 홈 월간 카드에서는 보조 게이지를 `이번 달 전체 지출`로 바꿔 고정비 포함 금액을 보조 정보로만 보여준다.
    - 리포트 탭의 월간 전체 지출 기준은 유지한다.
  - `styles/60-urge.css`
    - 홈 hero 보조 게이지의 라벨/금액 줄바꿈과 폭을 안정화한다.
  - `styles/20-records.css`
    - 카테고리 상세 시트의 거래 행, 금액, 아이콘, 환급 체크 UI를 앱 스타일로 복구한다.
  - `style.css`, `index.html`, `app.js`, `render-home.js`
    - 변경된 CSS/JS가 정적 호스팅에서 다시 로드되도록 cache-busting query를 갱신한다.

## 제외

- Firestore 데이터 수정.
- 카테고리 예산 금액/리듬 설정 변경.
- 리포트 탭 전체 월간 합계 정책 변경.
- 운영 배포 커밋/푸시가 안전하지 않은 경우 강제 배포.

## 검증

- `node --check render-report.js`
- `node --check render-home.js`
- `node --check app.js`
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 운영 배포 가능 시 `Deploy GitHub Pages` workflow 성공과 `https://aretenald2018-sys.github.io/budget/` HTTP 200/cache-bust 반영 확인.
- UI 확인 기준:
  - 홈 hero에서 `이번 2주`와 `이번 달` 모두 고정비 제외 조절비 기준으로 헤드라인 금액을 표시한다.
  - 월간 보조 게이지는 `이번 달 전체 지출`로 표시되어 고정비 포함 금액이 보조 정보임을 알 수 있다.
  - `교통비용` 같은 카테고리 상세 시트에서 거래 행과 `환급처리` 체크가 앱 스타일로 보이며 텍스트가 겹치지 않는다.

## 다음 실행 시작점

`render-report.js`, `styles/60-urge.css`, `styles/20-records.css`를 수정하고 관련 cache-busting query를 갱신한 뒤 정적 검증을 실행한다.

## 실행 결과

- 실행 문서: `docs/ai/executions/2026-07-02-home-report-css-period-total-fix.md`
- 홈 월간 hero 헤드라인은 고정비 제외 조절비 기준으로 맞췄다.
- 홈 월간 hero 보조 게이지는 `이번 달 전체 지출`로 바꿔 고정비 포함 금액을 보조 정보로 분리했다.
- 카테고리 상세 시트 거래 행과 `환급처리` 체크 UI CSS를 복구했다.
- 정적 검증과 Pages 빌드는 통과했다.
- 실제 로그인 UI와 운영 배포 확인은 not verified yet이다. 차단 사유는 작업트리에 무관한 dirty 변경이 다수 있어 안전한 커밋/푸시를 할 수 없기 때문이다.
