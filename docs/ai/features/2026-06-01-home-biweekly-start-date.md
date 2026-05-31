# 홈 이번 2주 시작일 설정 계획

## 상태

- 세션: planning + execution 완료
- 작성일: 2026-06-01
- 사용자 요청: "가계부 '이번 2주'의 시작일을 내가 홈화면에서 설정할 수 있게해줘"
- 앱 코드 변경 상태: 슬라이스 1 실행 완료

## 그릴 결과

- 적용 트리거: `/grill-me`
- 핵심 질문: 홈에서 고른 시작일을 현재 한 번의 표시 범위로만 볼 것인가, 앞으로 반복되는 14일 주기의 기준일로 볼 것인가?
- 추천 답변: 반복되는 14일 주기의 기준일로 저장한다. 예를 들어 2026-05-26을 고르면 2026-05-26~2026-06-08, 2026-06-09~2026-06-22처럼 자동으로 이어진다.
- 사용자 답변: 명시 답변 없음.
- 실행 가정: 추천 답변으로 진행한다. 사용자가 다른 의도를 말하면 이 계획을 수정한다.
- 남은 가정: 설정은 브라우저 `localStorage`만이 아니라 기존 `users/{uid}/settings/app` 문서에도 저장해 로그인 기기 간에 유지한다.

## 조사 요약

- 홈 화면은 `render-home.js`에서 `renderReport({ rootSelector: '#tab-home', homeMode: true })`를 호출해 리포트 렌더러를 재사용한다.
- `render-report.js`는 `cycleKey(new Date())`와 `cycleRange(activeCycleKey)`로 현재 격주 범위를 계산하고, `listTransactions({ from: cycleStart, to: cycleEnd })`로 이번 2주 거래를 읽는다.
- `utils/cycles.js`는 현재 ISO 주차 기준 월요일 2주 묶음만 지원한다.
- 홈 상단 헤더의 보조 라벨은 `app.js`에 `격주 5/4–5/17`로 하드코딩되어 있어 시작일 설정과 함께 동적 라벨로 바꿔야 한다.
- 앱 설정은 `data.js`의 `getAppSettings()` / `saveAppSettings()`가 Firestore `settings/app` 문서를 사용하고, 홈 관리 카테고리 등 기존 UX 선호값을 저장한다.
- 현재 root에 `sw.js`는 없다. 따라서 이번 변경의 서비스워커 `CACHE_VERSION` bump 대상은 없다.

## 결정 기록

- 결정: 새 설정 필드는 `settings/app`의 `biweeklyStartDate` 같은 ISO 날짜 문자열로 저장한다.
- 이유: 날짜 하나를 14일 반복 anchor로 삼으면 별도 주차 키를 저장하지 않고도 현재 날짜 기준의 "이번 2주"를 안정적으로 계산할 수 있다.
- 되돌릴 수 있는가: 가능. 설정 필드를 무시하면 기존 ISO 격주 계산으로 되돌릴 수 있다.

## 실행 슬라이스

### 슬라이스 1: 홈에서 격주 시작일 저장 및 적용

- 목표:
  - 홈 화면에서 "이번 2주" 시작일을 사용자가 직접 고르고 저장할 수 있게 한다.
  - 저장된 시작일을 기준으로 홈/리포트의 cycle 범위, 라벨, 거래 조회, 카테고리 게이지, drilldown 범위가 일관되게 바뀌게 한다.
- 범위:
  - `utils/cycles.js`에 선택 시작일 anchor 기반 14일 범위 계산 helper를 추가한다.
  - `data.js`의 앱 설정 정규화에 `biweeklyStartDate`를 추가한다.
  - `render-report.js`에서 앱 설정을 읽어 cycle 범위를 계산하고, 홈 모드에 날짜 입력/저장 컨트롤을 노출한다.
  - 시작일 저장 시 Firestore 설정과 `localStorage`를 함께 갱신하고 현재 화면을 다시 렌더링한다.
  - `app.js`의 홈 헤더 보조 라벨을 저장된 시작일 기준으로 동적 계산한다.
  - 변경된 JS/CSS가 배포 후 새로 로드되도록 `index.html`, `app.js`, `render-home.js`, `render-report.js` 등 필요한 cache-busting query string을 갱신한다.
- 예상 수정 파일:
  - `utils/cycles.js`
  - `data.js`
  - `render-report.js`
  - `render-home.js`
  - `app.js`
  - `index.html`
  - 필요 시 `styles/70-reports.css` 또는 `styles/80-responsive.css`
