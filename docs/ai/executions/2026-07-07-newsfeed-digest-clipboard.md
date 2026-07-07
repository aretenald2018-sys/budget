# 뉴스피드 다이제스트 클립보드 실행 기록

## 범위

- 계획: `docs/ai/features/2026-07-07-newsfeed-digest-clipboard.md`
- 실행 슬라이스: 슬라이스 1 `뉴스탭 다이제스트 버튼과 current snapshot 전수 복사`
- 구현 대상:
  - 뉴스탭 상단 `다이제스트` 버튼
  - `일일 복사`, `주간 복사` 메뉴
  - full static snapshot 기반 LLM 분석용 clipboard payload
  - PDF/document/video 본문 미수집 한계 표시

## 구현

- `data.js`
  - `getNewsfeedDigestSnapshot()` export를 추가했다.
  - digest helper는 static snapshot 전체 `items`, `sources`, `generatedAt`, `since`, `truncated`, `backfillComplete`, source 실패 정보를 반환한다.
  - 정적 뉴스피드 cache-bust를 `20260707-newsfeed-digest-clipboard`로 갱신했다.
- `render-newsfeed.js`
  - hero 영역에 `다이제스트` 버튼과 option popover를 추가했다.
  - `data-newsfeed-action="digest-menu"`와 `data-newsfeed-digest` delegated listener를 추가했다.
  - `daily`는 snapshot 최신 KST 날짜 전체, `weekly`는 최신 KST 날짜 기준 최근 7개 KST 날짜 전체를 복사한다.
  - payload는 Markdown + JSON metadata 구조로 만들고 모든 matching item의 full text를 임의 truncation 없이 포함한다.
  - attachment는 현재 snapshot에 있는 metadata를 포함하고 document/video/file body는 `not_ingested`로 표시한다.
  - Clipboard API 우선, hidden textarea fallback을 구현했다.
- `styles/80-newsfeed.css`
  - digest 버튼, menu, option, disabled/focus/mobile 상태를 추가했다.
- `scripts/verify-project.mjs`
  - 새 digest helper, UI selector, limitation marker, cache-bust 계약 검사를 추가했다.
- `index.html`, `app.js`, 관련 module import 사용처
  - 변경된 JS/CSS가 운영에서 갱신되도록 query string을 같은 cache-bust 값으로 맞췄다.

## 수집 데이터 점검

- 메시지 본문:
  - `api/_lib/telegram-public-feed.js`는 public preview HTML의 `tgme_widget_message_text`를 `text`로 정규화한다.
  - `scripts/telegram-feed-static.mjs`는 정규화된 message를 static snapshot item으로 저장한다.
  - 현재 checked-in snapshot 기준 71개 source, 33,084 item, `truncated=false`, `backfillComplete=true`, failed source 0개다.
- PDF/document/video 본문:
  - 현재 인입되지 않는다.
  - `extractAttachments()`는 image URL, video type, document type만 추출한다.
  - `stableStaticFeedItem()`은 attachment를 `{ type }`만 남기도록 축약한다.
  - 따라서 이번 slice는 PDF/document body ingest를 해결하지 않고, digest에 `document_body_ingested=false`, `file_bytes_ingested=false`, `body=not_ingested`를 명시한다.

## 검증

- 2026-07-07 재검증:
  - 현재 작업트리 기준 아래 정적 검증, Pages build, 로컬 artifact UI QA를 다시 실행했다.
  - 임시 로컬 서버는 QA 후 닫았다.
- 정적 검증:
  - `npm.cmd run verify`
  - 결과: 통과, `verify-project passed (95 JS files checked).`
- Pages artifact build:
  - `npm.cmd run pages:build`
  - 결과: 통과, `_site` artifact 생성
- 로컬 Pages artifact UI QA:
  - 임시 URL: `http://127.0.0.1:5501/`
  - 공개 뉴스 화면에서 `다이제스트` 버튼 표시 확인
  - 메뉴 옵션 확인:
    - `일일 복사 최신 KST 날짜 전수`
    - `주간 복사 최근 7개 KST 날짜`
  - 일일 복사 clipboard 확인:
    - payload length: 115,472자
    - range: `2026-07-04T00:00:00+09:00` - `2026-07-04T23:59:59+09:00`
    - item count: 155
    - `# 뉴스피드 다이제스트`, `## 메시지 전수`, `document_body_ingested=false`, `BEGIN TEXT`/`END TEXT` 포함
  - 주간 복사 clipboard 확인:
    - payload length: 4,939,507자
    - range: `2026-06-28T00:00:00+09:00` - `2026-07-04T23:59:59+09:00`
    - item count: 6,417
    - `# 뉴스피드 다이제스트`, `## 메시지 전수`, `document_body_ingested=false`, `BEGIN TEXT`/`END TEXT` 포함
  - 모바일 375x812 확인:
    - digest button viewport 내부
    - digest menu viewport 내부
    - `documentElement.scrollWidth <= window.innerWidth`
  - 태블릿 768x900 확인:
    - 앱 프레임 430px 폭 유지
    - digest button/menu viewport 내부
    - `documentElement.scrollWidth <= window.innerWidth`
  - browser console warning/error 없음
- Production UI:
  - `git push origin HEAD:main`: `4ad990c Add newsfeed digest clipboard export`
  - GitHub Pages workflow: `28849376508`, success
  - URL: `https://aretenald2018-sys.github.io/budget/`
  - production HTML 확인:
    - `app.js?v=20260707-newsfeed-digest-clipboard`
    - `style.css?...news=20260707-newsfeed-digest-clipboard`
  - standalone Chromium Playwright QA:
    - first newsfeed page: 60 cards
    - `일일 복사`: clipboard payload 523,176자
    - `주간 복사`: clipboard payload 4,579,651자
    - 두 payload 모두 `# 뉴스피드 다이제스트`, `## 메시지 전수`, `document_body_ingested=false`, `body=not_ingested` 포함 확인
    - 모바일 375x812: `scrollWidth=375`, digest button/menu viewport 내부
    - browser console warning/error 없음

## 후속 리뷰 포인트

- full snapshot을 기준으로 복사하는지, 렌더링된 60건만 복사하지 않는지 확인한다.
- `data.js` import query string이 같은 cache-bust 값으로 맞춰졌는지 확인한다.
- PDF/document 본문 미수집 상태를 전수 수집 완료로 오인하게 만드는 문구가 없는지 확인한다.
- production deploy 후 `https://aretenald2018-sys.github.io/budget/`에서 같은 일일/주간 복사 흐름을 확인했다.
