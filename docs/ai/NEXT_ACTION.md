# 다음 자동 액션

## 2026-07-08 Settings Budget Label Nowrap

- 상태: `local_review_complete`
- 계획 문서: `docs/ai/features/2026-07-08-settings-budget-label-nowrap.md`
- 실행 문서: `docs/ai/executions/2026-07-08-settings-budget-label-nowrap.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-08-settings-budget-label-nowrap-review.md`
- ULW: `.omo/ulw-loop/budget-label-nowrap-20260708/goals.json`
- 요청: 설정 화면의 예산 카테고리 row에서 `주거비용` 같은 한국어 라벨이 두 줄로 갈라지지 않고 한 줄에 표시되게 한다.
- 실행 결과:
  - `render-settings.js` 예산 row 라벨에 `budget-goal-label` class를 추가했다.
  - `styles/00-foundation.css`에서 editable grid 폭과 label nowrap/keep-all/ellipsis 계약을 수정했다.
  - `style.css`, `index.html` cache-bust를 `20260708-budget-label-nowrap`로 갱신했다.
- 검증 결과:
  - RED: `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-check.mjs red` 실패 확인
  - AFTER: `.omo/evidence/budget-label-nowrap-20260708/mobile-nowrap-check.mjs after` 통과, 390x844 Chrome fixture에서 8개 라벨 모두 `oneLine=true`
  - 소스 계약: `.omo/evidence/budget-label-nowrap-20260708/source-contract-after.txt` 모두 `PASS`
  - `npm.cmd run verify`: 통과, `verify-project passed (96 JS files checked).`
  - `npm.cmd run pages:build`: 통과, `_site` artifact 생성
- 다음 액션: commit/push 후 production Pages에서 설정 탭 예산 row와 cache-bust를 확인한다.

## 현재 상태

- 상태: `complete`
- 계획 문서: `docs/ai/features/2026-07-07-newsfeed-digest-clipboard.md`
- 실행 문서: `docs/ai/executions/2026-07-07-newsfeed-digest-clipboard.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-07-newsfeed-digest-clipboard-review.md`
- 현재 단계: 뉴스탭 다이제스트 클립보드 기능 구현, 리뷰, production 배포, production UI 검증 완료
- 다음 액션:
  - 없음.

## 실행 결과 요약

- 뉴스탭 상단 hero 영역에 `다이제스트` 버튼을 추가했다.
- 버튼 메뉴는 `일일 복사`, `주간 복사`를 제공한다.
- 복사 payload는 현재 렌더링된 60건이 아니라 `public/newsfeed/telegram-public-feed.json` full snapshot에서 날짜 범위를 필터링한다.
- `일일`은 snapshot 최신 KST 날짜 전체, `주간`은 최신 KST 날짜 기준 최근 7개 KST 날짜 전체를 복사한다.
- payload에는 metadata, source/date/url/messageId/text/links/attachments를 포함하고 message text는 임의 truncation하지 않는다.
- payload와 UI copy에는 `document_body_ingested=false`, `video_body_ingested=false`, `file_bytes_ingested=false`, `body=not_ingested` 한계를 명시했다.
- PDF/document 파일 bytes 또는 extracted text ingest는 구현하지 않았다.

## 검증 결과

- 재검증: 2026-07-07 현재 작업트리 기준 동일 결과 확인
- `npm.cmd run verify`: 통과 (`verify-project passed (95 JS files checked).`)
- `npm.cmd run pages:build`: 통과 (`_site` artifact 생성)
- 로컬 Pages artifact QA:
  - URL: `http://127.0.0.1:5501/`
  - 공개 뉴스 화면 진입 후 `다이제스트` 버튼과 메뉴 표시 확인
  - `일일 복사`: clipboard payload 115,472자, `2026-07-04T00:00:00+09:00`부터 `2026-07-04T23:59:59+09:00`, 155건
  - `주간 복사`: clipboard payload 4,939,507자, `2026-06-28T00:00:00+09:00`부터 `2026-07-04T23:59:59+09:00`, 6,417건
  - 두 payload 모두 `# 뉴스피드 다이제스트`, `## 메시지 전수`, `document_body_ingested=false`, `BEGIN TEXT`/`END TEXT` 포함 확인
  - 모바일 375x812 및 태블릿 768x900 viewport에서 버튼과 메뉴가 viewport 안에 있고 가로 overflow 없음 확인
  - 브라우저 console warning/error 없음
