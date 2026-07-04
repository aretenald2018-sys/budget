# 다음 자동 액션

## 현재 상태

- 상태: `needs_user_decision`
- 계획 문서: `docs/ai/features/2026-07-04-telegram-newsfeed.md`
- 실행 문서: `docs/ai/executions/2026-07-04-telegram-newsfeed-public-preview.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-04-telegram-newsfeed-public-preview-review.md`
- 현재 단계: 공개 Telegram preview 기반 뉴스피드 구현/리뷰 완료, 커밋/푸시/운영 검증 결정 대기
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
- 다음 액션:
  - 사용자가 커밋/푸시/배포 진행을 명시하면 의도한 변경 파일만 커밋하고 `main`에 푸시한 뒤 GitHub Pages와 `telegram_public_feed` Actions 실행을 확인한다.
- 차단 사유:
  - 커밋/푸시는 명시 요청 없이는 수행하지 않는 규칙이 있어 production GitHub Pages 배포는 아직 수행하지 않았다.
  - GitHub Actions `telegram_public_feed` 실제 repository 실행과 Firestore 쓰기 검증은 아직 수행하지 않았다.
  - 운영 URL에서 로그인 후 실제 수집 글 표시 확인은 아직 수행하지 않았다.

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
- `scripts/verify-project.mjs`
- `style.css`
- `styles/80-newsfeed.css`
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
