# 포인트 목표액 진행선과 항목 CRUD 계획

## 요청 원문

와인구매/고급재료/여행충당 포인트의 적립현황을 확인할 수 있게 일자형 선 그래프로 나타낼 것. 기준액은 와인구매는 12만, 고급재료는 8만, 여행충당은 20만을 맥스값으로 해서 내가 모은 포인트만큼 그래프가 차있는것처럼 표시해줘. 이런 기준액같은건 물론 설정에서 crud할 수 있게 해주고. 포인트 항목 자체도 crud할 수 있게 해줘. 한편, 오늘 적립액을 한달 일수만큼 곱하면 월예상액만큼 안나오는데 한번 산식도 점검해줘.

## 이해한 내용

- 목표:
  - 홈 `오늘의 적립` 카드에서 각 포인트의 이번 달 누적액을 기준액 대비 일자형 선 그래프로 표시한다.
  - 기본 기준액은 `와인구매 포인트` 120,000원, `고급재료 포인트` 80,000원, `여행충당 포인트` 200,000원이다.
  - 설정에서 포인트 항목의 이름, 적립률, 기준액, 사용 여부를 만들기/수정/삭제/초기화할 수 있게 한다.
  - `월 예상`은 사용자가 직관적으로 검산한 값과 맞도록 `오늘 적립액 * 이번 달 일수` 산식으로 정리한다.
- 비목표:
  - 포인트 사용/차감 장부, 실제 결제 차감, 자동 이체는 만들지 않는다.
  - Android 위젯 레이아웃을 포인트 항목 CRUD에 맞춰 재설계하지 않는다. 단, 웹 계산 결과와 기존 위젯 snapshot 계약이 깨지지 않게 유지한다.
  - 기준액은 시각화 목표값일 뿐 포인트 적립 상한으로 쓰지 않는다.
- 사용자 흐름:
  - 홈에서 포인트별 `이번 달 누적 / 기준액`, 진행선, 오늘 적립, 월 예상, 적립률을 본다.
  - 설정 > `보상 적립`에서 포인트 항목을 추가하고, 이름/적립률/기준액/사용 여부를 편집한 뒤 저장한다.
  - 기본 3개 항목은 초기값으로 제공되고 삭제하거나 다시 초기화할 수 있다.
- 데이터 가정:
  - 기존 `rewardSavings.pointRates`는 `rewardSavings.pointItems` 배열로 마이그레이션한다.
  - legacy `allocationRate`와 `pointRates.winePurchase`는 `와인구매 포인트`의 적립률 fallback으로 유지한다.
  - 기존 저장값에 항목 메타데이터가 없으면 기본 3개 항목을 생성하고, 기존 적립률은 보존한다.
- 열려 있는 질문:
  - 없음. 기준액과 월예상 산식에 대한 사용자의 의도가 요청 원문에 충분히 명시되어 있다.

## 진단 결과

- 적용 트리거: `/diagnose`
- 증상: 화면의 `오늘 +n · 월 예상 m`에서 `n * 이번 달 일수`가 `m`과 맞지 않는다.
- 확인한 현재 산식:
  - `utils/reward-savings.js`는 현재 `projectedMonthPoints = Math.round((monthPoints / elapsedDays) * daysInMonth)`로 계산한다.
  - 즉 `월 예상`은 "오늘 적립 페이스"가 아니라 "이번 달 누적 평균 페이스"다.
- 원인:
  - UI 문구는 `오늘 +... · 월 예상 ...`처럼 오늘 값과 연결돼 보이지만, 실제 산식은 누적 평균 기반이라 사용자가 직접 검산한 값과 달라진다.
- 수정 방향:
  - `projectedMonthPoints`를 `todayPoints * daysInMonth`로 바꾸고, 필요하면 내부 보조값으로 누적 평균 예측치를 별도 이름에만 남긴다.

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: 기준액은 실제 적립 제한인가, 아니면 진행선의 100% 기준인가?
- 추천 답변: 진행선의 100% 기준. 이전 요청에서 포인트 상한 제거를 완료했고, 이번 요청의 `맥스값`은 그래프 시각화를 위한 기준액으로 읽는 것이 충돌이 없다.
- 사용자 답변: 요청 원문에서 `기준액`, `맥스값`, `그래프가 차있는것처럼`이라고 표현했다.
- 확정된 결정:
  - 기준액은 포인트 적립을 막는 cap이 아니라 `targetAmount` 시각화 기준이다.
  - 포인트 항목은 설정 저장값 안의 배열형 메타데이터로 관리한다.
  - 월예상액은 `오늘 적립액 * 이번 달 일수`로 화면 검산이 가능하게 한다.
- 남은 가정:
  - 포인트 항목 삭제는 즉시 누적 계산 대상에서 제외하는 삭제로 충분하다. 과거 누적 포인트 장부가 없으므로 별도 보존 상태는 만들지 않는다.

## 결정 기록

- 결정: `rewardSavings.pointItems` 배열을 도입한다.
- 이유: 이름, 적립률, 기준액, 사용 여부, 순서를 CRUD하려면 고정 key map인 `pointRates`만으로는 부족하다.
- 되돌릴 수 있는가: 가능. 정규화 레이어에서 `pointItems`가 없으면 기존 `pointRates`를 계속 읽도록 둔다.