- Production UI: 통과
  - commit: `4ad990c Add newsfeed digest clipboard export`
  - workflow: `28849376508`, success
  - URL: `https://aretenald2018-sys.github.io/budget/`
  - production cache-bust:
    - `app.js?v=20260707-newsfeed-digest-clipboard`
    - `style.css?...news=20260707-newsfeed-digest-clipboard`
  - standalone Chromium Playwright QA:
    - first newsfeed page 60 cards
    - `일일 복사` clipboard payload 523,176자
    - `주간 복사` clipboard payload 4,579,651자
    - payload markers: `# 뉴스피드 다이제스트`, `## 메시지 전수`, `document_body_ingested=false`, `body=not_ingested`
    - mobile 375x812 `scrollWidth=375`, digest button/menu viewport 내부
    - browser console warning/error 없음

## 변경 파일

- `data.js`
- `render-newsfeed.js`
- `styles/80-newsfeed.css`
- `scripts/verify-project.mjs`
- `index.html`
- `app.js`
- `modal-manager.js`
- `style.css`
- `render-home.js`
- `render-finance.js`
- `render-report.js`
- `render-review.js`
- `render-settings.js`
- `render-settle.js`
- `render-tx.js`
- `modals/account-modal.js`
- `modals/category-modal.js`
- `modals/tx-edit-modal.js`
- `urge/render-mindbank.js`
- `urge/render-urge-alternatives.js`
- `urge/render-urge-input.js`
- `urge/render-urge-result.js`
- `urge/render-wine-cellar.js`
- `docs/ai/features/2026-07-07-newsfeed-digest-clipboard.md`
- `docs/ai/executions/2026-07-07-newsfeed-digest-clipboard.md`
- `docs/ai/reviews/2026-07-07-newsfeed-digest-clipboard-review.md`
- `docs/ai/NEXT_ACTION.md`

## 수집 데이터 점검

- 공개 Telegram preview 메시지 본문은 현재 snapshot에 `text`로 저장된다.
- 현재 checked-in snapshot 기준:
  - source 71개
  - item 33,084건
  - `truncated=false`
  - `backfillComplete=true`
  - failed source 0개
- PDF/document/video 파일 본문은 현재 인입되지 않는다.
  - `api/_lib/telegram-public-feed.js`의 `extractAttachments()`는 image URL, video type, document type만 만든다.
  - `scripts/telegram-feed-static.mjs`의 `stableStaticFeedItem()`은 attachment를 `{ type }`만 남기도록 축약한다.
  - 따라서 digest는 message text 전수와 attachment metadata/한계 표시는 가능하지만, PDF/document 본문 분석은 아직 불가능하다.

## 다음 액션

- 없음. 이 뉴스피드 다이제스트 계획은 완료됐다.

## 보류된 별도 계획

- `docs/ai/features/2026-07-04-settings-option-line-inputs.md`
  - 설정 탭 옵션 입력/선택 라인형 UI 계획이다.
  - 이번 뉴스피드 요청과 충돌하지 않도록 실행하지 않았다.
  - 해당 파일과 `.omo/` 상태 파일은 이번 뉴스피드 커밋 범위에 포함하지 않는다.

## 상태값

- `idle`: 진행 중인 자동 액션 없음
- `needs_user_decision`: 사용자 결정이 필요함
- `ready_for_execution`: 다음 실행 슬라이스를 바로 진행
- `ready_for_review`: 직전 실행 결과를 바로 리뷰
- `ready_for_fix`: 리뷰에서 발견된 문제만 바로 수정
- `complete`: 현재 계획 완료

## 자동 진행 규칙

- 세션 시작 시 이 파일을 먼저 읽는다.
- 사용자가 `계속`, `다음`, `진행`, `리뷰해`, `해줘`처럼 짧게 말하면 이 파일의 `다음 액션`을 실행한다.
- 사용자가 새로운 요청을 명시하면 새 요청이 우선한다.
- 계획 세션 종료 후 차단 질문이 없으면 `ready_for_execution`으로 갱신한다.
- 실행 세션 종료 후 `ready_for_review`로 갱신한다.
- 리뷰 세션 종료 후 문제가 있으면 `ready_for_fix`, 문제가 없고 다음 슬라이스가 있으면 `ready_for_execution`, 모든 슬라이스가 끝났으면 `complete`로 갱신한다.
- 다음 프롬프트나 리뷰 프롬프트를 사용자에게 복붙하라고 요구하지 않는다.
