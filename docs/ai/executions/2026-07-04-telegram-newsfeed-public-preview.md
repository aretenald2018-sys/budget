# Telegram 뉴스피드 공개 preview 실행 기록

## 실행 범위

- 계획 문서: `docs/ai/features/2026-07-04-telegram-newsfeed.md`
- 실행 slice: 공개 `t.me/s/<handle>` preview 기반 뉴스피드 탭과 15분 주기 수집 job
- 제외:
  - 확인 필요/로그인 필요/표시명 불일치 Telegram source
  - Telegram Bot API token
  - MTProto user session
  - Android Telegram notification capture
  - 뉴스 메시지의 거래 자동 변환

## 구현 내용

- `utils/telegram-sources.js`에 공개 preview가 확인된 73개 source를 등록했다.
- `api/_lib/telegram-public-feed.js`가 공개 Telegram preview HTML을 읽고 `data-post`, `datetime`, message text/link/attachment를 feed item으로 정규화한다.
- `scripts/telegram-feed-sync.mjs`가 dry-run 및 GitHub Actions 실행 진입점으로 동작한다.
- `.github/workflows/budget-backend.yml`에 `mode=telegram` 수동 실행과 `*/15 * * * *` schedule job을 추가했다.
- Firestore 저장 위치는 `users/{USER_UID}/newsfeed_items/{telegram_public_<sourceId>_<messageId>}`다.
- 수집 상태는 `users/{USER_UID}/integrations/telegram_public_feed`에 저장한다.
- `data.js`에 `listNewsfeedItems`, `getTelegramPublicFeedStatus`를 추가했다.
- `render-newsfeed.js`, `styles/80-newsfeed.css`, `index.html`, `app.js`에 뉴스피드 탭 UI를 추가했다.
- `scripts/build-pages.mjs`와 `scripts/verify-project.mjs`에 새 파일/계약 검증을 추가했다.
- `docs/design-system.md`, `docs/SETUP.md`, `docs/deployment.md`, `README.md`를 갱신했다.

## 검증

- `node --check` 대상:
  - `utils/telegram-sources.js`
  - `api/_lib/telegram-public-feed.js`
  - `scripts/telegram-feed-sync.mjs`
  - `render-newsfeed.js`
  - `data.js`
  - `app.js`
  - `scripts/verify-project.mjs`
  - `scripts/build-pages.mjs`
- `node scripts/telegram-feed-sync.mjs --dry-run --limit-sources=2 --max-messages=3`
  - `report-gallery`, `sunstudy` preview fetch 성공
  - 총 6개 메시지 파싱
  - 실패 0
- `npm.cmd run verify`
  - 통과: `verify-project passed (91 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` Pages artifact 생성
- Playwright QA harness:
  - 실제 `render-newsfeed.js`와 실제 CSS를 로드하고 `data.js`만 fixture로 대체
  - 375px, 430px에서 뉴스피드 카드 3건 렌더
  - 콘솔 오류 없음
  - 가로 overflow 없음
  - 본문 5줄 clamp 확인
  - 증거:
    - `.omo/evidence/2026-07-04-telegram-newsfeed/newsfeed-375.png`
    - `.omo/evidence/2026-07-04-telegram-newsfeed/newsfeed-430.png`
  - 실제 `index.html` markup에서 app script만 no-op 처리해 375px 하단 nav 확인
  - 5개 버튼 동일 폭, 가로 overflow 없음
  - 증거: `.omo/evidence/2026-07-04-telegram-newsfeed/bottom-nav-375.png`

## not verified yet

- production GitHub Pages 배포는 수행하지 않았다.
- GitHub Actions `telegram_public_feed` job의 실제 repository 실행은 아직 확인하지 않았다.
- 실제 Firestore 쓰기는 `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`가 있는 Actions/로컬 환경에서 실행해야 확인할 수 있다.
- 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 로그인 후 `뉴스피드` 탭에 실제 Telegram 수집 글이 뜨는지 아직 확인하지 않았다.
- 이 세션의 Playwright UI 확인은 Firebase 로그인 없는 harness 검증이다.
