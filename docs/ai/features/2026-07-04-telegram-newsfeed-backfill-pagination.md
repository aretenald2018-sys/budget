# Telegram 뉴스피드 6월 1일 누적 수집과 페이지네이션 계획

## 요청 원문

`6월 1일부터 뉴스피드를 수집해서 스택해두고, 페이지네이션도 해둘 것.`

## 현재 상태

- 공개 `t.me/s/<handle>` preview가 확인된 73개 source는 이미 `utils/telegram-sources.js`에 등록되어 있다.
- 운영 앱에는 `뉴스피드` 탭, 공개 `뉴스 보기` 진입, 2분 자동 재조회, GitHub Actions 15분 수집 job이 있다.
- Firestore 쓰기는 현재 quota 초과로 실패한 이력이 있어, 운영 표시는 `public/newsfeed/telegram-public-feed.json` 정적 snapshot fallback에 의존한다.
- 현재 정적 snapshot은 최신 240개 item 중심이다. `scripts/telegram-feed-static.mjs`는 이전 snapshot과 새 fetch 결과를 누적 병합하지 않고, 최신 공개 preview 한 페이지만 읽는다.
- 현재 UI는 한 번에 최대 180개를 렌더링하고 페이지네이션이 없다.

## 그릴 결과

- 핵심 질문:
  - "6월 1일부터"의 기준 시각을 어떻게 잡을 것인가?
- 추천 답변:
  - 한국 시간 기준 `2026-06-01T00:00:00+09:00` 이후 게시글을 포함한다.
- 결정:
  - 위 기준을 기본값으로 사용한다. 내부 UTC cutoff는 `2026-05-31T15:00:00.000Z`다.
  - 확인 필요/로그인 필요 source는 계속 제외한다.
  - Telegram 개인 계정 로그인, MTProto session, Bot token 방식은 이 계획 범위가 아니다.
  - 공개 preview 방식에는 webhook이 없으므로 true realtime은 불가능하다. 기존처럼 GitHub Actions 15분 polling + Pages 배포 + 열린 탭 2분 재조회가 최신화 경계다.
  - Firestore quota가 회복되더라도 정적 snapshot fallback은 6월 1일 이후 누적 데이터의 1차 운영 경로로 유지한다.
- 코드/외부 확인:
  - `https://t.me/s/report_figure_by_offset` 최신 페이지에서 message id `11028..11047`, `2026-07-03T05:03:33Z..2026-07-04T03:01:00Z` 범위를 확인했다.
  - `https://t.me/s/report_figure_by_offset?before=11028`에서 이전 페이지 `11008..11025`, `2026-07-02T06:10:18Z..2026-07-03T04:33:55Z` 범위를 확인했다.
  - 같은 source를 `2026-06-01T00:00:00+09:00`까지 탐색하면 약 45페이지, 554개 메시지가 필요했다.
- 남은 가정:
  - Telegram 공개 preview HTML과 `before` pagination 동작이 현재 구조를 유지한다.
  - 73개 source 전체 backfill은 최초 1회 또는 수동 workflow에서 수행하고, 15분 schedule은 이후 증분 수집만 수행한다.

## 결정 기록

- 결정: 공개 preview `?before=<messageId>` pagination으로 6월 1일 이후 메시지를 backfill한다.
- 이유: Telegram secret 없이 현재 source 목록을 읽을 수 있고, 실제 페이지 탐색이 확인됐다.
- 되돌릴 수 있는가: 가능. 수집 item id는 기존 `telegram_public_${sourceId}_${messageId}`를 유지하므로 저장소와 UI는 Bot API/MTProto/Android 수집 경로로도 재사용 가능하다.

- 결정: 정적 snapshot을 최신 240개가 아니라 "cutoff 이후 누적 stack"으로 바꾼다.
- 이유: Firestore quota 실패 상태에서도 운영 뉴스피드가 6월 1일부터의 기록을 보여야 한다.
- 되돌릴 수 있는가: 가능. snapshot metadata에 `since`, `truncated`, `pagesFetched`를 남기고, 필요하면 이후 shard 방식으로 분리할 수 있다.

