# 작업트리 정리 계획

## 요청

- 목표: production 검증/배포 때마다 `unrelated dirty worktree`가 차단 사유가 되지 않도록 현재 로컬 변경을 정리한다.
- 기준: 사용자 변경을 무작정 삭제하지 않고, 커밋 대상과 실행 산출물/생성물 대상을 분리한다.

## 분류

### 커밋 대상

- 실제 소스 변경:
  - `.gitignore`
  - `firestore.rules`
  - `modal-manager.js`
  - `scripts/github-recipe-sync.mjs`
  - `scripts/reconcile-toss-july-records.mjs`
- durable AI 문서:
  - `docs/ai/diagnoses/*.md`
  - `docs/ai/features/*.md`
  - `docs/ai/executions/*.md`
  - `docs/ai/reviews/*.md`
  - `docs/adr/2026-07-02-native-android-notification-ingest.md`

### ignore 대상

- `.codex-remote-attachments/`
- `docs/ai/inbox/`, `docs/ai/outbox/`, `docs/ai/audit/`, `docs/ai/handoffs/`
- `reports/`
- `budget-calendar-*.csv`
- `docs/ai/DISCORD_CODEX_INDEX.md`

## 정리 원칙

1. 최신 `main`보다 오래된 CSS/cache-bust 잔여 변경은 `HEAD` 상태로 복구한다.
2. 실행 산출물은 삭제하지 않고 `.gitignore`로 숨겨 재발을 막는다.
3. 커밋 전 `git diff --check`, `node --check`, `npm.cmd run verify`, `npm.cmd run pages:build`를 실행한다.
4. 커밋/푸시 후 GitHub Pages workflow와 production HTTP 상태를 확인한다.

## 검증 기준

- `git status --short`가 clean이어야 한다.
- `npm.cmd run verify`와 `npm.cmd run pages:build`가 통과해야 한다.
- push 후 `origin/main`이 로컬 `main`과 일치해야 한다.
- GitHub Pages 배포 workflow가 성공하고 production URL이 HTTP 200이어야 한다.
