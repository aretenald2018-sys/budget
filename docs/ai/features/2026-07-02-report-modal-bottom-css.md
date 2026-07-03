# 리포트 카테고리 모달 하단 CSS 복구 계획

## 요청

- `생활비용` 카테고리 드릴다운 모달 하단부 CSS를 예전처럼 복구한다.
- 사용자 제공 스크린샷 기준으로 거래 목록과 `환급처리` 영역의 디자인 깨짐을 고친다.

## 진단 결과

- 진단 문서: `docs/ai/diagnoses/2026-07-02-report-modal-bottom-css.md`
- 원인은 리포트 카테고리 모달 하단 CSS가 탭 삭제 전 스타일과 다르고, `20-records.css`/`style.css` cache-busting query가 최신 CSS 재요청을 보장하지 않는 것이다.

## 그릴 결과

- 핵심 질문: JS 렌더 구조까지 바꿀지, CSS만 복구할지?
- 결정: CSS와 cache-busting만 바꾼다.
- 이유: `render-report.js`의 마크업은 예전 스타일이 기대한 class 구조를 유지하고 있고, 증상은 하단부 시각 회귀다.
- 남은 가정: `환급처리` 체크 동작과 거래 상세 열기 동작은 유지한다.

## 실행 슬라이스 1 - 모달 하단 CSS 복구

### 목표

- `report-category-modal` 하단 요약/거래 행/환급 체크가 탭 삭제 전 디자인과 같은 형태로 보인다.
- 거래 버튼은 네이티브 버튼 테두리 없이 아이콘, 본문, 금액이 한 줄에 정렬된다.
- `환급처리`는 작은 pill 형태로 보이며 체크 상태는 primary 배경으로 구분된다.
- 모바일 캐시가 오래된 `20-records.css`를 계속 쓰지 않도록 query를 갱신한다.

### 예상 변경 파일

- `styles/20-records.css`
- `style.css`
- `index.html`
- `docs/ai/NEXT_ACTION.md`

### 범위 제외

- `render-report.js` 마크업/이벤트 변경
- 거래 상세 모달 변경
- 환급 상태 저장 로직 변경
- 운영 데이터/Firestore 변경

### 구현 메모

- `4d0e02f^:styles/30-cart-board.css`의 `.report-drill-summary`, `.report-tx-row`, `.report-tx-open`, `.report-tx-body`, `.report-refund-check` 스타일을 `styles/20-records.css`에 맞게 복구한다.
- 현재 추가된 custom checkbox와 32px 사각 아이콘 스타일은 예전 40px 원형 아이콘/pill 스타일로 되돌린다.
- `style.css`의 `20-records.css` import query와 `index.html`의 `style.css` query를 `20260702-report-modal-bottom-css`로 갱신한다.
- 현재 repo에는 `sw.js`가 없으므로 `STATIC_ASSETS`/`CACHE_VERSION` bump는 하지 않는다.

## 검증 계획

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 운영 배포 후 `https://aretenald2018-sys.github.io/budget/`에서 로그인 후 홈 리포트 카테고리 카드 또는 월간 리포트의 `생활비용` 카테고리를 열어 확인한다.
- 증명 기준:
  - 모달 하단 거래 행에 네이티브 버튼 테두리가 보이지 않는다.
  - 거래 아이콘이 40px 원형 배경으로 보인다.
  - `환급처리`가 작은 pill 형태로 오른쪽에 붙는다.
  - 체크 후 `환급예정` 상태가 primary 톤으로 보이고 목록이 다시 그려진다.

## 다음 실행 프롬프트

`docs/ai/features/2026-07-02-report-modal-bottom-css.md`의 실행 슬라이스 1만 구현한다. `styles/20-records.css`, `style.css`, `index.html`, `docs/ai/NEXT_ACTION.md`만 변경하고 JS 렌더/데이터 로직은 변경하지 않는다.

## 실행 결과

- 실행 문서: `docs/ai/executions/2026-07-02-report-modal-bottom-css.md`
- `styles/20-records.css`의 리포트 카테고리 모달 하단 요약/거래 행/환급 pill CSS를 이전 스타일 기준으로 복구했다.
- `style.css`와 `index.html`의 CSS cache-busting query를 `20260702-report-modal-bottom-css`로 갱신했다.
- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.
- not verified yet: 운영 배포와 운영 UI 클릭 검증은 현재 unrelated dirty worktree 때문에 수행하지 않았다.

## 리뷰 결과

- 리뷰 문서: `docs/ai/reviews/2026-07-02-report-modal-bottom-css-review.md`
- 코드 레벨 추가 수정 사항은 발견하지 못했다.
- not verified yet: 운영 배포와 운영 UI 클릭 검증은 현재 unrelated dirty/untracked worktree 때문에 수행하지 않았다.
