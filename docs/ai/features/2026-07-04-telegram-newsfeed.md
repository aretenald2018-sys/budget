# 텔레그램 뉴스피드 탭 계획

## 요청 원문

`/goal 뉴스피드탭을 새로 만들어서 아래 텔레그램 메신저들이 발송하는 메시지들을 뉴스피드형식으로 받아볼 수 있는지? 너가 직접 텔래그램 채널들을 추가해서 메시지를 수령해서 가계부 앱 뉴스피드 채널에 받아오는것까지 해야하는데, 가능하면 구현하고 불가능하면 대안제시`

## 이해한 내용

- 목표:
  - 가계부 앱에 `뉴스피드` 탭을 추가한다.
  - 지정된 Telegram 채널/그룹/봇 메시지를 시간순 feed item으로 저장하고 앱에서 읽는다.
  - 가능한 경우 수집까지 자동화한다.
- 비목표:
  - Telegram 개인 계정 세션, Bot token, `api_id/api_hash`를 browser code, `localStorage`, Android APK에 넣지 않는다.
  - 임의의 공개/비공개 Telegram 채널에 Codex가 직접 가입하거나 관리자로 추가하지 않는다.
  - 뉴스피드 메시지를 거래로 자동 변환하거나 Gemini로 분석하지 않는다. 첫 단계는 feed display다.
  - 기존 `raw_messages` 휴대폰 알림 수집 경로를 재활성화하지 않는다.
- 사용자 흐름:
  - 사용자는 앱 하단 또는 설정 진입점에서 `뉴스피드` 탭을 연다.
  - 각 항목은 출처, 발송 시각, 제목/본문, 링크, 첨부 요약, 수집 상태를 보여준다.
  - Telegram 수집 job이 새 메시지를 Firestore에 저장하면 운영 GitHub Pages UI에서 최신순으로 보인다.
- 데이터 가정:
  - feed item 저장 위치는 `users/{USER_UID}/newsfeed_items/{id}`로 둔다.
  - Telegram source 상태와 polling offset은 `users/{USER_UID}/integrations/telegram` 문서에 둔다.
  - browser 읽기/쓰기 함수는 새로 추가하더라도 `data.js`를 경유한다.
  - server/GitHub Actions 쓰기는 `api/_lib/firebase-admin.js`를 경유한다.
- 열려 있는 질문:
  - 사용자가 말한 "아래 텔레그램 메신저들" 목록이 현재 대화에 없다.
  - 각 source가 사용자가 관리자인 채널/그룹인지, 공개 채널인지, 개인 계정으로만 접근 가능한 채팅인지 확인이 필요하다.
  - 수집 방식은 아래 권장안 A를 기본으로 잡되, 실행 전 사용자 확인이 필요하다.

## 가능성 판단

- 조건부 가능:
  - Telegram Bot API는 `Update.channel_post`와 `Update.message` 형태로 새 메시지를 받을 수 있다.
  - 공식 문서 기준 Bot API update는 `getUpdates` long polling 또는 webhook으로 받을 수 있고, pending update는 24시간을 넘겨 보관되지 않는다.
  - Telegram bot은 private chat 메시지와 bot이 member인 channel 메시지를 받을 수 있다. group은 privacy mode와 admin/member 권한에 따라 보이는 메시지가 제한된다.
- 지금 이 세션에서 end-to-end 수집까지 완료할 수 없는 이유:
  - 대상 Telegram 채널/그룹 목록이 제공되지 않았다.
  - Codex는 사용자의 Telegram 계정으로 로그인하거나 채널에 직접 가입할 권한이 없다.
  - Bot token, 채널 관리자 권한, GitHub/Vercel secret 등록이 필요하다.
