# Backend sync service account 파싱 보강 리뷰

## 범위

- 계획 문서: `docs/ai/features/2026-06-01-backend-sync-secret-parse.md`
- 진단 문서: `docs/ai/diagnoses/2026-06-01-backend-sync-secret-parse.md`
- 실행 슬라이스: 슬라이스 1 - Firebase service account env parser 보강
- 변경 대상: `api/_lib/firebase-admin.js`, `docs/ai/NEXT_ACTION.md`, 계획/진단 문서

## 리뷰 결과

차단 이슈 없음.

## 확인한 동작

- 표준 `FIREBASE_SERVICE_ACCOUNT` JSON은 기존처럼 바로 `JSON.parse()` 경로로 처리된다.
- GitHub secret에 private key raw newline이 들어간 경우, JSON 문자열 내부 줄바꿈만 escape한 뒤 재파싱한다.
- `private_key`의 `\\n`은 실제 newline으로 정규화되어 Firebase Admin `cert()` 입력에 맞는다.
- invalid JSON은 `FIREBASE_SERVICE_ACCOUNT env JSON 파싱 실패` 메시지를 낸다.

## 검증

- service account parser fixture 스모크 3종 통과
- `node --check api/_lib/firebase-admin.js`
- `node --check api/_lib/auto-ingest.js`
- `npm.cmd run verify`
- `git diff --check`

## 남은 운영 확인

- 배포 후 `Budget Backend Jobs` sync를 다시 실행해 raw/recipes의 service account 파싱 오류가 사라지는지 확인한다.
- Gmail `Bad Request`는 별도 운영 이슈로 남을 수 있다.
