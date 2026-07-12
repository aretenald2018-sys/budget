# 앱 전체 리팩토링 슬라이스 2 리뷰

## 결론

- 슬라이스 2 완료. root `data.js`는 223줄의 초기화/호환 export 파사드가 되었고 Firestore 구현은 도메인 repository로 이동했다.
- 기존 공개 export 93개, collection 이름, migration version과 데이터 반환 계약을 유지했다.
- 차단 회귀는 발견되지 않았다. 슬라이스 3 금융 도메인 규칙 순수화로 진행할 수 있다.

## 변경 경계

- `data/core/firebase.js`: 인증, UID scope, session cache와 Firebase 초기화.
- `data/repositories/master-data.js`: 계좌, 카테고리, 앱 초기 master data.
- `data/repositories/transactions.js`: 거래, 영수증, 정산, raw message 상태, 가상 포인트 원장.
- `data/repositories/behavior.js`, `settings.js`: 욕구/마인드뱅크/아이디어/약속과 앱 설정.
- `data/repositories/finance.js`, `newsfeed.js`, `wine.js`: 재무 migration/seed, Telegram feed fallback, 와인 migration/CRUD.
- `data/constants.js`, `data/shared/normalize.js`: 공유 상수와 정규화 경계.
- `data.js`: 기존 import 경로와 export 이름을 보존하는 파사드 및 `initData` 조정만 담당.

## 회귀 방지

- `test/data-export-contract.test.mjs`가 root `data.js` 공개 export 93개를 snapshot으로 고정한다.
- 정적 검사는 root 파사드를 300줄 이하로 제한하고 Firestore SDK/CRUD 구현의 재유입을 막는다.
- Pages 검사는 core, shared, 상수와 repository 7개의 배포 산출물을 모두 요구한다.
- newsfeed와 reward ledger 검사는 구현 소유 repository를 직접 검사하도록 경로를 갱신했다.
- 모든 root `data.js` import는 `20260712-data-repositories` 캐시 버전을 사용한다. 이 저장소에는 service worker가 없어 별도 `CACHE_VERSION` 갱신 대상은 없다.

## 검증

- `npm.cmd test`: 12/12 통과.
- `npm.cmd run verify`: 통과, 103개 JS 파일 검사.
- `npm.cmd run verify:recipes`: 11개 sample 통과.
- `npm.cmd run pages:build`: `_site` 생성 통과.
- GitHub Pages workflow [29186327017](https://github.com/aretenald2018-sys/budget/actions/runs/29186327017): build/deploy 성공.
- production `https://aretenald2018-sys.github.io/budget/`: HTTP 200.
- production 자산 `data.js`, `data/repositories/transactions.js`, `finance.js`, `newsfeed.js`: 각각 HTTP 200.
- 로그인된 production UI에서 다음 데이터를 실제로 확인했다.
  - 홈: 격주 예산, 카테고리 게이지와 포인트 원장.
  - 거래: 2026년 7월 42건과 합계/환급 정보.
  - 설정: 사용자 정보, 카테고리 14개와 월 예산/보상 설정.
  - 목표: 재무 시나리오 그래프와 20년 축적표.
  - 뉴스: 71개 채널, 20,000건 snapshot과 실제 기사 목록.

## 커밋

- `7e83950` Extract browser data core
- `9b95d0c` Extract account and category repository
- `f65ab9e` Extract transaction repository
- `5d5f7d2` Extract behavior and settings repositories
- `94762ba` Extract remaining browser data repositories

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 3에서 거래/영수증/보상 계산 규칙을 환경 독립 함수와 fixture로 고정한다.
