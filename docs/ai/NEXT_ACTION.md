# 다음 자동 액션

## 현재 상태

- 상태: `ready_for_review`
- 계획 문서: `docs/ai/features/2026-07-07-newsfeed-digest-clipboard.md`
- 실행 문서: `docs/ai/executions/2026-07-07-newsfeed-digest-clipboard.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-07-newsfeed-digest-clipboard-review.md`
- 현재 단계: 구현과 로컬 QA는 통과, 사용자의 배포 요청에 따라 production deploy/verification 진행
- 다음 액션:
  - 변경사항을 `origin/main`에 commit/push해서 GitHub Pages workflow를 실행한다.
  - workflow 성공 후 production URL에서 뉴스탭 digest 복사 flow를 확인한다.

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
- Production UI: not verified yet
  - 이유: 변경사항이 아직 commit/push되지 않아 GitHub Pages workflow가 실행되지 않았다.
  - 2026-07-07 production HTML 확인 결과:
    - `style.css`는 아직 `news=20260704-newsfeed-backfill-pagination-v3`
    - `app.js`는 아직 `20260705-reward-widget-pointbar-thickness-v3`
    - 따라서 production URL은 아직 이번 digest cache-bust `20260707-newsfeed-digest-clipboard`를 배포하지 않았다.
  - 현재 local branch: `deploy/newsfeed-digest-20260707`

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

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 변경사항 commit
- `origin/main`에 의도한 변경사항 push
- GitHub Pages workflow 완료 확인
- production URL `https://aretenald2018-sys.github.io/budget/`에서 뉴스탭 digest 복사 flow 확인

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
