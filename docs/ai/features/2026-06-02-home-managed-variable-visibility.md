# 홈 관리 카테고리 변동비 목록 노출

## 요청

- Discord 요청: `devreq_discord_1511154512289595543`
- 요청자: 피노
- 내용: 관리 카테고리는 변동비 중 집중 관리 항목일 뿐이므로, 홈의 `이번 2주 변동비` 항목에도 해당 카테고리 정보를 표시해야 한다.
- 첨부 확인: `docs/ai/inbox/requests/devreq_discord_1511154512289595543/attachments/01-Screenshot_20260602_084745.jpg`

## 그릴 결과

- 핵심 질문: 홈의 `관리 카테고리`에 뽑힌 항목을 `이번 2주 변동비` 목록에서 제외할지, 포함할지?
- 코드 확인 결과: `render-report.js`가 `homeManagedCategoryIds`에 포함된 조절비 카테고리를 `homeRestVariableCategories`로 제외한 뒤 홈 변동비 목록을 렌더링한다.
- 결정: 관리 카테고리는 별도 강조 카드에 중복 노출되더라도, 변동비 전체 목록에는 포함한다.
- 남은 가정: 기존 `관리 카테고리` 카드의 횟수/금액 집중 관리 UI는 유지하고, 변동비 목록은 기존 금액 게이지 형식을 그대로 사용한다.

## 실행 슬라이스

### 슬라이스 1 - 홈 변동비 목록 포함 조건 수정

- 대상 파일:
  - `render-report.js`
  - `render-home.js`
  - `app.js`
  - `index.html`
  - `docs/ai/NEXT_ACTION.md`
- 구현:
  - 홈 모드의 `이번 2주 변동비`/`이번 달 변동비` 목록에 `controlCategories` 전체를 넘긴다.
  - `관리 카테고리` 섹션은 현재처럼 선택된 항목만 별도 강조 표시한다.
  - 변경된 JS가 정적 호스팅에서 새로 로드되도록 관련 query string을 갱신한다.
- 제외:
  - 관리 카테고리 선택 UI 변경
  - 예산 계산식 변경
  - 거래/카테고리 데이터 구조 변경

## 검증 계획

- `node --check app.js render-home.js render-report.js`
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 배포 후 `https://aretenald2018-sys.github.io/budget/` HTTP 200 확인
- 배포본 `index.html`, `app.js`, `render-home.js`, `render-report.js`의 새 cache-bust 문자열 확인
- 실제 UI 확인: 홈에서 관리 카테고리로 선택된 항목이 `관리 카테고리`와 `이번 2주 변동비` 목록 양쪽에 보인다.

## 다음 세션 프롬프트

`docs/ai/features/2026-06-02-home-managed-variable-visibility.md`의 슬라이스 1을 실행하고, 홈 변동비 목록에 관리 카테고리가 포함되는지 검증한다.

## 실행 결과

- 상태: 슬라이스 1 구현 완료
- 변경 요약:
  - `render-report.js`에서 홈 변동비 목록 입력을 `homeRestVariableCategories`에서 `homeVariableCategories`로 바꾸고, 홈 모드에서는 `controlCategories` 전체를 넘기도록 수정했다.
  - `관리 카테고리` 강조 카드는 기존처럼 `homeManagedCategoryIds`에 선택된 항목만 표시한다.
  - `index.html`, `app.js`, `render-home.js`의 관련 query string을 `20260602-managed-variable`로 갱신했다.
- 로컬 검증:
  - `node --check app.js; node --check render-home.js; node --check render-report.js`: 통과
  - `npm.cmd run verify`: 통과
  - `npm.cmd run pages:build`: 통과
  - `_site/index.html`, `_site/app.js`, `_site/render-home.js`, `_site/render-report.js`에서 `20260602-managed-variable`와 `homeVariableCategories` 반영 확인
- 배포 검증: push 후 확인 예정