- 결정: UI 페이지네이션은 `더 보기` 방식으로 시작한다.
- 이유: 기존 뉴스피드 UX와 모바일 하단 nav 구조를 크게 흔들지 않고, 열린 탭 2분 refresh와 충돌이 적다.
- 되돌릴 수 있는가: 가능. cursor API를 유지하면 나중에 무한 스크롤이나 날짜 점프 UI로 바꿀 수 있다.

## 실행 슬라이스

### 슬라이스 1: 6월 1일 이후 누적 수집과 페이지네이션

- 목표:
  - 공개 Telegram preview에서 `2026-06-01T00:00:00+09:00` 이후 게시글을 source별로 backfill/누적 저장한다.
  - 운영 뉴스피드에서 첫 page 이후 항목을 `더 보기`로 탐색할 수 있게 한다.
- 범위:
  - `api/_lib/telegram-public-feed.js`
    - `before` message id 기반 page fetch를 추가한다.
    - `since`, `maxPages`, `maxMessagesPerPage`, `backfill` 옵션을 추가한다.
    - `postedAt < since`인 page에 도달하면 source 탐색을 중단한다.
    - source별 `pagesFetched`, `oldestMessageId`, `oldestPostedAt`, `backfillComplete` 상태를 남긴다.
  - `scripts/telegram-feed-sync.mjs`
    - `--since=2026-06-01`, `--max-pages=N`, `--backfill` 인자를 추가한다.
    - dry-run에서 source별 page 수와 cutoff 도달 여부를 출력한다.
    - 15분 schedule 기본 실행은 증분 수집으로 유지하고, 수동 workflow에서만 backfill 옵션을 켠다.
  - `scripts/telegram-feed-static.mjs`
    - 기존 snapshot item과 새 fetch item을 stable id로 병합한다.
    - `since` 이후 item만 유지한다.
    - 최신 240개 cap을 제거하고 cutoff 이후 stack을 저장한다.
    - repo 크기 보호용 hard limit에 닿으면 `truncated: true`와 경고를 남긴다.
  - `.github/workflows/budget-backend.yml`
    - `workflow_dispatch.inputs.since`를 Telegram job에도 전달한다.
    - backfill 수동 실행에 필요한 env를 추가한다.
    - schedule job은 기존 15분 증분 수집으로 유지한다.
  - `data.js`
    - `listNewsfeedItems`가 page size와 cursor/offset을 받아 `{ items, nextCursor, hasMore }` 형태를 지원하게 한다.
    - 기존 caller 호환을 깨지 않도록 배열 반환 경로 또는 wrapper를 유지한다.
    - Firestore 경로와 정적 snapshot fallback 모두 같은 페이지네이션 계약을 따른다.
  - `render-newsfeed.js`
    - 첫 page는 기존처럼 최신순으로 보여준다.
    - `더 보기` 버튼으로 다음 page를 append한다.
    - category filter 변경 시 page state를 reset한다.
    - 열린 탭 자동 refresh 시 첫 page를 새로 읽되, 사용자가 펼친 page가 있으면 현재 항목을 무리하게 접지 않는다.
  - `styles/80-newsfeed.css`
    - `더 보기` 버튼과 loading/disabled 상태를 추가한다.
  - `scripts/verify-project.mjs`
    - 새 pagination 계약, script 인자, workflow env, cache-bust를 확인한다.
  - cache-busting query string을 갱신한다.
