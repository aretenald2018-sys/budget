# 홈 CSS 복구 및 토스 김태우 제외 리뷰

## 결과

- 심각도 높은 결함은 발견하지 못했다.
- `npm.cmd run verify`가 통과했고, 새 fixture가 `토스 김태우`만 자전거래 제외 대상으로 검증한다.

## 확인한 지점

- 홈 최상단 기간 카드는 `.report-month-nav` / `.report-month-nav.home-cycle-nav`에 flex 구조와 이전 크기값을 복원했다.
- 홈 hero 토글과 고정비 행 폰트/그리드 규칙은 삭제된 선택 탭 CSS 파일을 되살리지 않고 `styles/60-urge.css` 안에 필요한 규칙만 복구했다.
- `data.js`, 서버 ingest, pending raw 재처리, CSV export가 모두 `utils/self-transfer.js`의 같은 판정 기준을 사용한다.
- 신규 거래 저장 시 `excludedFromBudget`, `excludeFromBudget`, `excludeReason: "self_transfer_toss_kim_taewoo"`가 붙고, 기존 거래도 `isBudgetExcluded(tx)`에서 동적으로 제외된다.
- 다른 `토스` 수취인 fixture는 제외되지 않는다.

## 남은 리스크

- 로그인된 실제 UI에서 홈 카드와 거래 캘린더 화면을 눈으로 확인하는 단계는 not verified yet이다. 프로젝트 규칙상 sandbox에서 장기 dev server를 띄워 검증 완료로 주장하지 않는다.
- Firestore 기존 문서 백필은 범위에서 제외했다. 대신 화면/집계 helper가 기존 문서를 즉시 제외한다.