- 직접 채널 추가 불가:
  - 내가 임의 Telegram 채널에 bot을 추가하거나 사용자 계정으로 가입하는 작업은 인증과 권한이 없으므로 불가능하다.
  - 사용자가 채널 관리자라면 bot을 직접 추가하거나, 메시지를 자동 전달하는 private source group을 만들어 bot을 member/admin으로 넣는 방식은 가능하다.

## 권장 접근

- 권장안 A: Telegram Bot API + GitHub Actions polling
  - 사용자가 BotFather로 bot을 만든다.
  - 사용자가 대상 채널/그룹 또는 `Budget Feed Source` private group에 bot을 member/admin으로 추가한다.
  - GitHub Secrets에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, 기존 `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`를 둔다.
  - `.github/workflows/budget-backend.yml`에 10-15분 간격 Telegram feed sync job을 추가한다.
  - 새 `scripts/telegram-feed-sync.mjs`가 `getUpdates`를 호출하고, offset을 Firestore에 저장하고, dedupe 후 `newsfeed_items`에 쓴다.
  - 장점: 현재 프로젝트의 GitHub Actions secret 모델과 잘 맞고 browser에 secret이 없다.
  - 제한: bot이 볼 수 있는 새 메시지만 가능하다. 과거 메시지 backfill이나 bot이 들어갈 수 없는 채널은 불가능하다.
- 대안 B: Telegram webhook + Vercel API
  - `api/telegram-webhook.js`를 만들고 Telegram `setWebhook`으로 HTTPS endpoint를 연결한다.
  - 장점: polling보다 빠르다.
  - 제한: Vercel secret 설정, webhook secret 검증, endpoint 운영 상태 확인이 필요하다.
  - 이 프로젝트는 GitHub Actions backend jobs가 이미 있으므로 첫 구현 기본값으로는 A가 더 작고 안전하다.
- 대안 C: MTProto user client
  - 사용자 계정 기반 `api_id`, `api_hash`, phone login/session string으로 Telegram client를 운영한다.
  - 장점: 사용자 계정이 접근 가능한 공개/비공개 채널을 읽을 수 있다.
  - 제한: 개인 계정 session secret 보관, Telegram API Terms 준수, 계정 제한/관찰 리스크가 있다.
  - 이 방식은 기본 구현에서 제외하고, 사용자가 명시 승인할 때만 별도 ADR/계획으로 다룬다.
- 대안 D: Android local Telegram notification capture
  - 휴대폰 Telegram 알림이 뜨는 메시지만 Android `NotificationListenerService`로 로컬 큐에 저장한다.
  - 장점: Telegram API secret이 필요 없다.
  - 제한: 휴대폰에 실제 알림이 떠야 하며, 과거 메시지와 muted channel은 수집되지 않는다.
  - 현재 Android parser는 결제 알림 중심이므로 뉴스피드용 Telegram parser/queue는 별도 slice가 필요하다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문:
  - source를 Bot API로 받을 수 있는 채널/그룹으로 제한할 것인가, 개인 Telegram 계정 세션이 필요한 임의 채널까지 포함할 것인가?
- 추천 답변:
  - 권장안 A `Telegram Bot API + GitHub Actions polling`으로 시작한다.
  - 사용자가 직접 bot을 대상 채널/그룹 또는 private source group에 추가한다.
  - 내가 구현하는 범위는 앱 뉴스피드 탭, Firestore feed boundary, GitHub Actions polling 수집, 검증 스크립트다.
- 사용자 답변:
  - 공개 preview가 확인된 source만 대상으로 구현 요청.
  - 확인 필요/로그인 필요 source는 제외.
  - 새 뉴스가 올라오면 자동 업데이트되기를 요청.
- 확정된 결정:
  - browser/APK에 Telegram secret을 넣지 않는다.
  - Codex가 사용자 Telegram 계정으로 직접 가입/추가하는 방식은 하지 않는다.
  - 기본 구현은 공개 `t.me/s/<handle>` preview polling으로 둔다.
  - GitHub Actions schedule 주기 안에서 최신화한다.
