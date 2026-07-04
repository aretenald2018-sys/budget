# Telegram 뉴스피드 6월 1일 누적 수집과 페이지네이션 리뷰

## 리뷰 범위

- 계획 문서: `docs/ai/features/2026-07-04-telegram-newsfeed-backfill-pagination.md`
- 실행 문서: `docs/ai/executions/2026-07-04-telegram-newsfeed-backfill-pagination.md`
- 실행 슬라이스: `슬라이스 1: 6월 1일 이후 누적 수집과 페이지네이션`

## 결론

- 결과: `PASS`
- 조건:
  - 로컬 정적 검증과 Pages artifact build는 통과했다.
  - 최종 완료 증거는 production deploy 후 GitHub Pages workflow 성공과 운영 UI 확인으로 보강한다.

## 목표 대조

- 6월 1일 이후 누적 수집
  - `api/_lib/telegram-public-feed.js`가 `since`, `maxPages`, `before` pagination, `backfill` 옵션을 지원한다.
  - `scripts/telegram-feed-static.mjs`가 기존 snapshot과 새 fetch 결과를 병합하고 cutoff 이전 item을 제거한다.
  - `public/newsfeed/telegram-public-feed.json`은 source 71개, item 33084개, `truncated=false`, `backfillComplete=true`로 생성됐다.
- 페이지네이션
  - `data.js`가 `page: true` 요청에 `{ items, nextCursor, hasMore, total }` 계약을 제공한다.
  - `render-newsfeed.js`가 첫 page 60건과 `더 보기` append를 구현한다.
  - category 변경 시 page state를 reset한다.
- 업데이트 경계
  - 기존 열린 탭 2분 refresh는 유지했다.
  - GitHub Actions schedule은 `maxPages=1` 증분 수집으로 유지하고, 수동 `backfill` 입력에서만 deep pagination을 수행한다.
- 제외 범위
  - 확인 필요/로그인 필요 source는 추가하지 않았다.
  - Telegram Chrome 로그인 자동화, MTProto session, Bot API 전환, Android notification capture는 구현하지 않았다.

## 보안 리뷰

- browser bundle에 Telegram secret, Bot token, MTProto session, 계정 쿠키를 추가하지 않았다.
- 수집 경로는 공개 `t.me/s/<handle>` preview HTML만 사용한다.
- 새 dependency는 추가하지 않았다.
- Firestore 쓰기 경계는 기존 `firebase-admin.js`/browser `data.js` 경계를 유지한다.

## 코드 품질 리뷰

- 기존 `listNewsfeedItems()` 배열 반환 호환을 유지해 기존 caller를 깨지 않는다.
- pagination cursor는 static fallback에서 offset, Firestore에서 postedAt cursor를 사용한다.
- parser는 top-level `js-widget_message`만 block으로 삼아 내부 message text/footer div에서 잘리는 문제를 제거했다.
- cache-bust query string과 verifier 기준을 함께 갱신했다.

## 검증 증거

- `node --check`
  - `api/_lib/telegram-public-feed.js`
  - `scripts/telegram-feed-sync.mjs`
  - `scripts/telegram-feed-static.mjs`
  - `render-newsfeed.js`
  - `data.js`
  - `app.js`
- backfill dry-run
  - `node scripts/telegram-feed-sync.mjs --dry-run --only-sources=report-gallery --since=2026-06-01 --max-pages=60 --backfill`
  - `fetched=553`, `pagesFetched=45`, `backfillComplete=true`, `failed=0`
- static snapshot generation
  - `node scripts/telegram-feed-static.mjs --since=2026-06-01 --max-pages=180 --item-limit=60000`
  - sourceCount `71`, items `33084`, failed `0`, truncated `false`, pagesFetched `1834`, backfillComplete `true`
- project verification
  - `npm.cmd run verify`
  - `verify-project passed (92 JS files checked).`
- Pages build
  - `npm.cmd run pages:build`
  - `_site` artifact 생성 성공
- git whitespace check
  - `git diff --check`
  - 통과

## 잔여 리스크

- 정적 snapshot이 약 56MB라 운영 브라우저 최초 로딩 비용이 크다. production UI 확인에서 체감 지연이 과하면 다음 슬라이스에서 날짜/source shard로 분리한다.
- Telegram 공개 preview HTML 구조가 바뀌면 parser가 영향을 받는다. verifier와 dry-run으로 조기 감지한다.

## production 확인 항목

- GitHub Pages workflow 성공.
- `https://aretenald2018-sys.github.io/budget/public/newsfeed/telegram-public-feed.json` HTTP 200.
- production static feed metadata:
  - sourceCount `71`
  - items `33084`
  - `truncated=false`
  - `backfillComplete=true`
- `https://aretenald2018-sys.github.io/budget/` 공개 `뉴스 보기`:
  - 첫 page 60건 표시
  - `더 보기` 클릭 후 다음 page append
  - category chip 변경 시 첫 page부터 다시 표시
  - 모바일 폭에서 텍스트와 버튼 겹침 없음
