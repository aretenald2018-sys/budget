# Telegram 뉴스피드 공개 Preview 구현 리뷰

## 판정

- 코드 리뷰: 통과
- 운영 검증: not verified yet
- 이유: 커밋/푸시 및 GitHub Actions 실제 실행은 아직 수행하지 않았다.

## 확인한 내용

- Telegram 수집은 `t.me/s/<handle>` 공개 preview polling만 사용한다.
- Telegram Bot token, MTProto session, Chrome 로그인 쿠키, Telegram 계정 비밀번호를 코드/브라우저 저장소에 넣지 않았다.
- 서버 쓰기는 `api/_lib/firebase-admin.js` 경계를 통해 `users/{USER_UID}/newsfeed_items`와 `users/{USER_UID}/integrations/telegram_public_feed`에만 수행한다.
- 브라우저는 `data.js` 경계를 통해 `newsfeed_items`와 수집 상태를 읽기만 한다.
- 메시지 문서 id는 `telegram_public_${sourceId}_${messageId}`라서 재수집 중복 저장을 피한다.
- source별 `latestMessageId`를 저장해 다음 실행부터 새 메시지만 저장한다.
- 공개 preview가 깨진 링크나 비정상 HTML 엔티티를 포함해도 해당 링크만 버리고 수집이 계속되도록 파서를 보강했다.
- `확인필요`, `로그인필요`, 표시명 불일치 source는 기본 73개 source 목록에 넣지 않았다.
- GitHub Actions는 15분 schedule과 `workflow_dispatch mode=telegram` 수동 실행을 제공한다.
- UI는 `뉴스` 하단 탭, 카테고리 필터, 새로고침 버튼, source/status meta, Telegram 원문 링크를 제공한다.
- `index.html`, `app.js`, `style.css`, `data.js` import cache-bust를 갱신했다.

## 검증

- `node --check api/_lib/telegram-public-feed.js` 통과
- `npm.cmd run verify` 통과: `verify-project passed (91 JS files checked).`
- `npm.cmd run pages:build` 통과: `_site` artifact 생성
- `node scripts/telegram-feed-sync.mjs --dry-run --limit-sources=2 --max-messages=3` 통과: 2개 source, 6개 메시지, 실패 0
- `git diff --check` 통과
- Playwright harness 시각 검증 통과:
  - 375px/430px 뉴스피드 fixture 렌더 콘솔 오류 없음
  - 카드 3개 렌더
  - 가로 overflow 없음
  - 본문 5줄 clamp 확인
  - 실제 `index.html` 하단 nav 375px에서 5개 버튼 동일 폭, overflow 없음

## 남은 운영 검증

- 의도한 변경 파일만 커밋하고 `main`에 푸시해야 GitHub Pages 배포가 시작된다.
- GitHub Actions `Budget Backend Jobs`의 `telegram_public_feed` job 실제 실행 성공을 확인해야 한다.
- Firestore에 실제 `newsfeed_items` 문서가 생성되는지 확인해야 한다.
- 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 로그인 후 `뉴스` 탭에 실제 수집 글이 보이는지 확인해야 한다.
