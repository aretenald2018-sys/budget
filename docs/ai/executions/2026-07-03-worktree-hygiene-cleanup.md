# 작업트리 정리 실행 기록

## 범위

- 계획 문서: `docs/ai/features/2026-07-03-worktree-hygiene-cleanup.md`
- 목표: production 검증/배포를 막던 dirty worktree를 커밋 가능한 변경과 생성물로 분리한다.

## 변경 내용

- `.gitignore`
  - Codex 첨부, Discord inbox/outbox/audit/handoff, reports, 월별 CSV export를 local runtime artifact로 분류했다.
- stale UI/CSS 잔여 변경 복구
  - `render-home.js`, `style.css`, `styles/20-records.css`, `styles/50-cart-detail.css`, `styles/60-urge.css`의 반쪽짜리 cache-bust/CSS 변경은 최신 `HEAD` 상태로 복구했다.
- `firestore.rules`
  - 현재 아키텍처에서 쓰지 않는 `mailboxes/{mailboxId}/raw_messages/{rawId}` 클라이언트 read/update rule을 제거했다.
- `modal-manager.js`
  - 모달 동적 import cache-bust를 `20260703-tx-detail-reward-rate`로 갱신했다.
  - 일부 모달 import 실패가 전체 모달 주입을 막지 않도록 개별 실패 로그와 `insertAdjacentHTML` 주입으로 정리했다.
  - 같은 모달이 open stack에 중복으로 쌓이지 않게 했다.
- `scripts/github-recipe-sync.mjs`
  - Firestore quota exhaustion만 scheduled recipe job에서 soft skip 처리하고 exit `0`으로 종료하게 했다.
- `scripts/reconcile-toss-july-records.mjs`
  - 2026-07-01~03 Toss 대조/보정에 사용한 dry-run 기본 스크립트를 추적 대상으로 남겼다.
- 문서
  - 이전 작업의 `docs/ai/diagnoses`, `features`, `executions`, `reviews`, ADR 문서를 추적 대상으로 남겼다.

## 검증

- `git diff --check`: 통과
- `node --check modal-manager.js`: 통과
- `node --check scripts/github-recipe-sync.mjs`: 통과
- `node --check scripts/reconcile-toss-july-records.mjs`: 통과
- secret value scan:
  - `AIza...`, private key header, Google access token, long bearer token 패턴 없음
- `npm.cmd run verify`
  - 통과: `verify-project passed (87 JS files checked).`
- `npm.cmd run pages:build`
  - 통과: `_site` 생성 완료

## 배포 전 남은 단계

- 이 정리 변경을 커밋하고 `main`에 push한다.
- GitHub `Validate`와 `Deploy GitHub Pages` workflow가 성공하는지 확인한다.
- production URL `https://aretenald2018-sys.github.io/budget/`이 HTTP 200인지 확인한다.
