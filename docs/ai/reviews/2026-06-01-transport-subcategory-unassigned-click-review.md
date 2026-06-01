# 교통비용 상세분류 미지정 클릭 수정 리뷰

## 범위

- 계획 문서: `docs/ai/features/2026-06-01-transport-subcategory-unassigned-click.md`
- 요청 ID: `devreq_discord_1510804891134595225`
- 변경 범위: 교통비용 상세분류 후보 보강, 상세분류 지정 시트 기본 후보 노출/저장 보강, JS cache-bust 갱신

## 리뷰 결과

차단 이슈 없음.

## 확인 내용

- `data.js`의 기본 `교통비용` 카테고리에 `대중교통`, `택시`, `교통카드충전`, `기타교통` 상세분류 후보가 추가됐다.
- 기존 사용자 카테고리는 `_ensureBudgetCategoryIntegrity()`에서 누락된 교통비용 상세분류 후보를 보강한다.
- `render-report.js`는 `교통비용` 카테고리의 저장된 후보가 비어 있어도 기본 후보를 분류 시트에 즉시 보여준다.
- 저장 시 `ensureClassifierSubcategoryExists()`가 선택한 상세분류를 카테고리 설정에 먼저 등록한 뒤 거래 `subcategory`를 업데이트한다.
- `index.html`, `app.js`, `render-home.js`의 `app.js`/`render-report.js` cache-bust 문자열이 `20260601-transport-subcategory`로 갱신됐다.
- `sw.js` 파일이 없어 `STATIC_ASSETS`/`CACHE_VERSION` 갱신 대상은 없다.

## 검증

- `node --check data.js`: 통과
- `node --check render-report.js`: 통과
- `node --check app.js`: 통과
- `node --check render-home.js`: 통과
- `git diff --check`: 통과
- `npm.cmd run verify`: 통과
- GitHub Pages workflow `26729621624`: 성공
- 배포본 `https://aretenald2018-sys.github.io/budget/`: HTTP 200 및 `app.js?v=20260601-transport-subcategory` 포함 확인
- 배포본 `app.js`, `render-report.js`, `data.js`: HTTP 200 및 새 변경 문자열 포함 확인

## 남은 검증 갭

- not verified yet: 실제 로그인된 앱에서 `교통비용` 상세 모달의 `상세분류 미지정`을 클릭해 `상세분류 지정` 시트가 열리고 저장 버튼이 활성화되는지는 아직 확인하지 못했다. 프로젝트 지침상 sandbox 장기 dev server를 완료 검증으로 주장하지 않는다.
