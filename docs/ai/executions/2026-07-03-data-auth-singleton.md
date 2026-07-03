# data.js 인증 싱글턴 실행 기록

## 실행 범위

`docs/ai/features/2026-07-03-data-auth-singleton.md`의 Slice 1을 실행했다.

## 변경 내용

- `index.html`의 `app.js` cache-bust를 `20260703-data-auth-singleton`으로 갱신했다.
- `app.js`가 import하는 주요 렌더러와 `data.js`를 같은 cache-bust로 통일했다.
- 거래, 목표, 설정, 리뷰, 정산, 리포트, urge, modal 모듈의 `data.js` import query를 모두 `20260703-data-auth-singleton`으로 통일했다.
- `modal-manager.js`의 동적 modal import query도 같은 값으로 정리했다.
- `data.js`의 금융 목표 프리셋 보정이 기존 `finance_goals` 첫 문서를 merge로 덮어쓰지 않도록 바꿨다. 기존 목표가 있으면 보존하고, 목표가 없을 때만 기본 목표를 생성한다.
- `scripts/verify-project.mjs`에 `data.js` import query 단일성 검사를 추가했다.

## 검증

- `node --check scripts/verify-project.mjs`
- `node --check app.js`
- `node --check data.js`
- `node --check modal-manager.js`
- `node --check render-tx.js`
- `node --check render-finance.js`
- `node --check render-settings.js`
- `npm.cmd run verify` 통과
- `npm.cmd run pages:build` 통과
- `_site` 산출물에서 `index.html`, `app.js`, `render-tx.js`, `render-finance.js`, `render-settings.js`, `modals/*`, `urge/*`가 모두 `data.js?v=20260703-data-auth-singleton`을 참조하는 것을 확인했다.

## 남은 확인

운영 배포 후 `https://aretenald2018-sys.github.io/budget/`에서 로그인 상태로 거래/목표 탭을 열어 `로그인 필요`가 사라지고 기존 Firestore 데이터가 다시 보이는지 확인한다.
