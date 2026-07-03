# data.js 인증 싱글턴 리뷰

## 리뷰 결과

발견된 차단 이슈 없음.

## 확인한 위험

- 여러 query string으로 `data.js`가 분리 로드되는 문제가 코드상 제거되었다.
- `scripts/verify-project.mjs`가 브라우저 코드의 `data.js` import query를 강제하므로 같은 회귀가 검증 단계에서 잡힌다.
- 금융 목표 프리셋 보정은 기존 목표 문서를 더 이상 덮어쓰지 않는다.
- `index.html`의 `app.js` cache-bust도 같이 바뀌어 기존 앱 번들이 계속 재사용되는 위험을 낮췄다.

## 검증 근거

- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.
- `_site` 산출물에서 모든 데이터 접근 모듈이 `data.js?v=20260703-data-auth-singleton`을 사용함을 확인했다.

## 운영 확인 필요

배포 후 실제 WebView/브라우저에서 앱을 새로 열고 거래 탭과 목표 탭을 확인해야 한다. 기대 상태는 `로그인 필요` toast가 반복되지 않고 기존 거래/목표 데이터가 표시되는 것이다.
