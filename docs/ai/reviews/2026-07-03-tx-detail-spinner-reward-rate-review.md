# 거래 상세 로딩과 적립배분율 하한 리뷰

## 결과

차단 이슈는 없다.

## 확인한 점

- 거래 상세 바텀시트는 `getTransaction` 실패 시 오류 UI를 표시하고, 연결 영수증 조회 실패는 거래 폼 렌더링을 막지 않는다.
- 적립배분율은 UI 입력, 설정 저장, 홈 보상 카드 계산 모두 `0%` 이상을 허용한다.
- `render-settings.js`에서 금지된 `budget-snowy-iota.vercel.app` browser fallback 문자열을 제거해 `npm.cmd run verify`가 통과했다.
- `index.html`, `app.js`, `render-home.js`, `render-report.js`, `render-settings.js`, `modal-manager.js`, `modals/tx-edit-modal.js`의 cache-bust 갱신을 확인했다.
- repo root에 `sw.js`/`STATIC_ASSETS` 정의는 없어 서비스워커 `CACHE_VERSION` 갱신 대상은 없다.

## 남은 리스크

- 실제 운영 UI에서 “문제 거래 클릭 -> 상세 폼 표시”는 배포 후 사용자의 로그인 세션/실데이터로 확인해야 한다.
- 연결 영수증이 계속 실패하는 거래는 영수증 영역에 실패 안내가 남는다. 이 경우 별도 영수증 데이터 정합성 점검이 후속 과제다.
