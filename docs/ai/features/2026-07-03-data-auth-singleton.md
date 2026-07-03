# data.js 인증 싱글턴 회귀 수정 계획

## 배경

APK 설치 후 사용자는 로그인되어 있는데도 거래 탭에서 `거래 내역 로드 실패 / 로그인 필요`가 표시되고, 목표 탭에는 기존 입력값이 사라진 것처럼 보인다.

## 진단

- `app.js`는 `./data.js?v=20260703-reward-rate-css-fix`를 초기화하고 인증 상태를 받는다.
- `render-tx.js`, `render-finance.js`, `render-review.js`, `client-parse.js`, `urge/*`, `modals/*`는 서로 다른 `data.js?v=...`를 import한다.
- 브라우저 ES module은 query string이 다르면 별도 모듈로 취급하므로, `_user`가 module scope에 있는 `data.js`가 여러 인스턴스로 분리된다.
- 결과적으로 `app.js` 쪽 인스턴스만 로그인 상태이고 거래/목표 탭 쪽 인스턴스는 `_user === null`이라 `_scope()`에서 `로그인 필요`를 던진다.
- 목표 탭은 일부 읽기 실패를 빈 배열로 처리해 실제 데이터가 비어 보이는 부작용이 있다.

## 실행 슬라이스

### Slice 1: 데이터 모듈 인증 상태 단일화

범위:

- 모든 브라우저 모듈의 `data.js` import query를 같은 cache-bust 값으로 통일한다.
- `index.html`과 `app.js`의 module cache-bust를 함께 갱신해 배포 후 실제 브라우저가 새 모듈 그래프를 받게 한다.
- `modal-manager.js`의 동적 import cache-bust도 같은 값으로 정리한다.
- 금융 목표 프리셋 보정은 기존 `finance_goals` 문서를 덮어쓰지 않고, 목표가 없을 때만 기본 목표를 생성하도록 바꾼다.
- `scripts/verify-project.mjs`에 `data.js` import query 단일성 검사를 추가해 같은 회귀를 차단한다.

제외:

- Firestore 데이터 삭제/복구 스크립트는 작성하지 않는다.
- 로그인 UI나 인증 provider 구조는 바꾸지 않는다.
- APK 버전 증가는 이 웹 자산 회귀 수정 범위에 포함하지 않는다.

## 검증

- `node --check`로 수정 JS 문법 확인.
- `npm.cmd run verify`.
- `npm.cmd run pages:build`.
- 배포 후 production에서 `index.html`, `app.js`, 거래/목표/설정 모듈이 모두 같은 `data.js?v=20260703-data-auth-singleton`을 참조하는지 확인한다.
- 운영 UI에서 로그인 상태로 거래/목표 탭 진입 시 `로그인 필요` 오류가 사라지는 것이 기대 상태다.
