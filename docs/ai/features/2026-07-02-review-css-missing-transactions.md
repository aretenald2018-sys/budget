# 검토 탭 CSS 복구 및 7월 2일 누락 거래 등록 계획

## 배경

사용자가 토스 2026년 7월 2일 내역 사진과 앱 검토 탭 CSS 깨짐 사진을 첨부하며, 내역 중 앱에 없는 것들을 전부 등록하고 깨진 CSS를 고치라고 요청했다.

진단 문서: `docs/ai/diagnoses/2026-07-02-review-css-missing-transactions.md`

## 그릴 결과

- 핵심 질문: 사진의 모든 줄을 그대로 소비로 넣을지, 취소/자기이체/충전 성격을 구분할지?
- 결정: 거래 원장은 필요한 경우 생성하되, 소비 합계에는 성격에 맞게 반영한다.
- 이유: `토스증권` 이체와 `T맵주차` 0원/취소선 표시를 일반 소비로 넣으면 홈/월간 지출이 왜곡된다.
- 남은 가정: 운영 Firestore 대조는 현재 Codex 환경의 secret 미설정으로 불가하므로, 실행 시 정상 터미널 환경에서 먼저 dry-run을 수행한다.

## 실행 슬라이스 1 - 2026-07-02 누락 거래 대조 및 등록 도구

상태: 실행 완료

실행 문서: `docs/ai/executions/2026-07-02-review-css-missing-transactions-slice1.md`

### 목표

- 첨부 토스 내역을 기준으로 2026-07-02 거래를 대조한다.
- 이미 있는 거래는 건드리지 않고, 없는 거래만 생성한다.
- 자기이체/투자 이동/취소 후보가 소비 합계에 섞이지 않도록 한다.

### 예상 변경 파일

- `scripts/reconcile-toss-2026-07-02.mjs` 또는 범용 `scripts/reconcile-manual-transactions.mjs`
- 필요 시 `docs/ai/executions/2026-07-02-review-css-missing-transactions-slice1.md`
- `docs/ai/NEXT_ACTION.md`

### 등록 후보

| 거래 | 금액 | 기본 처리 |
| --- | ---: | --- |
| 배부른 감자탕 문정문점 | 11,000 | `card_payment`, 소비 |
| 마인드풀 상담심리연구소 | 120,000 | `card_payment`, 소비 |
| 키오스크_나이스 | 1,440 | `card_payment`, 소비 |
| 키오스크_나이스 | 1,280 | `card_payment`, 소비 |
| 키오스크_나이스 | 1,120 | `card_payment`, 소비 |
| 쿠팡 쿠페이 | 113,000 | `card_payment`, 소비 |
| 쿠팡 쿠페이 | 19,050 | `card_payment`, 소비 |
| 내하나계좌 -> 티머니 | 55,000 | 교통 충전. `transfer_out` 또는 기존 티머니 처리 방식에 맞춰 교통비용 |
| 내 계좌 이체 하나 -> 토스증권 | 905,887 | 소비 제외 자기이체/투자 이동 |
| T맵주차 | 0 또는 1,500 | 기본 생성 제외. raw/명시 확인이 있으면 별도 처리 |

### 구현 원칙

- `users/{USER_UID}/transactions`를 날짜/금액/가맹점으로 먼저 조회해 중복을 막는다.
- 대조 결과는 `dry-run`과 실제 적용 모드를 분리한다.
- 실제 적용 모드는 생성/스킵/제외 판정을 콘솔에 남긴다.
- 운영 data write는 server/admin 경로만 사용한다.
- raw message는 삭제하지 않는다.

### 검증

1. 정상 터미널에서 `FIREBASE_SERVICE_ACCOUNT`, `USER_UID`가 있는지 확인한다.
2. dry-run으로 기존 거래와 생성 예정 거래를 출력한다.
3. 실제 적용 후 같은 dry-run을 다시 돌렸을 때 생성 예정이 0건이어야 한다.
4. 앱 거래 탭 2026-07-02에서 후보 거래가 보이고, `토스증권`은 소비 합계에 반영되지 않아야 한다.

### 하지 않을 것

- 사진에 없는 날짜의 거래를 같이 생성하지 않는다.
- `T맵주차` 0원/취소선 거래를 임의로 소비 생성하지 않는다.
- pending raw 전체 재처리나 Gemini parser 변경을 이 슬라이스에 섞지 않는다.

## 실행 슬라이스 2 - 검토 탭 CSS 복구

상태: 실행 완료

실행 문서: `docs/ai/executions/2026-07-02-review-css-missing-transactions-slice2.md`

### 목표

- 첨부 사진 2의 검토 탭 첫 화면이 모바일에서 앱 스타일로 보이게 복구한다.
- 기본 브라우저 버튼/큰 본문 텍스트가 노출되지 않게 한다.

### 예상 변경 파일

- `styles/50-cart-detail.css`
- `style.css`
- `index.html`
- 필요 시 `render-review.js`
- `docs/ai/executions/2026-07-02-review-css-missing-transactions-slice2.md`
- `docs/ai/NEXT_ACTION.md`

### 구현 원칙

- `render-review.js`의 현 마크업인 `.review-hero`, `.chips .chip`, `.insight.review`를 기준으로 CSS를 복구한다.
- 선택 탭 전용 CSS 파일이나 삭제된 `#tab-cart` 스타일은 되살리지 않는다.
- CSS를 바꾸면 `style.css` import query와 `index.html` stylesheet query를 함께 갱신한다.
- repo root에 `sw.js`가 없으므로 service worker cache bump 대상은 현재 확인되지 않았다.

### 검증

1. `npm.cmd run verify`로 정적 검증을 실행한다.
2. `npm.cmd run pages:build`로 GitHub Pages artifact를 생성한다.
3. 의도한 변경만 커밋/푸시해서 `Deploy GitHub Pages` workflow를 실행한다.
4. `https://aretenald2018-sys.github.io/budget/` 접속 후 검토 탭을 연다.
5. 다음 UI 상태를 확인한다.
   - hero 카드 글자 대비와 간격이 정상이다.
   - 필터 버튼이 앱 칩 스타일로 보인다.
   - `검토 컨텍스트`가 작은 카드/패널로 보이고 본문이 과도하게 커지지 않는다.
   - 카드 액션 버튼과 입력이 모바일 폭에서 줄바꿈되어도 겹치지 않는다.

## 리뷰 기준

- 중복 거래 생성 가능성
- 자기이체/취소/충전 거래가 소비 합계를 왜곡하는지
- 검토 탭 CSS가 홈/거래/목표 탭 스타일을 덮는지
- cache-busting query 누락 여부
- 실제 로그인 세션에서 검토 탭과 2026-07-02 거래 탭 UI가 확인됐는지

## 다음 실행 프롬프트

`docs/ai/features/2026-07-02-review-css-missing-transactions.md`의 실행 슬라이스 1만 구현한다. 첨부 토스 2026-07-02 거래 후보를 운영 Firestore와 dry-run으로 대조한 뒤 없는 거래만 등록할 수 있는 admin 스크립트를 만들고, `T맵주차` 0원/취소선과 `토스증권` 자기이체가 소비 합계를 왜곡하지 않게 처리하라. 앱 CSS는 이 슬라이스에서 수정하지 마라.
