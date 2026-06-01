# 교통비용 상세분류 미지정 클릭 수정 계획

## 요청

- Discord 요청: `devreq_discord_1510804891134595225`
- 사용자 보고: `교통비용` 상세의 `상세분류 미지정` 클릭이 동작하지 않는다.

## `/diagnose`

### 재현/피드백 루프

- 정적 재현:
  - `render-report.js`는 카테고리 상세 모달에서 `상세분류 미지정` 행을 버튼으로 렌더링하고 분류 시트를 연다.
  - 분류 시트는 현재 카테고리의 `subcategories`만 선택 후보로 사용한다.
  - `data.js`의 기본 `교통비용` 카테고리에는 `subcategories`가 없어 시트가 저장 가능한 상태가 되지 않는다.
- 수정 후 확인:
  - `교통비용` 기본/기존 카테고리에 상세분류 후보가 채워지는지 코드로 확인한다.
  - `render-report.js`의 기존 클릭 경로가 후보 목록과 함께 저장 가능한 상태를 만들 수 있는지 확인한다.
  - `node --check`, `npm.cmd run verify`, `git diff --check`를 실행한다.
- 실제 UI 확인:
  - 정상 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/`에서 `교통비용` 상세 모달 -> `상세분류 미지정` -> `상세분류 지정` 시트가 열리고 저장 버튼이 활성화되는지 확인한다.

### 가설

1. `교통비용`은 기본 상세분류 후보가 없어 `상세분류 미지정` 클릭 후 선택/저장할 수 없는 상태가 된다.
2. 기존 `생활비용` 중심 수정은 클릭 이벤트 자체를 보강했지만, 후보가 없는 카테고리의 사용성까지 보장하지 못했다.
3. 기존 사용자 데이터에도 `교통비용.subcategories`가 비어 있을 수 있어 기본 시드만 바꾸면 배포 후 바로 반영되지 않는다.
4. `data.js`를 바꾸면 브라우저 모듈 캐시가 남을 수 있어 관련 import/cache-bust 갱신이 필요하다.

## 실행 슬라이스

### 슬라이스 1: 교통비용 상세분류 기본 후보 보강

- `data.js`
  - 기본 `교통비용` 카테고리에 상세분류 후보를 추가한다.
  - 기존 사용자 카테고리에도 누락된 교통비용 상세분류를 보강하는 integrity 경로를 추가한다.
- 브라우저 cache-bust
  - `render-report.js`를 직접 import하는 `app.js`, `render-home.js`와 `index.html`의 기존 cache-bust 문자열을 새 변경값으로 갱신한다.
  - `data.js` 캐시가 즉시 갱신되지 않아도 `render-report.js`가 교통비용 기본 후보를 즉시 제공하고, 저장 시 선택 후보를 카테고리 설정에 등록한다.

## 제외

- 상세분류 관리 UI 확장
- 거래 자동분류 규칙 변경
- `상세분류 미지정` 클릭 이벤트 구조 재작성
- 카테고리 예산/리듬 변경

## 완료 기준

- `교통비용` 분류 시트가 최소 하나 이상의 상세분류 후보를 보여 저장 가능한 상태가 된다.
- 기존 사용자 데이터에도 누락된 교통비용 상세분류 후보가 보강된다.
- 정적 검증과 프로젝트 검증이 통과한다.
- 실제 브라우저/Android 터치 검증을 못 하면 `not verified yet`와 필요한 확인을 명시한다.

## 실행 결과

- 상태: 실행 완료
- 구현 파일: `data.js`, `render-report.js`, `app.js`, `render-home.js`, `index.html`
- 문서 파일: `docs/ai/features/2026-06-01-transport-subcategory-unassigned-click.md`, `docs/ai/NEXT_ACTION.md`
- 변경 요약:
  - `교통비용` 기본 카테고리에 `대중교통`, `택시`, `교통카드충전`, `기타교통` 상세분류 후보를 추가했다.
  - 기존 사용자 카테고리에도 누락된 교통비용 상세분류 후보를 보강하는 integrity 경로를 추가했다.
  - `render-report.js`의 상세분류 지정 시트가 `교통비용` 기본 후보를 즉시 보여주고, 저장 시 선택한 상세분류를 카테고리 설정에도 등록하게 했다.
  - `index.html`, `app.js`, `render-home.js`의 `render-report.js`/`app.js` cache-bust 문자열을 `20260601-transport-subcategory`로 갱신했다.
- 검증:
  - `node --check data.js`: 통과
  - `node --check render-report.js`: 통과
  - `node --check app.js`: 통과
  - `node --check render-home.js`: 통과
  - `git diff --check`: 통과
  - `npm.cmd run verify`: 통과
- 실제 UI 검증: not verified yet. 프로젝트 지침상 sandbox에서 장기 dev server를 시작해 완료 검증으로 주장하지 않으며, 배포 후 실제 앱에서 확인해야 한다.
