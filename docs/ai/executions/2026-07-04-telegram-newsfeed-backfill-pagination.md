# Telegram 뉴스피드 6월 1일 누적 수집과 페이지네이션 실행 기록

## 실행 범위

- 계획 문서: `docs/ai/features/2026-07-04-telegram-newsfeed-backfill-pagination.md`
- 실행 슬라이스: `슬라이스 1: 6월 1일 이후 누적 수집과 페이지네이션`
- 기준 시각: `2026-06-01T00:00:00+09:00`

## 구현 내용

- `api/_lib/telegram-public-feed.js`
  - 공개 preview `?before=<messageId>` pagination을 추가했다.
  - `since`, `maxPages`, `maxMessagesPerPage`, `backfill` 옵션을 추가했다.
  - source별 `pagesFetched`, `oldestMessageId`, `oldestPostedAt`, `backfillComplete`를 요약에 포함했다.
  - top-level `js-widget_message`만 message block으로 인식하도록 parser를 고쳤다. 기존 splitter는 내부 `tgme_widget_message_text/footer`에서 block을 잘라 게시 시각이 누락됐다.
  - `data-view`는 게시 시각이 아니라 preview metadata라 cutoff 판단에서 제외했다.
- `scripts/telegram-feed-sync.mjs`
  - `--since`, `--max-pages`, `--max-messages-per-page`, `--backfill` 인자를 추가했다.
- `scripts/telegram-feed-static.mjs`
  - 기존 snapshot item과 새 fetch item을 stable id로 병합한다.
  - `since` 이전 item은 제거한다.
  - 최신 240개 cap을 제거하고 `itemLimit` hard limit로 교체했다.
  - snapshot metadata에 `since`, `itemLimit`, `truncated`, `pagesFetched`, `backfillComplete`를 기록한다.
  - 선택된 공개 source에 없는 이전 item은 snapshot에서 제거한다.
- `.github/workflows/budget-backend.yml`
  - Telegram job에 `TELEGRAM_PUBLIC_SINCE`, `TELEGRAM_PUBLIC_MAX_PAGES`, `TELEGRAM_STATIC_ITEM_LIMIT`을 추가했다.
  - schedule은 `maxPages=1`로 유지하고, 수동 `backfill` 입력에서만 deep pagination을 수행한다.
- `data.js`
  - 기존 배열 반환 호환을 유지하면서 `page: true` 요청에 `{ items, nextCursor, hasMore, total }`을 반환하도록 했다.
  - Firestore와 static fallback 모두 같은 페이지 계약을 쓴다.
  - production UI 확인 중 Firestore `newsfeed_items`가 빈 결과를 정상 응답하면 static fallback을 타지 않는 문제가 확인되어, 빈 첫 page 또는 static offset cursor 요청은 정적 snapshot으로 fallback하도록 보정했다.
  - Firestore status 문서보다 정적 snapshot `itemCount`가 더 크면 뉴스피드 헤더도 정적 metadata를 사용하도록 보정했다.
- `render-newsfeed.js`, `styles/80-newsfeed.css`
  - 첫 page 60건 렌더링과 `더 보기` append pagination을 추가했다.
  - 카테고리 변경 시 page state를 reset한다.
  - 자동 refresh는 새 첫 page를 병합하되 사용자가 펼친 item 수를 유지한다.
- cache-bust
  - `data.js`, `render-newsfeed.js`, `style.css`, `index.html` 버전을 `20260704-newsfeed-backfill-pagination-v2`로 갱신했다.
- source 제외
  - 현재 공개 preview에 message block이 없는 `doc_pool`, `mistergray_11`은 기본 source에서 제외했다.
  - `TELEGRAM_PUBLIC_SOURCE_VERSION`을 `20260704-public-preview-v2`로 갱신했다.

## 검증

- `node --check`
  - `api/_lib/telegram-public-feed.js`
  - `scripts/telegram-feed-sync.mjs`
  - `scripts/telegram-feed-static.mjs`
  - `render-newsfeed.js`
  - `data.js`
  - `app.js`
- parser runtime check
  - `report-gallery` 최신 preview에서 `11028`의 `postedAt`이 `2026-07-03T05:03:33.000Z`로 파싱됨을 확인했다.
- backfill dry-run
  - `node scripts/telegram-feed-sync.mjs --dry-run --only-sources=report-gallery --since=2026-06-01 --max-pages=60 --backfill`
  - 결과: `fetched=553`, `pagesFetched=45`, `oldestMessageId=10113`, `backfillComplete=true`, `failed=0`.
- static one-source backfill
  - `node scripts/telegram-feed-static.mjs --only-sources=report-gallery --since=2026-06-01 --max-pages=60 --out=tmp/telegram-backfill-report-gallery-clean.json`
  - 결과: `items=553`, `truncated=false`, `pagesFetched=45`, `backfillComplete=true`, oldest `2026-06-01T05:35:08.000Z`.
  - 검증 후 tmp 파일은 삭제했다.
- full static snapshot
  - `node scripts/telegram-feed-static.mjs --since=2026-06-01 --max-pages=180 --item-limit=60000`
  - 결과: sourceCount `71`, items `33084`, failed `0`, truncated `false`, pagesFetched `1834`, backfillComplete `true`.
  - snapshot oldest `2026-05-31T15:01:49.000Z`, olderThanCutoff `0`.
- project verification
  - `npm.cmd run verify`
  - 결과: `verify-project passed (92 JS files checked).`
- Pages build
  - `npm.cmd run pages:build`
  - 결과: `_site` artifact 생성 성공.
- production deploy 1차 확인
  - GitHub Pages workflow와 Validate workflow는 성공했다.
  - `https://aretenald2018-sys.github.io/budget/public/newsfeed/telegram-public-feed.json?qa=be1af75` HTTP 200.
  - metadata: sourceCount `71`, items `33084`, `truncated=false`, `backfillComplete=true`.
  - production UI에서 Firestore 빈 결과 때문에 뉴스피드가 0건으로 표시되는 문제가 확인되어 fallback 보정 fix를 추가했다.

## 아직 필요한 리뷰/검증

- fallback 보정 fix 배포 후 `https://aretenald2018-sys.github.io/budget/`에서 공개 `뉴스 보기` 진입, 첫 page, `더 보기`, category reset을 실제 UI로 확인해야 한다.