- 예상 수정 파일:
  - `.github/workflows/budget-backend.yml`
  - `api/_lib/telegram-public-feed.js`
  - `data.js`
  - `index.html`
  - `app.js`
  - `render-newsfeed.js`
  - `scripts/telegram-feed-sync.mjs`
  - `scripts/telegram-feed-static.mjs`
  - `scripts/verify-project.mjs`
  - `styles/80-newsfeed.css`
  - `public/newsfeed/telegram-public-feed.json`
  - `docs/ai/executions/2026-07-04-telegram-newsfeed-backfill-pagination.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 확인 필요/로그인 필요 source 추가.
  - Telegram Chrome 로그인 자동화.
  - MTProto user client/session.
  - Telegram Bot API token 전환.
  - Android Telegram notification capture.
  - 뉴스 메시지의 거래 자동 변환.
  - Firestore quota 문제를 우회하기 위한 secret/계정 변경.
- 구현 메모:
  - 기본 cutoff는 `2026-06-01`로 두되 script/env에서 override 가능하게 한다.
  - source별 backfill은 네트워크 시간이 길 수 있으므로 concurrency와 `maxPages`를 제한 가능하게 둔다.
  - 기존 `latestMessageId` 기반 증분 dedupe는 유지한다.
  - 정적 snapshot은 `generatedAt`, `since`, `sourceCount`, `fetched`, `items`, `truncated`, `pagesFetched`를 포함한다.
  - 페이지네이션 cursor는 날짜 단독보다 `postedAt + sourceId + messageId` 조합이 안정적이다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; node scripts/telegram-feed-static.mjs --only-sources=report-gallery --since=2026-06-01 --max-pages=60 --out tmp/telegram-backfill-report-gallery.json`
  - 결과 JSON에서 oldest item이 `2026-06-01T00:00:00+09:00` 이후이고, item 수가 기존 240 cap을 넘을 수 있음을 확인한다.
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; node scripts/telegram-feed-sync.mjs --dry-run --only-sources=report-gallery --since=2026-06-01 --max-pages=60 --backfill`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - production 배포 후 `https://aretenald2018-sys.github.io/budget/public/newsfeed/telegram-public-feed.json` HTTP 200, `since`, `items.length`, `truncated=false` 또는 경고 metadata를 확인한다.
  - production `https://aretenald2018-sys.github.io/budget/`의 공개 `뉴스 보기`에서 첫 page가 보이고, `더 보기` 클릭 후 다음 page가 append되는지 확인한다.
  - category filter를 바꾼 뒤 다시 첫 page부터 표시되는지 확인한다.
- 완료 증거:
  - 6월 1일 이후 공개 preview 메시지가 최신 240개 cap 없이 snapshot에 누적된다.
  - 첫 page 이후 item을 UI에서 탐색할 수 있다.
  - 15분 schedule은 증분 수집으로 유지되고, backfill은 수동 workflow/script로 실행 가능하다.
  - browser bundle에 Telegram secret이 추가되지 않는다.

### 슬라이스 2: 리뷰

- 목표:
  - 누적 수집과 페이지네이션이 기존 운영 경계, 보안 경계, production 검증 기준을 지켰는지 리뷰한다.
- 범위:
  - 계획 문서와 변경 파일 대조.
  - Telegram secret 미노출 확인.
  - 정적 snapshot 크기, cutoff 필터, duplicate 방지, pagination cursor 안정성 확인.
  - workflow schedule이 무거운 backfill을 반복하지 않는지 확인.
  - production UI에서 첫 page/더 보기/category reset/자동 refresh를 확인한다.
- 예상 수정 파일:
  - `docs/ai/reviews/2026-07-04-telegram-newsfeed-backfill-pagination-review.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 새 source 추가.
  - 새 UI 기능 추가.
  - 수집 방식 전환.
- 검증 방법:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - GitHub Pages workflow 성공 확인.
  - production UI 실제 흐름 확인.
- 완료 증거:
  - 문제가 없으면 `NEXT_ACTION.md` 상태를 `complete`로 둔다.
  - 문제가 있으면 focused fix 범위와 재현/검증 방법을 남긴다.

## 다음 세션 시작 프롬프트

이 계획의 슬라이스 1 `6월 1일 이후 누적 수집과 페이지네이션`만 실행한다. 확인 필요/로그인 필요 source, Telegram Chrome 로그인, MTProto, Bot API 전환, Android notification capture는 구현하지 않는다.