- 남은 가정:
  - Telegram 공개 preview HTML 구조가 현재처럼 유지된다.
  - GitHub Actions schedule 지연이 발생하면 뉴스피드 반영도 지연될 수 있다.

## 결정 기록

- 결정: 첫 구현은 Bot API polling으로 계획한다.
- 이유: 현재 프로젝트가 GitHub Actions + Firebase Admin secret 모델을 이미 사용하고, Telegram secret을 browser에 노출하지 않아도 된다.
- 되돌릴 수 있는가: 가능. polling script/workflow와 `newsfeed_items` collection은 기존 거래/receipt 데이터와 분리된다.

- 결정 변경(2026-07-04): 첫 구현은 공개 Telegram web preview polling으로 진행한다.
- 이유: 사용자가 제공한 채널 중 `https://t.me/s/<handle>` 공개 프리뷰가 열리는 채널들이 확인됐고, 대부분은 사용자가 관리자가 아니므로 Bot API bot을 채널에 추가할 수 없다. 공개 프리뷰 수집은 Telegram 개인 계정 세션, Bot token, MTProto secret 없이 GitHub Actions에서 실행할 수 있다.
- 적용 범위: 확인 필요/로그인 필요/표시명 불일치 채널은 제외하고, 공개 프리뷰가 확인된 채널만 기본 소스로 등록한다.
- 수집 지연: Telegram이 새 글 webhook을 제공하지 않는 공개 preview 방식이므로 “글이 올라올 때마다”는 GitHub Actions schedule 주기와 사용자의 수동 새로고침 주기 안에서 최신화하는 것으로 구현한다.
- 되돌릴 수 있는가: 가능. `newsfeed_items` 저장 schema는 Bot API/MTProto/Android notification capture로 바꾸더라도 유지할 수 있다.

- 결정: MTProto user client는 기본 구현에서 제외한다.
- 이유: 개인 Telegram 계정 session secret과 Terms 리스크가 있고, 사용자의 명시 승인이 필요한 외부 의존성이다.
- 되돌릴 수 있는가: 가능. 별도 ADR 승인 전까지 구현하지 않는다.

- 결정: Android notification capture는 대안으로만 둔다.
- 이유: 사용자가 "채널 메시지를 받아오는" 목표를 말했으므로 서버 수집 feed가 더 직접적이다. Android 알림 방식은 기기 상태/알림 설정에 종속된다.
- 되돌릴 수 있는가: 가능. Android 수집 경로와 server feed는 분리 가능하다.

## 실행 슬라이스

### 슬라이스 1: 뉴스피드 탭과 Firestore 읽기 경계

- 목표:
  - 공개 Telegram 수집 결과를 앱에서 볼 수 있는 `뉴스피드` 탭과 Firestore 읽기 경계를 만든다.
- 범위:
  - `index.html`에 `tab-newsfeed`와 진입 버튼을 추가한다.
  - `app.js`에 `newsfeed` tab title, renderer, header context를 추가한다.
  - `render-newsfeed.js`를 추가해 최신순 feed list, empty state, loading state, error state, 수동 새로고침을 구현한다.
  - `data.js`에 `listNewsfeedItems({ max, sourceId, after })`를 추가한다.
  - 필요한 CSS를 기존 style split에 맞춰 추가하고 cache-busting query string을 갱신한다.
  - `scripts/verify-project.mjs`에 새 tab, renderer, cache token 계약을 추가한다.
- 예상 수정 파일:
  - `index.html`
  - `app.js`
  - `render-newsfeed.js`
  - `data.js`
  - `style.css`
  - `styles/00-foundation.css` 또는 새/기존 tab 관련 CSS 파일
  - `scripts/verify-project.mjs`
- 수정하지 말 것:
  - MTProto user session.
  - Telegram 계정 로그인 자동화.
  - 거래 자동 생성/분류.
  - Android notification parser.
