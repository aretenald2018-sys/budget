# 다음 자동 액션

## 현재 상태

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-04-telegram-newsfeed.md`
- 실행 문서: `docs/ai/executions/2026-07-04-telegram-newsfeed-public-preview.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-04-telegram-newsfeed-public-preview-review.md`
- 현재 단계: Telegram 뉴스피드 구현/배포 완료, 로그인 후 운영 UI 확인 대기
- 마지막 완료:
  - 공개 `t.me/s/<handle>` preview가 확인된 73개 Telegram source를 `utils/telegram-sources.js`에 등록했다.
  - `api/_lib/telegram-public-feed.js`와 `scripts/telegram-feed-sync.mjs`로 공개 preview polling 수집기를 추가했다.
  - `.github/workflows/budget-backend.yml`에 15분 주기 `telegram_public_feed` job과 수동 `mode=telegram` 실행을 추가했다.
  - `data.js`에 `newsfeed_items` 읽기와 `telegram_public_feed` 상태 읽기 경계를 추가했다.
  - `index.html`, `app.js`, `render-newsfeed.js`, `styles/80-newsfeed.css`에 `뉴스피드` 탭을 추가했다.
  - `scripts/build-pages.mjs`, `scripts/verify-project.mjs`, `docs/design-system.md`, `docs/SETUP.md`, `docs/deployment.md`, `README.md`를 갱신했다.
  - `node scripts/telegram-feed-sync.mjs --dry-run --limit-sources=2 --max-messages=3` 성공: 2개 source, 6개 메시지 파싱, 실패 0.
  - `npm.cmd run verify` 통과.
  - `npm.cmd run pages:build` 통과.
  - Playwright harness에서 375px/430px 뉴스피드 렌더, 콘솔 오류 없음, 가로 overflow 없음, 본문 5줄 clamp 확인.
  - 실제 `index.html` 하단 nav markup에서 375px 5버튼 동일 폭, 가로 overflow 없음 확인.
  - 리뷰 세션에서 secret 미노출, Firestore 경계, dedupe/latestMessageId, GitHub Actions schedule, UI cache-bust, Pages artifact 포함 여부를 확인했다.
  - 공개 preview HTML이 비정상 링크/HTML 엔티티를 포함해도 전체 수집이 실패하지 않도록 parser 방어 코드를 추가했다.
  - `c38a03a Add Telegram newsfeed`를 `main`에 푸시했고 Pages/Validate workflow는 성공했다.
  - `telegram_public_feed` 수동 run `28692300273`에서 Firestore `RESOURCE_EXHAUSTED: Quota exceeded` 실패를 확인했다.
  - Firestore quota 실패 시에도 앱이 읽을 수 있도록 `scripts/telegram-feed-static.mjs`와 `public/newsfeed/telegram-public-feed.json` fallback을 추가했다.
  - `npm.cmd run telegram:static` 성공: 73개 source, 568개 메시지 fetch, 최신 240개 item snapshot 생성, 실패 0.
  - `fe94a48 Add Telegram newsfeed static fallback`을 `main`에 푸시했고 Validate run `28692707647`, Pages run `28692707645`가 성공했다.
  - Telegram backend run `28692709796`이 성공했다. Firestore step은 quota 초과로 실패했지만 static snapshot step이 73개 source, 1325개 메시지 fetch, 240개 item 생성에 성공했다.
  - backend가 snapshot commit `dddd735 Update Telegram newsfeed snapshot`을 만들고 Pages run `28692722662`를 dispatch했으며 해당 Pages 배포도 성공했다.
  - 운영 static feed URL `https://aretenald2018-sys.github.io/budget/public/newsfeed/telegram-public-feed.json` 확인 결과 HTTP 200, sourceCount 73, fetched 1325, items 240, failed 0.
  - 운영 app shell `https://aretenald2018-sys.github.io/budget/` 확인 결과 HTTP 200, `tab-newsfeed`, `data-tab="newsfeed"`, app/style v2 cache-bust가 존재한다.
- 다음 액션:
  - 사용자가 운영 앱에 로그인한 상태에서 `뉴스` 하단 탭을 열어 카드가 보이는지 확인한다. 자동화로 검증하려면 앱 로그인 자격증명 또는 로그인된 브라우저 세션 접근이 필요하다.
- 차단 사유:
  - Firestore 저장은 현재 quota 초과로 실패했다. 정적 snapshot fallback으로 운영 뉴스피드 표시를 우선 보장하고, quota 회복 뒤 Firestore 쓰기 재확인이 필요하다.
  - 운영 URL에서 로그인 후 실제 수집 글 표시 확인은 앱 인증 정보가 없어 수행하지 못했다. 비로그인 production 브라우저 QA에서는 로그인 화면이 정상 표시되고 static feed HTTP 200은 확인했다.

## 최근 처리한 요청

- 요청: `구현해줘. 특히 뉴스가 올라올 때마다 업데이트 되게 해주고.`
- 결과:
  - 공개 preview 방식으로 가능한 source만 대상으로 구현했다.
  - Telegram 공개 preview 방식에는 webhook이 없으므로 true push realtime이 아니라 GitHub Actions 15분 schedule + 탭 수동 새로고침으로 최신화한다.
  - 확인 필요/로그인 필요/표시명 불일치 source는 기본 수집 목록에서 제외했다.

## 리뷰 대상 변경 파일

- `.github/workflows/budget-backend.yml`
- `README.md`
- `api/_lib/telegram-public-feed.js`
- `app.js`
- `data.js`
- `docs/SETUP.md`
- `docs/ai/NEXT_ACTION.md`
- `docs/ai/executions/2026-07-04-telegram-newsfeed-public-preview.md`
- `docs/ai/features/2026-07-04-telegram-newsfeed.md`
- `docs/deployment.md`
- `docs/design-system.md`
- `index.html`
- `package.json`
- `render-newsfeed.js`
- `scripts/build-pages.mjs`
- `scripts/telegram-feed-sync.mjs`
- `scripts/telegram-feed-static.mjs`
- `scripts/verify-project.mjs`
- `style.css`
- `styles/80-newsfeed.css`
- `public/newsfeed/telegram-public-feed.json`
- `utils/telegram-sources.js`

## 다음 실행 범위

- 실행할 단계: 리뷰 세션
- 수정하지 말 것:
  - 새 Telegram source 추가
  - 확인 필요/로그인 필요 source를 기본 목록에 편입
  - MTProto user session
  - Telegram Bot API token 방식으로 재전환
  - Android Telegram notification capture
  - 뉴스 메시지를 거래로 자동 변환

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