- 결정: 기본 항목은 `winePurchase`, `premiumIngredients`, `travelFund` key를 유지한다.
- 이유: 기존 Android 위젯 snapshot, 검증 스크립트, legacy 설정과 호환된다.
- 되돌릴 수 있는가: 가능. label/target은 메타데이터로만 바뀌고 key 호환은 유지한다.

- 결정: 기준액 기본값은 120,000 / 80,000 / 200,000원이다.
- 이유: 사용자 지정값이며 진행선 UI의 100% 기준이다.
- 되돌릴 수 있는가: 가능. 설정에서 수정 가능하다.

## 실행 슬라이스

### 슬라이스 1: 웹 포인트 목표 진행선과 설정 CRUD

- 상태: 구현/검증/리뷰/production 확인 완료
- 목표:
  - 홈 카드에 포인트별 기준액 대비 일자형 진행선을 추가하고 설정에서 포인트 항목/기준액 CRUD를 지원한다.
  - 월예상액 산식을 `오늘 적립액 * 월 일수`로 수정한다.
- 범위:
  - `data.js`의 `rewardSavings` 정규화에 `pointItems` 추가 및 legacy `pointRates` migration.
  - `utils/reward-savings.js`의 bucket 소스와 `projectedMonthPoints` 산식 수정.
  - `render-report.js`의 홈 포인트 row를 `누적 / 기준액` + progress bar 구조로 변경.
  - `render-settings.js`의 보상 적립 폼을 포인트 항목 CRUD UI로 확장.
  - `styles/60-urge.css`와 필요한 cache-bust query string 갱신.
  - `scripts/verify-project.mjs`에 기본 기준액, CRUD UI 토큰, 월예상 산식 회귀 검증 추가.
- 예상 수정 파일:
  - `data.js`
  - `utils/reward-savings.js`
  - `render-report.js`
  - `render-settings.js`
  - `styles/60-urge.css`
  - `style.css`
  - `app.js`
  - `index.html`
  - `scripts/verify-project.mjs`
  - `docs/ai/executions/2026-07-03-reward-point-goals-progress-crud.md`
- 수정하지 말 것:
  - Firestore 컬렉션 구조를 새로 만들지 않는다. 기존 `settings/app` 문서 안에서 해결한다.
  - Gemini/API secret, Gmail pipeline, raw message 처리, 거래 ingest 경로는 건드리지 않는다.
  - Android 위젯 UI/레이아웃 재설계는 하지 않는다.
- 구현 메모:
  - `pointItems` item 후보 필드: `id`, `label`, `rate`, `targetAmount`, `enabled`, `order`.
  - `id`는 기존 key 호환을 위해 영문/숫자/하이픈 기반으로 정규화하고, 새 항목은 `customPointYYYYMMDD...` 같은 안정 id를 생성한다.
  - 설정 CRUD는 동적으로 생성한 버튼에 `type="button"`과 `data-*`를 사용하고 delegated listener로 처리한다.
  - 진행선 비율은 `monthPoints / targetAmount`를 `0..1`로 clamp하고, 초과 시 숫자는 초과를 그대로 보여준다.
  - `pointRates`는 저장 payload에도 호환 alias로 남겨 기존 코드/위젯 fallback이 깨지지 않게 한다.
- 검증 방법:
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; node --check .\data.js; node --check .\utils\reward-savings.js; node --check .\render-report.js; node --check .\render-settings.js; node --check .\scripts\verify-project.mjs`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run verify`
  - `Set-Location -LiteralPath 'C:\Users\USER\Desktop\Tomato Project\budgetproject'; npm.cmd run pages:build`
  - production deploy 후 `https://aretenald2018-sys.github.io/budget/`에서 홈 카드와 설정 저장 흐름을 실제로 확인한다.
- 완료 증거:
  - 홈 `오늘의 적립`에 세 기본 포인트의 기준액 대비 진행선이 보이고 기준액이 각각 120,000 / 80,000 / 200,000원이다.
  - `월 예상`이 각 bucket의 `오늘 적립액 * 월 일수`와 일치한다.
  - 설정에서 포인트 항목 추가/수정/삭제/초기화 후 홈 카드가 갱신된다.
  - `npm.cmd run verify`, `npm.cmd run pages:build`, GitHub Pages workflow, production UI 확인이 모두 통과한다.
- 다음 세션 시작 프롬프트:
  - 이 계획 문서의 슬라이스 1 `웹 포인트 목표 진행선과 설정 CRUD`만 구현한다. 앱 코드를 수정한 뒤 검증하고 `NEXT_ACTION.md`를 `ready_for_review`로 갱신한다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 버그, 회귀, 누락된 테스트, 오래된 캐시/서비스워커 이슈, UX 깨짐을 우선 리뷰한다. 리뷰 중에는 새 기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 계획 작성 완료
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 슬라이스 1 `웹 포인트 목표 진행선과 설정 CRUD` 실행
- 차단 질문: 없음
