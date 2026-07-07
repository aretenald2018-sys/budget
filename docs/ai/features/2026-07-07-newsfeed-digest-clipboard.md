# 뉴스피드 다이제스트 클립보드 계획

## 요청 원문

`뉴스탭 상단에 수집된 데이터를 클립보드로 붙여넣을 수 있는 "다이제스트" 버튼을 만들어줘. 일일/주간메시지 전수를 클립보드에 담아줘. 목적은 챗지피티나 클로드에게 분석을 맡길 목적이야. 이를 위해서는 수집되는 데이터가 전수로 메시지랑 pdf파일 등이 인입되어야하는데 그렇게 되고있는지도 점검`

## 현재 상태 점검

- 뉴스탭 UI는 `render-newsfeed.js`에서 첫 page 60건을 렌더링하고 `더 보기`로 다음 page를 append한다.
- 브라우저 데이터 경계는 `data.js`의 `listNewsfeedItems()`와 `getTelegramPublicFeedStatus()`다.
- 정적 snapshot 경로는 `data.js`의 `STATIC_NEWSFEED_URL = './public/newsfeed/telegram-public-feed.json?v=20260704-newsfeed-backfill-pagination-v3'`다.
- 현재 checked-in snapshot `public/newsfeed/telegram-public-feed.json` 요약:
  - `generatedAt`: `2026-07-04T04:42:36.279Z`
  - `since`: `2026-05-31T15:00:00.000Z` (`2026-06-01T00:00:00+09:00`)
  - `sourceCount`: 71
  - `items.length`: 33084
  - `fetched`: 33067
  - `failed`: 0
  - `maxPages`: 180
  - `itemLimit`: 60000
  - `truncated`: false
  - `pagesFetched`: 1834
  - `backfillComplete`: true
  - attachment metadata counts: `image` 30275, `video` 660, `document` 448
  - 파일 크기: 56,306,565 bytes
- 위 값 기준으로 공개 Telegram preview에서 접근 가능한 메시지 본문은 최신 60건이 아니라 6월 1일 이후 snapshot 전수로 존재한다.
- 단, PDF/문서 파일 본문 전수 인입은 현재 안 된다.
  - `api/_lib/telegram-public-feed.js`의 `extractAttachments()`는 image URL, video type, document type만 뽑는다.
  - `scripts/telegram-feed-static.mjs`의 `stableStaticFeedItem()`은 attachment를 `{ type }`만 남기도록 축약한다.
  - 실제 public preview HTML sample은 document title/size(`7월3일_영남권_312조_투자정리.html`, `24.5 KB`)를 노출하지만, 직접 다운로드 가능한 파일 URL이나 파일 bytes/PDF text는 현재 저장하지 않는다.
  - 따라서 ChatGPT/Claude 분석용 digest에는 현재 메시지 본문, 링크, permalink, attachment type/count는 넣을 수 있지만, PDF/문서 파일의 실제 본문은 넣을 수 없다.
- `data.js`에는 `raw_messages: historical review only` 주석이 있으며, 현 아키텍처 문서도 phone notification raw backend가 현재 쓰기 경로가 아니라고 말한다. 일일/주간 "메시지 전수"의 현재 현실적인 대상은 Telegram public newsfeed snapshot이다.
- repo root 검색 결과 `sw.js`, `STATIC_ASSETS`, `CACHE_VERSION`은 없다. 이번 변경에서 서비스워커 cache bump 대상은 없다.
- `docs/design-system.md`가 존재하므로 뉴스탭 상단 버튼은 기존 라이트 UI + 히어로 카드 디자인 시스템을 따른다.

## 그릴 결과

- 핵심 질문:
  - "일일/주간"의 기준과 digest payload 형식을 어떻게 정할 것인가?
- 추천 답변:
  - 뉴스탭 상단에 `다이제스트` 버튼을 추가하고, 클릭 시 `일일`과 `주간` 복사 옵션을 제공한다.
  - `일일`은 snapshot 내 최신 게시글의 KST 날짜 전체를 복사한다. 운영 수집이 정상일 때는 사실상 오늘이며, 정적 snapshot이 며칠 늦어져도 빈 클립보드를 만들지 않는다.
  - `주간`은 snapshot 내 최신 게시글 KST 날짜를 끝으로 최근 7개 KST 날짜를 복사한다.
  - payload는 Markdown 중심의 LLM 입력용 텍스트로 만든다. 상단에 JSON에 가까운 metadata block을 두고, 아래에 모든 메시지를 source/date/url/text/links/attachments 순서로 전수 나열한다.
  - attachment는 현재 저장된 metadata를 그대로 넣고, document/video 파일 본문은 `not_ingested`로 명시한다.
- 결정:
  - 위 추천값으로 첫 실행 슬라이스를 진행한다.
  - 파일 bytes/PDF text ingest는 이번 버튼 slice에 섞지 않는다. 공개 preview 방식만으로는 file body 전수 저장을 보장할 수 없으므로, Telegram user session/MTProto/Android 로컬 export/수동 파일 첨부 중 하나를 고르는 별도 owner decision이 필요하다.
