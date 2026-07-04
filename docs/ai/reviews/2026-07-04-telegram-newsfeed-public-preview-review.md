# Telegram 뉴스피드 공개 Preview 구현 리뷰

## 판정

- 코드 리뷰: 통과
- 운영 검증: 통과
- 이유: production GitHub Pages에서 로그인 전 `뉴스 보기` 공개 진입, 실제 Telegram snapshot 렌더, v4 module cache-bust, 2분 자동 JSON 재요청을 확인했다.

## 확인한 내용

- Telegram 수집은 `t.me/s/<handle>` 공개 preview polling만 사용한다.
- Telegram Bot token, MTProto session, Chrome 로그인 쿠키, Telegram 계정 비밀번호를 코드/브라우저 저장소에 넣지 않았다.
- 서버 쓰기는 `api/_lib/firebase-admin.js` 경계를 통해 `users/{USER_UID}/newsfeed_items`와 `users/{USER_UID}/integrations/telegram_public_feed`에만 수행한다.
- 브라우저는 `data.js` 경계를 통해 `newsfeed_items`와 수집 상태를 읽기만 한다.
- 브라우저는 Firestore 읽기 실패 시 `public/newsfeed/telegram-public-feed.json` 정적 snapshot을 fallback으로 읽는다.
- 정적 snapshot fallback은 2분 TTL을 두고, refresh 렌더에서는 `&t=` cache-busting query로 열린 뉴스 탭에서도 새 JSON을 다시 읽는다.
- 메시지 문서 id는 `telegram_public_${sourceId}_${messageId}`라서 재수집 중복 저장을 피한다.
- source별 `latestMessageId`를 저장해 다음 실행부터 새 메시지만 저장한다.
- 공개 preview가 깨진 링크나 비정상 HTML 엔티티를 포함해도 해당 링크만 버리고 수집이 계속되도록 파서를 보강했다.
- `확인필요`, `로그인필요`, 표시명 불일치 source는 기본 73개 source 목록에 넣지 않았다.
- GitHub Actions는 15분 schedule과 `workflow_dispatch mode=telegram` 수동 실행을 제공한다.
- GitHub Actions는 Firestore 저장 실패와 무관하게 정적 snapshot을 생성하고 변경 시 커밋한 뒤 Pages 배포를 dispatch한다.
- UI는 `뉴스` 하단 탭, 카테고리 필터, 새로고침 버튼, source/status meta, Telegram 원문 링크를 제공한다.
- 로그인 전 화면에서도 `뉴스 보기` 버튼으로 공개 뉴스피드에 진입할 수 있다.
- 뉴스 탭이 활성이고 문서가 표시 상태이면 2분마다 자동 refresh한다.
- `index.html`, `app.js`, `style.css`, `data.js` import cache-bust를 갱신했다.

## 검증

- `node --check api/_lib/telegram-public-feed.js` 통과
- `node --check app.js`, `node --check data.js`, `node --check render-newsfeed.js`, `node --check scripts/verify-project.mjs` 통과
- `npm.cmd run verify` 통과: `verify-project passed (92 JS files checked).`
- `npm.cmd run pages:build` 통과: `_site` artifact 생성
- `node scripts/telegram-feed-sync.mjs --dry-run --limit-sources=2 --max-messages=3` 통과: 2개 source, 6개 메시지, 실패 0
- `npm.cmd run telegram:static` 통과: 73개 source, 568개 메시지 fetch, 최신 240개 item snapshot, 실패 0
- GitHub Actions:
  - `28692707647` Validate 성공
  - `28692707645` Pages 성공
  - `28692709796` Telegram backend 성공
  - `28692722662` backend-dispatched Pages 성공
  - `28693334425` Validate 성공
  - `28693334450` Pages 성공
- 운영 static feed 확인: HTTP 200, sourceCount 73, fetched 1325, items 240, failed 0
- 운영 app shell 확인: HTTP 200, `tab-newsfeed`, `data-tab="newsfeed"`, app/style v4 cache-bust 존재
- `git diff --check` 통과
- production Playwright QA 통과:
  - URL: `https://aretenald2018-sys.github.io/budget/`
  - 375px viewport에서 로그인 화면 `뉴스 보기` 클릭 후 `뉴스피드` 진입
  - 카드 180개 렌더
  - hero: 73개 공개 채널, 최신 글 상대시간 표시
  - 첫 카드 최신 일자 `07/04 12:12`
  - 가로 overflow 없음
  - console error 없음
  - `app.js`, `data.js`, `render-newsfeed.js` 모두 `20260704-telegram-newsfeed-v4`로 로드
  - `telegram-public-feed.json?v=20260704-telegram-newsfeed-v4` initial request HTTP 200
  - 2분 뒤 `telegram-public-feed.json?v=20260704-telegram-newsfeed-v4&t=...` 자동 request HTTP 200
  - 증거: `.omo/evidence/2026-07-04-telegram-newsfeed/prod-public-newsfeed-v4-autorefresh-375.png`
- Playwright harness 시각 검증 통과:
  - 375px/430px 뉴스피드 fixture 렌더 콘솔 오류 없음
  - 카드 3개 렌더
  - 가로 overflow 없음
  - 본문 5줄 clamp 확인
  - 실제 `index.html` 하단 nav 375px에서 5개 버튼 동일 폭, overflow 없음

## 남은 제약

- Firestore quota가 회복된 뒤 GitHub Actions `Budget Backend Jobs`의 Firestore 저장 성공을 확인해야 한다.
- Telegram 공개 preview 방식에는 webhook/push가 없어 true realtime은 불가능하다. 현재 갱신 단위는 GitHub Actions 15분 polling + Pages 배포 지연 + 열린 탭 2분 자동 재조회다.
