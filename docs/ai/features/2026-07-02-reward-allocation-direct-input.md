# 보상 적립 배분율 직접 입력 전환 계획

## 요청

- 설정의 `적립 배분율`을 슬라이더가 아니라 사용자가 직접 숫자로 입력할 수 있게 한다.

## 진단

- `render-settings.js`의 보상 적립 폼은 `allocationRatePct`를 `input type="range"`로 렌더링한다.
- 저장 로직은 이미 `FormData`의 `allocationRatePct` 값을 숫자로 읽어 `/ 100` 처리한다.
- 따라서 컨트롤을 숫자 입력으로 바꿔도 저장 데이터 구조는 유지된다.

## 결정

- `allocationRatePct`를 `type="number"` 직접 입력 필드로 바꾼다.
- 값 단위가 퍼센트임을 필드 옆 `%` suffix로 보여준다.
- 입력 범위는 현재 저장 정규화와 맞춰 `5~100%`로 둔다.
- 보상 설정 카드 외의 산식, 포인트 계산, Firestore schema는 변경하지 않는다.

## 검증

- `npm.cmd run verify`
- `npm.cmd run pages:build`
- `_site`에서 새 cache bust, 숫자 입력 마크업, 슬라이더 제거 확인
- 운영 설정 화면에서 `적립 배분율`이 숫자 입력으로 보이고 저장 가능한지 확인
