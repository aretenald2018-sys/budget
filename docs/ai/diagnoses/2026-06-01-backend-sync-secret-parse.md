# Backend sync 실행 차단 진단

## 배경

네이버페이 skipped raw 복구 커밋 `7587ebf` 배포 후 `Budget Backend Jobs`를 `mode=sync`로 수동 실행했다.

## 실패 로그

- Run: `26729045061`
- 실패 위치: `Poll Gmail and process pending raw messages`
- 출력:
  - `raw.error`: `Bad control character in string literal in JSON at position 156 (line 1 column 157)`
  - `recipes.error`: `Bad control character in string literal in JSON at position 156 (line 1 column 157)`
  - `gmail.error`: `Bad Request`

## 원인 판단

- `raw`와 `recipes`는 모두 `api/_lib/firebase-admin.js`의 admin 초기화가 필요하다.
- 현재 `firebase-admin.js`는 `JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}')`를 직접 호출한다.
- GitHub secret의 service account JSON에 private key 줄바꿈이 raw newline으로 들어오면 JSON 문자열 내부 control character가 되어 `JSON.parse()`가 실패한다.
- Gmail `Bad Request`는 별도 Gmail API 응답이며, Firestore admin 초기화 실패와 독립적으로 남아 있다.

## 수정 방향

- `api/_lib/firebase-admin.js`에 service account env parser를 분리한다.
- 표준 JSON은 그대로 파싱하고, 문자열 내부 raw CR/LF가 포함된 JSON은 문자열 내부 줄바꿈만 `\n` escape로 보정한 뒤 다시 파싱한다.
- `private_key`에 이중 escape된 `\\n`이 남아 있으면 실제 newline으로 정규화한다.
- Gmail API `Bad Request`는 이번 SMS raw 복구의 직접 차단이 아니므로 코드 변경 범위에 포함하지 않고 운영 확인 항목으로 남긴다.
