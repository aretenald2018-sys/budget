# 교통비용 literal 미지정 상세분류 클릭 수정 계획

## 요청

- Discord 요청: `devreq_discord_1510804891134595225`
- 사용자 보고: `교통비용 상세분류 미지정 클릭이 안돼`

## `/diagnose`

진단 문서: `docs/ai/diagnoses/2026-07-03-transport-subcategory-literal-unassigned.md`

### 원인

`상세분류 미지정` 행은 클릭 가능한 버튼으로 렌더링되지만, 분류 시트는 `!tx.subcategory`만 분류 대상으로 삼는다. 거래 `subcategory`에 표시 문자열 `상세분류 미지정`이 저장되어 있으면 사용자는 클릭 가능한 미지정 행을 보지만, 분류 시트는 해당 거래를 제외한다.

## 실행 슬라이스

### 슬라이스 1: 미지정 상세분류 판정 통일

- `render-report.js`
  - 빈 값과 literal `상세분류 미지정`을 같은 미지정 상태로 판단하는 helper를 추가한다.
  - 상세분류 요약과 분류 시트 대상 필터에 같은 helper를 사용한다.
- `index.html`, `app.js`, `render-home.js`
  - 새 `render-report.js`가 로드되도록 cache-bust 문자열을 갱신한다.

## 제외

- 상세분류 후보 UX 변경
- 거래 자동분류 규칙 변경
- Firestore 데이터 삭제/일괄 마이그레이션
- Android APK 변경

## 검증

- `node --check render-report.js`
- `node --check app.js`
- `node --check render-home.js`
- `git diff --check`
- `npm.cmd run verify`
- `npm.cmd run pages:build`
- 운영 배포 후 `https://aretenald2018-sys.github.io/budget/`에서 HTTP 200 및 새 cache-bust 확인

## 완료 기준

- `subcategory`가 비어 있거나 `상세분류 미지정` 문자열이어도 같은 미지정 거래로 분류 대상에 포함된다.
- `교통비용` 상세 모달의 `상세분류 미지정` 행 클릭 시 `상세분류 지정` 시트가 열린다.
- 실제 로그인 UI 확인을 못 하면 `not verified yet`와 남은 확인을 명시한다.

## 실행 결과

- 상태: 실행 및 리뷰 완료, production 배포 차단
- 실행 문서: `docs/ai/executions/2026-07-03-transport-subcategory-literal-unassigned.md`
- 리뷰 문서: `docs/ai/reviews/2026-07-03-transport-subcategory-literal-unassigned-review.md`
- 구현 파일: `render-report.js`, `index.html`, `app.js`, `render-home.js`
- 검증:
  - `node --check render-report.js`: 통과
  - `node --check app.js`: 통과
  - `node --check render-home.js`: 통과
  - `git diff --check`: 통과
  - `npm.cmd run verify`: 통과
  - `npm.cmd run pages:build`: 통과
- 배포: not verified yet. 작업 시작 전부터 unrelated dirty changes가 대량으로 있었고, 이번 요청 파일에도 기존 미커밋 변경이 섞여 있어 안전하게 커밋/푸시하지 못했다.
