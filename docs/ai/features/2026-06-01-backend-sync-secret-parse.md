# Backend sync service account 파싱 보강 계획

## 배경

네이버페이 skipped raw 복구 코드는 배포됐지만, 수동 `Budget Backend Jobs` sync가 `FIREBASE_SERVICE_ACCOUNT` JSON 파싱 오류로 raw 재처리 단계에 들어가지 못했다.

## 슬라이스 1: Firebase service account env parser 보강

### 범위

- `api/_lib/firebase-admin.js`
  - service account env 파싱을 함수로 분리한다.
  - GitHub secret에 raw newline이 포함된 private key JSON도 파싱 가능하게 한다.
  - `private_key`의 `\\n`은 실제 newline으로 정규화한다.
- `docs/ai/NEXT_ACTION.md`
  - 실행/리뷰 상태를 갱신한다.

### 제외

- GitHub secret 값을 직접 조회하거나 변경하지 않는다.
- Gmail `Bad Request`는 별도 운영 확인 항목으로 두고 이번 슬라이스에서 수정하지 않는다.
- 네이버페이 parser나 raw 복구 필터는 추가 변경하지 않는다.

### 검증

- 표준 escaped JSON service account fixture가 파싱되는지 확인한다.
- raw newline이 private key 문자열 내부에 들어간 JSON fixture가 파싱되는지 확인한다.
- invalid JSON은 명확한 `FIREBASE_SERVICE_ACCOUNT env JSON 파싱 실패` 오류를 내는지 확인한다.
- `node --check api/_lib/firebase-admin.js`
- `npm.cmd run verify`
- `git diff --check`

## 다음 실행 시작점

`docs/ai/features/2026-06-01-backend-sync-secret-parse.md`의 슬라이스 1을 실행한다.

## 실행 결과

- `api/_lib/firebase-admin.js`에서 `FIREBASE_SERVICE_ACCOUNT` 파싱을 `parseFirebaseServiceAccountEnv()`로 분리했다.
- 표준 escaped JSON을 먼저 파싱하고, 실패하면 JSON 문자열 내부의 raw CR/LF만 `\n` escape로 보정해 다시 파싱한다.
- `private_key`의 남은 `\\n`은 실제 newline으로 정규화한다.
- 검증:
  - 표준 escaped JSON fixture 파싱 통과
  - private key 문자열 내부 raw newline JSON fixture 파싱 통과
  - invalid JSON 오류 메시지 확인
  - `node --check api/_lib/firebase-admin.js`
  - `node --check api/_lib/auto-ingest.js`
  - `npm.cmd run verify`
  - `git diff --check`