- 수정하지 말 것:
  - 거래 저장/파싱 pipeline
  - 예산 카테고리 schema version과 기본 예산값
  - 월간 리포트의 과거 월 이동 동작
  - 설정 탭 전체 재구성
- 구현 메모:
  - 저장값이 없거나 유효하지 않으면 기존 ISO 격주 계산을 fallback으로 유지한다.
  - 선택한 anchor가 오늘보다 미래여도 14일 단위로 역산/순산해 오늘이 포함되는 범위를 계산한다.
  - 저장 컨트롤은 홈 화면 첫 viewport에서 보이되, 리포트 탭에는 같은 입력 UI를 중복 노출하지 않는다.
  - 날짜 입력은 `type="date"`를 사용하고 inline `onclick` 문자열 인자 확장은 피한다.
- 검증 방법:
  - `node --check utils/cycles.js`
  - `node --check data.js`
  - `node --check render-report.js`
  - `node --check app.js`
  - `npm.cmd run verify`
  - 사용자가 일반 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/` 또는 실제 출력 포트로 접속
  - 홈에서 시작일을 저장한 뒤 "이번 2주" 라벨, 헤더 라벨, 금액/카테고리 게이지, 카테고리 drilldown 건수가 같은 범위를 쓰는지 확인
- 완료 증거:
  - 선택한 시작일이 Firestore 앱 설정과 `localStorage`에 저장된다.
  - 홈 새로고침 후에도 같은 시작일 기준의 14일 범위가 유지된다.
  - 리포트 탭의 "이번 2주"도 같은 범위를 사용한다.
  - 월간 모드와 고정비 월간 요약은 기존처럼 현재 월 기준으로 유지된다.
- 다음 세션 시작 프롬프트:
  - `docs/ai/features/2026-06-01-home-biweekly-start-date.md`의 슬라이스 1을 실행한다. 홈에서 저장 가능한 `biweeklyStartDate` 설정을 추가하고, 저장된 날짜 anchor로 "이번 2주" 범위를 계산하도록 구현한 뒤 검증한다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고, 저장된 격주 시작일이 홈/리포트/드릴다운/헤더에서 같은 범위로 적용되는지, 날짜 경계와 cache-busting이 빠지지 않았는지, 월간 모드가 회귀하지 않았는지를 우선 리뷰한다. 리뷰 중에는 새 기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 완료
- 다음 자동 상태: `ready_for_execution`
- 다음 액션: 슬라이스 1 실행
- 차단 질문: 없음. 단, 사용자가 "한 번만 표시 범위를 바꾸는 override"를 원한다고 답하면 계획을 수정한다.

## 실행 결과

- `utils/cycles.js`에 저장 시작일 anchor 기반 14일 범위 계산, 라벨, 진행일 helper를 추가했다.
- `data.js`의 `settings/app` 정규화에 `biweeklyStartDate`를 추가했다.
- `render-report.js`에서 홈/리포트의 "이번 2주" 거래 조회와 라벨을 저장된 시작일 기준으로 계산하고, 홈 hero에 날짜 저장 form을 추가했다.
- `app.js`의 홈 헤더 보조 라벨을 저장된 시작일 기준 격주 범위로 바꿨다.
- `index.html`, `app.js`, `render-home.js`, `style.css`의 cache-busting query string을 `20260601-biweekly-start`로 갱신했다.

## 실행 검증

- `node --check utils/cycles.js`: 통과
- `node --check data.js`: 통과
- `node --check render-report.js`: 통과
- `node --check app.js`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 95 JS files checked)
- `npm.cmd run pages:build`: 통과 (`_site` Pages artifact 생성)
- anchor 계산 스모크 테스트: `2026-05-26` 시작일 기준 `2026-06-01`은 `5/26–6/8`, `2026-05-25`는 `5/12–5/25`로 계산됨을 확인
- not verified yet: 로그인된 실제 홈 화면에서 date input 저장 후 Firestore 반영과 drilldown UI를 클릭 검증하는 단계는 배포 후 확인 대상이다.

## 리뷰 결과

- 리뷰 문서: `docs/ai/reviews/2026-06-01-home-biweekly-start-date-review.md`
- 결과: 차단 이슈 없음.
- 보강: 리뷰 중 Firestore 설정에 시작일이 없을 때 stale `localStorage` anchor를 제거하도록 보완했다.
