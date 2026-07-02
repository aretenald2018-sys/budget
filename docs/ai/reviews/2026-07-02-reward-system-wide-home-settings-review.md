# 보상형 홈 디자인 시스템 확장 및 산식 설정 리뷰

## 리뷰 결과

- 큰 결함 없음.

## 확인한 점

- `data.js` query string을 일부 파일만 갱신하면 모듈 인스턴스가 갈라질 수 있어, `data.js` import 사용처를 모두 `20260702-reward-settings-system`으로 통일했다.
- 홈 변동비 게이지는 기존 뒤쪽 CSS 규칙이 다시 보라 그라데이션을 입힐 수 있어, 동일 specificity의 핑크 오버라이드를 뒤쪽에도 추가했다.
- 보상 적립 비활성화 상태는 계산 유틸에서 `enabled=false`로 처리하고 홈 카드는 비활성 상태 문구를 보여준다.
- 설정 저장은 기존 `saveAppSettings({ rewardSavings })` 경로를 사용해 새 컬렉션을 만들지 않았다.

## 검증

- `npm.cmd run verify` 통과.
- `npm.cmd run pages:build` 통과.
- `_site` 산출물에서 홈 카드 스타일 토큰과 설정 폼 문자열 확인.

## 잔여 리스크

- Firestore 저장 흐름과 운영 UI 시각 확인은 GitHub Pages 배포 후 실제 브라우저에서 확인해야 한다.
