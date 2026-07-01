# 2026-06-30 거래 달력 UI 깨짐 진단

## 증상

- 사용자 스크린샷에서 `거래 내역` 탭의 월 달력이 기본 HTML 버튼처럼 보인다.
- 요일 라벨이 세로로 흐르고, 날짜/금액 칸이 납작한 기본 버튼 테두리로 표시된다.
- 하단 탭과 일부 카드 스타일은 살아 있어 전체 CSS 미로딩보다는 거래 달력 관련 CSS 누락에 가깝다.

## 확인한 재현/피드백 루프

1. 현재 CSS 정의 검색:
   - `rg -n "\.calendar-grid|\.cal-day" . -g "*.css"`
   - 현재 repo에는 `.calendar-grid` 기본 정의가 없고, `.cal-day`는 금액 텍스트 일부 스타일만 남아 있다.
2. 직전 커밋 기준 검색:
   - `git grep -n "\.calendar-grid\|\.cal-day" 4d0e02f^ -- "*.css"`
   - 삭제된 `styles/30-cart-board.css`에 `.calendar-grid`, `.cal-day`, `.tx-calendar-grid .cal-day` 기본 스타일이 있었다.
3. 스크린샷과 대조:
   - `.calendar-grid { display: grid; grid-template-columns: repeat(7, ...) }`가 빠지면 요일/날짜 버튼이 일반 문서 흐름과 기본 버튼 스타일로 렌더링되어 스크린샷과 같은 형태가 된다.

## 원인

`Remove choice tab` 커밋에서 `styles/30-cart-board.css`를 제거하면서, 그 안에 섞여 있던 거래 탭 달력 공용 스타일도 함께 사라졌다.

구체적으로 누락된 스타일:

- `.calendar-grid`
- `.cal-day`
- `.cal-day.blank`
- `.cal-day.active span`
- `#tab-tx .tx-calendar-grid .cal-day` 보강 일부

## 반증 가능한 가설

1. 전체 CSS 파일이 로드되지 않았다.
   - 가능성 낮음. 스크린샷에서 카드/하단 nav 등 다른 스타일은 적용되어 있다.
2. `render-tx.js`가 잘못된 마크업을 만들었다.
   - 가능성 낮음. 기존 렌더러는 `.calendar-grid tx-calendar-grid`와 `.cal-day`를 계속 출력한다.
3. 공용 달력 CSS가 선택 탭 CSS와 함께 삭제됐다.
   - 가능성 높음. 현재 repo에 기본 정의가 없고, 직전 커밋의 `styles/30-cart-board.css`에 존재한다.
4. 브라우저 캐시 문제다.
   - 가능성 낮음. 캐시라면 예전 CSS가 남아 덜 깨지는 방향일 수 있다. 현재는 삭제된 CSS가 없는 상태와 일치한다.

## 수정 계획

슬라이스 1 - 거래 달력 CSS 복구:

- `styles/20-records.css` 또는 `styles/70-reports.css`에 거래 탭에서 쓰는 `.calendar-grid`/`.cal-day` 기본 스타일을 되살린다.
- 선택 탭 전용 CSS는 복구하지 않는다.
- `style.css` import query 또는 `index.html` cache-busting query를 필요한 만큼 갱신한다.
- `npm.cmd run verify`로 정적 검증을 실행한다.
- 실제 UI 검증은 정상 터미널에서 `npm.cmd run dev` 실행 후 `http://localhost:5501/`의 거래 탭 달력 첫 화면을 확인한다.

## 하지 않을 것

- `styles/30-cart-board.css` 전체 복구.
- 선택 탭/cart UI 복구.
- 거래 데이터/수집 파이프라인 수정.