- 구현 메모:
  - 하단 nav는 현재 4개 버튼이라 `뉴스피드`를 추가하면 밀도가 바뀐다. 모바일 overflow 없이 보이도록 label과 icon 크기를 검증한다.
  - feed item schema는 `sourceType`, `sourceId`, `sourceTitle`, `messageId`, `postedAt`, `receivedAt`, `text`, `title`, `url`, `attachments`, `raw` 최소 필드를 사용한다.
  - Firestore query는 `postedAt desc` 기본값으로 두고, index가 필요하면 `firestore.indexes.json`에 추가한다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - 운영 배포 후 `Deploy GitHub Pages` workflow 성공 확인.
  - 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 로그인 후 `뉴스피드` 탭 진입.
  - 빈 상태와 fixture feed item 표시를 실제 UI에서 확인한다.
- 완료 증거:
  - production URL HTTP 200.
  - `뉴스피드` 탭이 열리고 empty/feed/error state가 깨지지 않는다.
  - 새 Firestore reads/writes가 `data.js` 경계를 통과한다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 1 `뉴스피드 탭과 Firestore 읽기 경계`와 공개 preview polling 수집을 함께 실행한다. 확인 필요/로그인 필요 채널은 제외한다.

### 슬라이스 2: 공개 Telegram preview polling 수집 job

- 목표:
  - 공개 `t.me/s/<handle>` preview에서 새 Telegram 메시지를 수집해 `newsfeed_items`에 저장한다.
- 범위:
  - `api/_lib/telegram-public-feed.js`를 추가해 공개 preview HTML fetch, message normalization, dedupe key 생성을 구현한다.
  - 공개 프리뷰가 확인된 채널 목록을 코드 상수로 둔다.
  - `scripts/telegram-feed-sync.mjs`를 추가한다.
  - Firestore Admin 쓰기는 `firebase-admin.js`를 경유한다.
  - `.github/workflows/budget-backend.yml`에 `telegram_public_feed` mode 또는 별도 job을 추가한다.
  - source별 마지막 수집 상태는 `users/{USER_UID}/integrations/telegram_public_feed`에 저장한다.
  - 필요한 문서/검증을 추가한다. Telegram secret은 필요하지 않다.
- 예상 수정 파일:
  - `api/_lib/telegram-public-feed.js`
  - `scripts/telegram-feed-sync.mjs`
  - `.github/workflows/budget-backend.yml`
  - `docs/SETUP.md` 또는 `docs/deployment.md`
  - `scripts/verify-project.mjs`
- 수정하지 말 것:
  - browser bundle에 Telegram secret 노출.
  - MTProto user client/session 구현.
  - 메시지를 거래로 변환.