- 남은 가정:
  - Clipboard API가 대용량 텍스트를 받을 수 있는 브라우저 환경이다. 실패 시 fallback 복사 방식 또는 에러 toast를 제공한다.
  - 사용자는 LLM 분석용 입력에서 "숨김 없이 길어도 전수"를 원한다. 따라서 message text를 임의 truncation하지 않는다.

## 결정 기록

- 결정: digest export는 렌더링된 60개 카드가 아니라 full static snapshot을 기준으로 만든다.
- 이유: 목적이 ChatGPT/Claude 분석용 전수 복사이므로 현재 화면 page state에 묶이면 요구를 만족하지 못한다.
- 되돌릴 수 있는가: 가능. 나중에 Firestore 전수 페이지 쿼리나 shard snapshot으로 교체할 수 있다.

- 결정: "일일"은 snapshot latest KST date, "주간"은 latest KST date 기준 최근 7일로 정의한다.
- 이유: 이 repo의 production 기본 경로는 GitHub Pages snapshot이며, 로컬 checked-in snapshot이 최신 날짜보다 늦을 수 있다. 최신 수집일 기준이면 daily digest가 비어버리는 문제를 피하고 운영에서는 오늘과 동일하게 동작한다.
- 되돌릴 수 있는가: 가능. 버튼 옵션을 `오늘`, `어제`, `최근 7일`, `날짜 선택`으로 확장할 수 있다.

- 결정: PDF/문서 본문 ingest는 이 slice에서 해결됐다고 주장하지 않는다.
- 이유: 현재 collector는 public preview HTML만 읽고 document 파일 body URL/bytes/text를 저장하지 않는다. UI 버튼만 추가해도 파일 본문은 clipboard에 담을 수 없다.
- 되돌릴 수 있는가: 별도 수집 방식 결정 후 후속 계획으로 해결 가능하다.

## 실행 슬라이스

### 슬라이스 1: 뉴스탭 다이제스트 버튼과 current snapshot 전수 복사

- 목표:
  - 뉴스탭 상단에서 `다이제스트` 버튼으로 일일/주간 LLM 분석용 payload를 클립보드에 복사한다.
  - 복사 대상은 현재 렌더링된 page가 아니라 `public/newsfeed/telegram-public-feed.json` snapshot 전수에서 날짜 범위에 해당하는 모든 item이다.
  - PDF/document 파일 본문이 현재 인입되지 않는다는 사실을 payload와 UI toast에 숨기지 않는다.
- 범위:
  - `data.js`
    - full static snapshot을 읽는 digest용 helper를 추가한다. 기존 `loadStaticNewsfeedSnapshot()` 재사용을 우선한다.
    - digest helper는 Firestore 60건 page와 섞지 않고, static snapshot의 `items`, `sources`, `generatedAt`, `since`, `truncated`, `backfillComplete`, `failed` metadata를 함께 반환한다.
    - helper export 추가 시 모든 `data.js` import query string을 동일 cache-bust 값으로 갱신한다.
  - `render-newsfeed.js`
    - 뉴스탭 상단/hero 근처에 `다이제스트` 버튼을 추가한다.
    - 버튼 클릭 시 `일일 복사`, `주간 복사` 옵션을 제공한다. 옵션 UI는 기존 `button[type="button"]` + `data-*` + delegated listener 패턴을 따른다.
    - digest 생성 중 loading/disabled 상태를 보여준다.
    - `navigator.clipboard.writeText()`를 우선 사용하고, 실패 시 hidden textarea + selection fallback을 시도한다.
    - 성공 toast에는 실제 복사 item 수, 범위, payload size를 표시한다.
    - 실패 toast는 Clipboard API 실패, snapshot fetch 실패, 해당 범위 item 없음 중 무엇인지 구분한다.
  - `styles/80-newsfeed.css`
    - 기존 뉴스피드 hero/filter와 어울리는 digest 버튼, option popover/dropdown, loading/disabled/focus 상태를 추가한다.
    - 340px 이하에서도 refresh 버튼, digest 버튼, count text가 겹치지 않게 한다.
  - `scripts/verify-project.mjs`
    - `data.js` import query string 단일성, 새 digest helper export, `render-newsfeed.js` digest action selector, cache-bust 반영을 검사한다.
  - `index.html`, `app.js`, 관련 import 사용처
    - 수정된 JS/CSS가 운영에서 다시 로드되도록 cache-busting query string을 갱신한다.
    - `data.js`는 ES module singleton이므로 query string을 일부 파일만 바꾸지 말고 browser import 전체를 같은 값으로 맞춘다.
- Digest payload 필수 형식:
  - 헤더:
    - title: `뉴스피드 다이제스트`
    - range type: `daily` 또는 `weekly`
    - KST range start/end
    - generatedAt
    - since
    - sourceCount
    - itemCount in range
    - snapshotTotal
    - truncated
    - backfillComplete
    - failed source count
    - attachment counts by type
    - limitations: `document_body_ingested=false`, `video_body_ingested=false`
  - 본문:
    - 모든 matching item을 최신순으로 나열한다.
    - 각 item은 index, KST datetime, sourceTitle, sourceCategory, messageId, permalink, title, full text, links, attachments를 포함한다.
    - text는 임의로 줄이지 않는다.
    - attachment는 현재 저장된 type/url/title/size가 있으면 넣고, 없으면 type만 넣는다.
