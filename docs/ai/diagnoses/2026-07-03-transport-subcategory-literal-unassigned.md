# 교통비용 literal 미지정 상세분류 클릭 실패 진단

## 요청

- Discord 요청: `devreq_discord_1510804891134595225`
- 증상: `교통비용` 상세의 `상세분류 미지정` 클릭이 동작하지 않는다.

## 재현/피드백 루프

- 정적 코드 재현:
  - `render-report.js`의 상세분류 요약은 `tx.subcategory || '상세분류 미지정'`으로 행을 만든다.
  - 행 이름이 `상세분류 미지정`이면 클릭 가능한 버튼으로 렌더링된다.
  - 하지만 분류 시트는 `filter(tx => !tx.subcategory)`만 사용하므로 `subcategory: '상세분류 미지정'`처럼 label 문자열이 저장된 거래는 분류 대상에서 제외된다.
  - 이 경우 사용자는 클릭 가능한 `상세분류 미지정` 행을 보지만, 클릭 시 분류 시트가 열리지 않고 `분류할 미지정 거래가 없습니다.` 경로로 빠질 수 있다.
- 운영 정적 확인:
  - 운영 `index.html`, `app.js`, `render-report.js`, `styles/20-records.css`는 HTTP 200이다.
  - 운영 `render-report.js`에는 이전 touch guard(`preventSubcategoryTextSelection`, `scheduleSubcategoryPointerFallback`)가 포함되어 있다.

## 가설

1. Android/WebView 터치 fallback은 운영에 반영되어 있으므로 이번 교통비용 잔여 증상은 터치 이벤트 자체보다 미지정 판정 불일치 가능성이 높다.
2. 데이터 또는 export/import 경로에서 `subcategory`가 빈 값이 아니라 표시 문자열 `상세분류 미지정`으로 들어온 거래가 있으면 요약 행과 분류 대상 필터가 서로 달라진다.
3. 같은 문제가 교통비용 외 카테고리에도 생길 수 있으므로 미지정 판정은 공통 helper로 통일해야 한다.

## 수정 방향

- `render-report.js`에 `isUnassignedSubcategory()` helper를 추가한다.
- 상세분류 요약과 분류 대상 필터가 모두 빈 값 및 literal `상세분류 미지정`을 미지정으로 취급하게 한다.
- `app.js`, `render-home.js`, `index.html`의 cache-bust를 갱신해 새 `render-report.js`가 로드되게 한다.
