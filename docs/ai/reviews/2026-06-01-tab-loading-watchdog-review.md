# 탭 무한 로딩 방지 리뷰

## 리뷰 범위

- 계획 문서: `docs/ai/features/2026-06-01-tab-loading-watchdog.md`
- 변경 파일: `app.js`, `render-tx.js`, `index.html`
- 요청: Discord `devreq_discord_1510813727467765821`

## 발견 사항

- 남은 차단 이슈 없음.
- 리뷰 중 발견한 보강점: 최초 구현은 8초 지연 감시가 1회성이라, `renderReport()`/`renderTx()`처럼 렌더 중간에 새 스피너를 다시 만드는 탭에서는 뒤쪽 요청 지연을 놓칠 수 있었다. `app.js`의 감시를 렌더 완료 전까지 8초 간격으로 반복 확인하도록 수정했다.

## 검증

- `node --check app.js`: 통과
- `node --check render-tx.js`: 통과
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과 (`_site` Pages artifact 생성)
- `git diff --check`: 통과
- GitHub Pages workflow `26730316463`: 성공
- Validate workflow `26730316481`: 성공
- 배포본 `/budget/`, `app.js?v=20260601-loading-watchdog`, `render-tx.js?v=20260601-loading-watchdog`: HTTP 200
- 배포본 cache-bust: `index.html`의 `app.js?v=20260601-loading-watchdog`, `app.js`의 `render-tx.js?v=20260601-loading-watchdog` 확인

## 잔여 리스크

- 실제 로그인 세션에서 하단 탭을 눌러 Firestore 지연/실패 상황을 시각적으로 확인하는 검증은 not verified yet.
- 이번 슬라이스는 "스피너만 남는 UI"를 막는 작업이며, Firestore 쿼리 수/인덱스/데이터량 최적화는 별도 진단 대상이다.

## 결론

- 계획한 슬라이스 기준 구현은 리뷰 통과.
- 다음 단계는 변경분 커밋, GitHub Pages 배포, 배포본 HTTP 200 및 새 cache-bust 확인이다.