- 수정하지 말 것:
  - Telegram secret/API key를 browser code나 localStorage에 넣지 않는다.
  - Telegram Chrome 로그인 자동화, MTProto user session, Bot API 전환을 이 slice에서 구현하지 않는다.
  - PDF/document 파일 bytes 또는 extracted text가 인입된 것처럼 표시하지 않는다.
  - source 목록을 늘리거나 확인 필요/로그인 필요 channel을 추가하지 않는다.
  - raw_messages를 삭제하지 않는다.
  - 거래 자동 생성/분석 기능을 추가하지 않는다.
- 예상 수정 파일:
  - `data.js`
  - `render-newsfeed.js`
  - `styles/80-newsfeed.css`
  - `scripts/verify-project.mjs`
  - `index.html`
  - `app.js`
  - `docs/ai/executions/2026-07-07-newsfeed-digest-clipboard.md`
  - `docs/ai/NEXT_ACTION.md`
- 검증 방법:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - production deploy 후 `Deploy GitHub Pages` workflow 성공 확인
  - production URL `https://aretenald2018-sys.github.io/budget/`에서 뉴스탭을 연다.
  - `다이제스트` 버튼이 뉴스탭 상단에 보이고 focus/disabled/loading 상태가 깨지지 않는지 확인한다.
  - `일일 복사`를 눌러 clipboard payload에 latest KST date의 모든 matching item이 들어가는지 확인한다.
  - `주간 복사`를 눌러 clipboard payload에 latest KST date 기준 최근 7일 모든 matching item이 들어가는지 확인한다.
  - payload header에 `truncated=false`, `backfillComplete=true`, `document_body_ingested=false`가 들어가는지 확인한다.
  - attachment가 있는 sample item에서 attachment metadata가 payload에 들어가고, document body가 없는 경우 `not_ingested`로 표시되는지 확인한다.
  - 모바일 폭에서 버튼/hero/meta/filter가 겹치지 않는지 확인한다.
- 완료 증거:
  - 화면에 `다이제스트` 버튼이 있고 일일/주간 복사가 실제 clipboard에 들어간다.
  - 복사된 payload의 item 수가 같은 날짜 범위로 snapshot에서 계산한 item 수와 일치한다.
  - PDF/document 본문 미수집 한계가 UI 또는 payload에서 숨겨지지 않는다.

### 슬라이스 2: 리뷰

- 목표:
  - 슬라이스 1이 계획 범위와 운영 배포 기준을 지켰는지 리뷰한다.
- 범위:
  - 변경 파일과 계획 문서 대조.
  - digest가 렌더링된 page만 복사하지 않고 full snapshot을 읽는지 확인.
  - cache-bust와 `data.js` singleton import query 단일성 확인.
  - document/PDF 본문이 없는 상태를 "전수 인입"으로 오인하게 만들지 않는지 확인.
  - production UI에서 일일/주간 clipboard 복사를 실제로 실행한다.
- 예상 수정 파일:
  - `docs/ai/reviews/2026-07-07-newsfeed-digest-clipboard-review.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 새 feature work.
  - PDF/document ingest 방식 결정.
- 검증 방법:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - production `https://aretenald2018-sys.github.io/budget/` 뉴스탭에서 digest 복사 flow 확인
- 완료 증거:
  - 문제가 없으면 `NEXT_ACTION.md` 상태를 `complete`로 둔다.
  - 문제가 있으면 focused fix 범위와 재현/검증 방법을 남긴다.

## 후속 별도 결정: PDF/document 본문 전수 인입

현재 공개 preview 기반 collector만으로는 document/PDF 본문 전수를 보장하지 못한다. 이를 해결하려면 별도 계획에서 다음 중 하나를 선택해야 한다.

- Telegram user session/MTProto 기반 수집: 파일 다운로드와 document metadata가 가장 직접적이지만, user session secret 운영과 보안 검토가 필요하다.
- Android 로컬 Telegram notification/share/export 기반 수집: 사용자 기기에서 받은 파일 접근 여부를 활용할 수 있지만, Android 앱 권한/저장소 접근 설계가 필요하다.
- 수동 파일 첨부/업로드 후 message permalink와 연결: 운영 위험은 낮지만 자동 전수 수집은 아니다.
- 현재 공개 preview 유지 + document title/size metadata만 보강: 가장 작지만 PDF 본문 분석 목적은 충족하지 못한다.

## 다음 세션 시작 프롬프트

이 계획의 슬라이스 1 `뉴스탭 다이제스트 버튼과 current snapshot 전수 복사`만 실행한다. PDF/document 파일 bytes 또는 extracted text ingest, Telegram Chrome 로그인, MTProto, Bot API 전환, Android local file capture는 구현하지 않는다. Digest payload에는 현재 document body가 수집되지 않는다는 한계를 명시한다.
