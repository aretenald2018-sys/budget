# 다음 자동 액션

## 2026-07-08 Reward Point Settlement Negative Balance

- 상태: `needs_user_confirmation`
- 계획 문서: `docs/ai/features/2026-07-08-reward-point-settlement-negative-balance.md`
- 실행 문서: `docs/ai/executions/2026-07-08-reward-point-settlement-negative-balance.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-08-reward-point-settlement-negative-balance-review.md`
- 요청: 포인트 항목 CRUD를 유지하고, 와인구매 같은 포인트 항목에 지출/정산 금액을 입력하면 홈 포인트 잔액이 음수까지 표시되게 한다.
- 적용 결정: `월간 잔액 기준`
- 실행 결과:
  - 거래 추가/수정 모달에 `포인트 정산` 패널을 추가했다.
  - `transactions.rewardPointEntry` metadata를 저장/삭제하고, 홈 포인트 계산에서 `earnedMonthPoints - spentMonthPoints = monthPoints`를 계산한다.
  - 음수 `monthPoints`를 웹 홈 row와 Android 위젯 snapshot/provider에서 보존한다.
  - 거래 목록에 포인트 badge와 `와인구매 정산 -50,000P` meta를 표시한다.
- 검증 결과:
  - GREEN fixture: 와인구매 `earnedMonthPoints=25,358`, `spentMonthPoints=50,000`, `monthPoints=-24,642`
  - 기존 category 규칙 유지 fixture: 같은 포인트 정산 거래가 `생활` category면 `todaySpend=50,000`
  - 삭제된 포인트 fallback fixture: `retiredPoint` row가 `삭제된 포인트`, `monthPoints=-1,000`, `settlementOnly=true`
  - `npm.cmd run verify`: 통과 (`verify-project passed (92 JS files checked).`)
  - `npm.cmd run pages:build`: 통과 (`_site` artifact 생성)
  - code/context 축소 재리뷰: PASS
  - 재확인(2026-07-08): `npm.cmd run verify`, `npm.cmd run pages:build`, `git diff --check` 통과
  - production deploy: commit `b6c757b` push 후 `Deploy GitHub Pages` workflow `28939892054` success
  - production asset: `/budget/` HTTP 200, `20260708-reward-point-settlement` 토큰 2건, `app.js`, `style.css`, `render-report.js` HTTP 200
  - production UI 저장 전 확인:
    - 홈/거래 탭 렌더링 및 console error/warn 없음
    - 거래 추가 모달에서 `포인트 정산` 패널 표시
    - 포인트 항목 option: `와인구매 포인트`, `고급재료 포인트`, `여행충당 포인트`
    - `포인트 정산` 체크 후 `와인구매 포인트`, `50000` 입력 시 panel `active`, `aria-hidden=false`
- 남은 확인:
  - `not verified yet`: production 실데이터에 임시 50,000원 거래를 저장/삭제하는 것은 재정 데이터 변경이라 사용자 확인 전에는 실행하지 않았다.
  - `not verified yet`: Android device/emulator widget runtime에서 음수 포인트 표시를 직접 확인하지 못했다.
- 다음 액션:
  - 사용자가 production에 임시 거래를 생성하고 바로 삭제해도 된다고 확인하면, `거래 추가 -> 포인트 정산 -> 와인구매 포인트 -> 50,000원 저장` 후 홈 `와인구매` row가 음수 잔액을 표시하는지 확인하고, 거래 수정/삭제로 잔액 복구까지 확인한다.

## 2026-07-08 Settings Budget Label Nowrap

- 상태: `needs_user_decision`
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
  - commit/push: `c352348 Keep settings budget labels on one line`을 `origin/main`에 push
  - GitHub Pages workflow: `28923720497`, success
  - production asset: `https://aretenald2018-sys.github.io/budget/` HTML/CSS/JS HTTP 200, `settings=20260708-budget-label-nowrap`, `budget-goal-label`, nowrap/keep-all/ellipsis 계약 확인
- 남은 확인:
  - `not verified yet`: headless QA profile에 Firebase 로그인 세션/테스트 계정이 없어 production 설정 탭의 실제 예산 카테고리 row는 직접 확인하지 못했다.
- 다음 액션: 사용자의 로그인된 production 브라우저에서 `설정 -> 예산 & 카테고리`로 들어가 `주거비용`, `보험비용`, `통신비용` 등이 한 줄인지 확인한다.

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
