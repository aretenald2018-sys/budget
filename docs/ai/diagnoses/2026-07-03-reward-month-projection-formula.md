# 포인트 월예상 산식 진단

## 증상

- 사용자 설명: `오늘 적립액`을 한 달 일수만큼 곱해도 화면의 `월예상액`과 맞지 않는다.
- 관찰된 실패: `utils/reward-savings.js`에서 `projectedMonthPoints`가 오늘 값이 아니라 이번 달 누적 평균값으로 계산된다.
- 영향 범위: 홈 `오늘의 적립` 카드와 Android 위젯 snapshot의 `projectedMonthPoints`.

## 재현/피드백 루프

- 선택한 루프: 코드 산식 확인 + `scripts/verify-project.mjs` 회귀 검증 추가 예정.
- 실행 방법: `buildRewardSavingsSummary()` fixture에서 `todayPoints`, `daysInMonth`, `projectedMonthPoints`를 비교한다.
- 기대 실패: 현재 구현은 `projectedMonthPoints !== todayPoints * daysInMonth`가 될 수 있다.
- 실제 결과: 현재 산식은 `Math.round((monthPoints / elapsedDays) * daysInMonth)`다.
- 반복 가능성: 월초 이후 이전 날짜의 포인트가 오늘 포인트와 다르면 항상 재현 가능하다.

## 가설

1. 가설: 월예상은 누적 평균 페이스로 의도되었다.
   - 예측: 코드가 `monthPoints / elapsedDays * daysInMonth`를 쓴다.
   - 검증 방법: `utils/reward-savings.js` 확인.
   - 결과: 맞다.
2. 가설: 화면 문구가 오늘 페이스처럼 보여 오해를 만든다.
   - 예측: `render-report.js`가 `오늘 +n · 월 예상 m`으로 붙여 표시한다.
   - 검증 방법: `rewardPointBucketRow()` 확인.
   - 결과: 맞다.
3. 가설: 적립률 정규화 오류로 값이 어긋난다.
   - 예측: `todayPoints` 자체가 잘못 계산된다.
   - 검증 방법: `pointsForSaved(saved, rate)`와 기존 verify fixture 확인.
   - 결과: 현상 설명의 핵심은 아니다. 오늘 포인트는 정상이고 월예상 산식이 다르다.

## 수정

- 원인: `월 예상`의 화면 의미와 실제 산식이 다르다.
- 변경 파일: 다음 실행 슬라이스에서 `utils/reward-savings.js`, `render-report.js`, `scripts/verify-project.mjs` 수정.
- 수정 내용: `projectedMonthPoints = todayPoints * daysInMonth`로 변경하고 검증 fixture를 추가한다.
- 회귀 검증: `npm.cmd run verify`.
- 제거한 임시 계측: 없음.

## 다음 세션

- 실행할 슬라이스: `docs/ai/features/2026-07-03-reward-point-goals-progress-crud.md` 슬라이스 1.
- 시작 프롬프트: 계획 문서를 읽고 슬라이스 1만 구현한다.

## NEXT_ACTION.md 업데이트

- 진단 종료 상태: 계획에 반영 완료
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 포인트 목표 진행선과 설정 CRUD 실행
- 차단 사유: 없음
