# 다음 자동 액션

## 현재 상태

- 상태: `complete`
- 완료 계획 문서: `docs/ai/features/2026-07-04-telegram-newsfeed-backfill-pagination.md`
- 실행 문서: `docs/ai/executions/2026-07-04-telegram-newsfeed-backfill-pagination.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-04-telegram-newsfeed-backfill-pagination-review.md`
- 현재 단계: Telegram 뉴스피드 6월 1일 이후 누적 수집과 `더 보기` 페이지네이션 구현 완료
- 마지막 완료:
  - 공개 Telegram preview `?before=<messageId>` pagination으로 `2026-06-01T00:00:00+09:00` 이후 메시지를 backfill할 수 있게 했다.
  - 정적 snapshot을 최신 240개 제한에서 cutoff 이후 누적 stack으로 바꿨다.
  - `public/newsfeed/telegram-public-feed.json`을 source 71개, item 33084개, `truncated=false`, `backfillComplete=true` 상태로 재생성했다.
  - 뉴스피드 탭에 첫 page 60건과 `더 보기` append pagination을 추가했다.
  - `npm.cmd run verify`와 `npm.cmd run pages:build`를 통과했다.
- 다음 액션:
  - production deploy 후 GitHub Pages workflow 성공과 운영 UI의 `뉴스 보기` 첫 page, `더 보기`, category reset을 확인한다.
- 남은 제약:
  - 확인 필요/로그인 필요 source는 추가하지 않는다.
  - Telegram Chrome 로그인 자동화, MTProto user session, Bot API 전환, Android notification capture는 이번 범위가 아니다.
  - production URL은 `https://aretenald2018-sys.github.io/budget/`이다.

## 최근 처리한 요청

- 요청: `6월 1일부터 뉴스피드를 수집해서 스택해두고, 페이지네이션도 해둘 것.`
- 결과:
  - 공개 preview로 접근 가능한 Telegram source만 대상으로 backfill과 누적 snapshot을 구현했다.
  - schedule job은 가볍게 `maxPages=1` 증분 수집을 유지하고, 수동 workflow `backfill` 입력에서 deep pagination을 수행하게 했다.
  - 열린 뉴스피드 탭은 기존 2분 자동 갱신 경계를 유지하며, 사용자가 `더 보기`로 펼친 목록을 최대한 보존한다.

## 리뷰 대상 변경 파일

- `.github/workflows/budget-backend.yml`
- `api/_lib/telegram-public-feed.js`
- `app.js`
- `data.js`
- `index.html`
- `modals/account-modal.js`
- `modals/category-modal.js`
- `modals/tx-edit-modal.js`
- `public/newsfeed/telegram-public-feed.json`
- `render-finance.js`
- `render-newsfeed.js`
- `render-report.js`
- `render-review.js`
- `render-settings.js`
- `render-settle.js`
- `render-tx.js`
- `scripts/telegram-feed-static.mjs`
- `scripts/telegram-feed-sync.mjs`
- `scripts/verify-project.mjs`
- `style.css`
- `styles/80-newsfeed.css`
- `urge/render-mindbank.js`
- `urge/render-urge-alternatives.js`
- `urge/render-urge-input.js`
- `urge/render-urge-result.js`
- `urge/render-wine-cellar.js`
- `utils/telegram-sources.js`
- `docs/ai/features/2026-07-04-telegram-newsfeed-backfill-pagination.md`
- `docs/ai/executions/2026-07-04-telegram-newsfeed-backfill-pagination.md`
- `docs/ai/reviews/2026-07-04-telegram-newsfeed-backfill-pagination-review.md`
- `docs/ai/NEXT_ACTION.md`

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
