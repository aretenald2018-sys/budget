# 홈 이번 달 전환 및 월 MAX 게이지 깨짐 진단

## 증상

- 홈 화면에서 `이번 달` 버튼을 누르면 홈용 카드 대신 리포트 탭의 `지출 합계`, `장기 방향` 마크업이 홈 영역에 보인다.
- `월 MAX 게이지` 카드에서 오른쪽 금액/한도 텍스트와 퍼센트 텍스트가 카드 밖으로 밀려 잘린다.
- 리포트 탭으로 이동하면 월 이동 컨트롤만 보이고 본문이 로딩 스피너에 머무를 수 있다.

## 확인한 원인

- `reportViewMode()`가 공유 `STATE.rootSelector`/`STATE.homeMode`에 의존해 홈 버튼 클릭 시 리포트 모드 컨텍스트로 다시 렌더링될 수 있다.
- `renderReport()`가 홈과 리포트 양쪽에 동일한 `id="report-body"`를 만들고, 전역 `$('#report-body')`로 본문을 채운다. 홈이 먼저 렌더된 상태에서 리포트 탭을 렌더하면 홈의 본문이 다시 채워지고 리포트 탭의 본문은 스피너로 남을 수 있다.
- `styles/20-records.css`의 기존 `.budget-gauge-row.actionable { width: 100%; }`가 남아 있고, `styles/60-urge.css`의 월 MAX 게이지 행은 좌우 margin을 가진다.
- 결과적으로 행 폭이 `카드 폭 100% + 좌우 margin`으로 계산되어 오른쪽 금액/게이지 메타가 카드 밖으로 밀리고, 카드의 `overflow:hidden` 때문에 잘린다.

## 수정 방향

- 홈의 기간 버튼은 명시적으로 `#tab-home`, `homeMode=true`를 전달한다.
- 리포트 탭 기간 버튼은 명시적으로 `#tab-report`, `homeMode=false`를 전달한다.
- `report-body`는 중복 id 대신 class/data 속성으로 만들고, 본문 채우기는 현재 `root` 안의 body만 대상으로 한다.
- 월 MAX 게이지 행은 `width:auto`, `box-sizing:border-box`, `min-width:0`로 폭 계산을 고정한다.
- 데이터 집계와 카테고리 예산 산식은 변경하지 않는다.