- 구현 메모:
  - doc id는 `telegram_public_${sourceId}_${messageId}`처럼 안정적으로 만든다.
  - schedule은 GitHub Actions 최소 주기 제약을 고려해 5-15분 단위로 둔다.
  - 공개 preview HTML 구조가 바뀌면 실패할 수 있으므로 source별 오류를 상태 문서에 남긴다.
  - 기존 item과 같은 doc id는 merge/upsert해 duplicate를 만들지 않는다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; node scripts/telegram-feed-sync.mjs --dry-run --limit-sources=2`
  - GitHub Actions `Budget Backend Jobs`에서 Telegram public feed mode 수동 실행.
  - Firestore `newsfeed_items`에 expected source/message id가 저장되는지 확인.
- 완료 증거:
  - 공개 preview에서 확인되는 새 메시지가 `newsfeed_items`에 저장된다.
  - 같은 preview 재실행이 duplicate item을 만들지 않는다.
  - Telegram secret이 browser/APK에 포함되지 않는다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 2 `공개 Telegram preview polling 수집 job`만 실행한다. MTProto와 Android notification capture는 구현하지 않는다.

### 슬라이스 3: 뉴스피드 운영 UI 연결과 수집 검증

- 목표:
  - 실제 Telegram 수집 결과를 운영 뉴스피드 탭에서 확인한다.
- 범위:
  - `render-newsfeed.js`에 source filter, refresh action, Telegram permalink 표시를 추가한다.
  - 수집 상태 카드를 설정 또는 뉴스피드 상단에 표시한다.
  - `TELEGRAM_ALLOWED_CHAT_IDS` 확인용 로그/검증 출력을 문서화한다.
  - 필요하면 Firestore index를 추가한다.
- 예상 수정 파일:
  - `render-newsfeed.js`
  - `data.js`
  - `styles/*`
  - `firestore.indexes.json`
  - `docs/SETUP.md`
  - `scripts/verify-project.mjs`
- 수정하지 말 것:
  - 거래 자동화.
  - MTProto user session.
  - Telegram channel 가입 자동화.
- 구현 메모:
  - 새 메시지 도착 여부는 GitHub Actions schedule과 user-triggered refresh 또는 tab render refresh로 갱신한다. Telegram 공개 preview 방식에는 webhook이 없으므로 true push realtime은 첫 구현에서 제외한다.
  - text-only 메시지, link 메시지, photo caption 메시지를 각각 표시한다.
- 검증 방법:
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - GitHub Pages 배포 workflow 성공.
  - test source에 새 Telegram 메시지 발송 후 Actions sync 실행.
  - 운영 URL `https://aretenald2018-sys.github.io/budget/`에서 뉴스피드 탭에 메시지가 표시되는지 확인.
- 완료 증거:
  - 실제 Telegram source에서 보낸 새 메시지가 운영 뉴스피드 탭에 최신순으로 보인다.
  - source allowlist, duplicate 방지, empty/error state가 동작한다.
- 다음 세션 시작 프롬프트:
  - 이 계획의 슬라이스 3 `뉴스피드 운영 UI 연결과 수집 검증`만 실행한다.

### 슬라이스 4: 리뷰

- 목표:
  - Telegram 뉴스피드가 계획 범위와 보안 경계를 지켰는지 리뷰한다.
- 범위:
  - 계획 문서와 변경 파일 대조.
  - browser/APK secret 노출 여부 확인.
  - Firestore path, dedupe, polling offset, workflow schedule, cache-bust 확인.
  - 운영 Pages UI와 GitHub Actions 수집 증거 확인.
- 예상 수정 파일:
  - `docs/ai/reviews/2026-07-04-telegram-newsfeed-review.md`
  - `docs/ai/NEXT_ACTION.md`
- 수정하지 말 것:
  - 새 기능 추가.
  - MTProto 대안 구현.
- 검증 방법:
  - 리뷰 중 발견한 문제를 재현 가능한 항목으로 기록한다.
  - 문제가 있으면 다음 상태를 `ready_for_fix`로 둔다.
- 완료 증거:
  - 문제가 없으면 계획 상태를 `complete`로 둔다.
  - 문제가 있으면 focused fix 범위와 검증 방법이 명확하다.
- 다음 세션 시작 프롬프트:
  - 이 계획과 직전 실행 변경 파일을 읽고 리뷰한다. 새 기능은 구현하지 않는다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 보안 경계, Telegram secret 노출, Firestore path, dedupe/offset, GitHub Actions schedule, cache-bust, 운영 Pages UI 검증 누락을 우선 리뷰한다. 리뷰 중에는 새 기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: `needs_user_decision`
- 다음 자동 상태: `needs_user_decision`
- 다음 액션: 사용자가 source 방식을 선택하고 대상 Telegram source 목록/권한 상태를 제공하면 슬라이스 1부터 실행한다.
- 차단 질문: 권장안 A `Bot API + GitHub Actions polling`으로 진행할까요? 진행하려면 target channel/group 목록과 bot을 추가할 수 있는 권한 여부가 필요합니다.
