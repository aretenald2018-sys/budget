# 앱 전체 리팩토링 계획

## 요청 원문

앱 전체 리팩토링 계획 수립

## 상태

- 작성일: 2026-07-12
- 계획 상태: 제안 완료, 실행 전
- 기본 전략: 기능 동작과 저장 구조를 유지하는 점진적 리팩토링
- 기준 브랜치: `main` (`f966356`)
- 조사 시점 작업 트리: clean
- 기준 검증: `npm.cmd run verify` 통과 (`92 JS files checked`)

## 이해한 내용

- 목표:
  - 브라우저 SPA, Firestore 데이터 경계, 서버 API/Actions, Android bridge를 명확한 모듈 경계로 재구성한다.
  - 대형 파일과 전역 상태/인라인 이벤트 결합을 줄여 변경 범위와 회귀 위험을 낮춘다.
  - 현재 제품 동작, Firestore collection 경로, GitHub Pages 배포, Android 알림 수집을 유지한다.
  - 정적 검사 위주의 검증에 도메인 단위 테스트와 실제 사용자 흐름 검증을 추가한다.
- 비목표:
  - 리팩토링과 동시에 신규 기능 또는 시각 재설계를 넣지 않는다.
  - 첫 단계에서 React/Vue, TypeScript, bundler로 전면 이관하지 않는다.
  - Firestore 문서 구조를 일괄 마이그레이션하지 않는다.
  - Android 앱 프레임워크나 배포 방식을 교체하지 않는다.
- 사용자 흐름:
  - 로그인, 홈/리포트, 거래 조회·편집, 리뷰, 설정, 재무, 욕구/마인드뱅크, 뉴스피드 흐름은 유지한다.
  - Android 알림/SMS 후보는 로컬 큐와 WebView bridge를 거쳐 기존 `data.js` 저장 경계로 들어간다.
- 데이터 가정:
  - `users/{uid}` 아래 현재 collection 이름과 문서 의미를 호환성 계약으로 취급한다.
  - `raw_messages`는 삭제하지 않고 상태만 변경한다.
  - 브라우저의 Firestore 접근은 계속 root `data.js`를 공개 진입점으로 사용한다.
  - 서버의 Firestore 접근은 계속 `api/_lib/firebase-admin.js`를 경계로 사용한다.
- 열려 있는 질문:
  - 선택 탭 제거 후 남은 장보기/약속 데이터 API를 보존할지 제거할지는 참조와 실제 데이터 사용을 조사한 뒤 결정한다.
  - 장기적으로 TypeScript/bundler를 도입할지는 이번 구조 정리와 성능 기준선이 나온 뒤 별도 ADR로 판단한다.

## 현재 진단

### 구조적 병목

| 영역 | 현재 증거 | 문제 |
|---|---:|---|
| 데이터 경계 | `data.js` 2,796줄 | 인증, 거래, 보상, 뉴스, 설정, 장보기, 재무, 와인, 영수증이 한 모듈과 캐시에 결합됨 |
| 재무 UI | `render-finance.js` 2,561줄 | 계산, SVG 차트, 편집기, 상태, 이벤트, HTML 생성이 한 파일에 섞임 |
| 리포트 UI | `render-report.js` 1,887줄 | 홈 요약, 보상 원장, 분류기, 모달, 예산 계산이 함께 변경됨 |
| CSS | `styles/60-urge.css` 3,711줄 | urge 이름 아래 홈/리포트/재무/설정 스타일이 혼재됨 |
| CSS | `styles/50-cart-detail.css` 1,285줄 | 제거된 cart 명칭 아래 설정/와인/모달 스타일이 남아 있음 |
| 검증 | `scripts/verify-project.mjs` 1,653줄 | 중요한 계약 검증은 많지만 한 파일에 정적 검사와 smoke가 결합됨 |
| 이벤트 | `render-finance.js` inline `onclick` 44개, `window.*` 75회 | DOM 문자열, 전역 함수, 상태가 강하게 결합됨 |
| 테스트 | 독립된 일반 테스트 스위트 없음 | 순수 계산을 바꿀 때 `verify-project`와 수동 UI 확인에 과도하게 의존함 |

### 유지해야 할 강점

- Pages artifact가 allowlist 방식으로 만들어져 서버 코드와 문서가 공개되지 않는다.
- `verify-project`가 로컬 import, 배포 계약, Android bridge, 영수증 병합, 보상 위젯 등 핵심 회귀를 이미 막는다.
- 브라우저/서버 Firestore 경계와 비밀정보 경계가 문서와 검사로 명시되어 있다.
- 선택 탭과 과거 수집 경로의 재도입 방지 guard가 이미 있다.

## 목표 구조

```text
app.js (앱 셸: 인증, 탭 라우팅, 공통 수명주기)
  -> features/<feature>/controller.js
       -> view.js + events.js + state.js
       -> domain/<domain>/*.js       순수 규칙/계산
       -> data.js                    호환 공개 파사드
            -> data/core/*.js        Firebase, scope, cache
            -> data/repositories/*.js

api/*.js (얇은 HTTP adapter)
  -> api/services/*.js               use case/orchestration
  -> api/_lib/firebase-admin.js       서버 데이터 경계
  -> domain/shared/*.js               환경 독립 규칙만 공유

android/*
  -> parser -> local queue/store -> WebView bridge
  -> fixtures로 브라우저 capture schema와 계약 검증
```

## 결정 기록

- 결정: 빅뱅 재작성 대신 독립 배포 가능한 슬라이스로 진행한다.
  - 이유: 개인 금융 데이터와 Android 수집 경로는 작은 회귀도 실제 기록 손실/중복으로 이어질 수 있다.
  - 되돌릴 수 있는가: 각 슬라이스를 별도 commit과 review로 유지하면 가능하다.
- 결정: root `data.js`의 import 경로와 export 이름을 당분간 보존한다.
  - 이유: 브라우저 모듈 전체를 동시에 수정하지 않고 내부 repository를 단계적으로 분리할 수 있다.
  - 되돌릴 수 있는가: 가능하다. 새 모듈은 파사드 뒤에만 추가한다.
- 결정: 기존 바닐라 ESM과 정적 Pages 구조를 1차 리팩토링 동안 유지한다.
  - 이유: 구조 문제와 도구 이관 문제를 분리해야 회귀 원인을 좁힐 수 있다.
  - 되돌릴 수 있는가: 구조 정리 후 별도 ADR로 도구 도입을 결정할 수 있다.
- 결정: 라인 수 자체보다 책임 수, 공개 API, 테스트 가능성을 완료 기준으로 삼는다.
  - 이유: 파일을 단순히 잘게 나누는 것으로 결합도가 낮아지지는 않는다.
  - 되돌릴 수 있는가: 기준은 각 리뷰에서 조정 가능하다.

## 실행 원칙

1. 한 슬라이스에서는 하나의 경계만 바꾼다. 데이터 경계 변경과 화면 재설계를 섞지 않는다.
2. 모든 이동은 먼저 characterization test 또는 계약 검사를 추가한 뒤 수행한다.
3. Firestore 경로, 문서 필드 의미, dedupe/idempotency 규칙은 별도 승인 없이 변경하지 않는다.
4. 동적 HTML은 `data-*`와 delegated listener를 사용하고 새 inline handler를 추가하지 않는다.
5. CSS/JS 변경 시 기존 cache-busting 계약을 지키고, 서비스워커가 새로 생기면 `STATIC_ASSETS`와 `CACHE_VERSION`을 함께 관리한다.
6. 각 실행 슬라이스 뒤 별도 리뷰 세션을 두고 기능 추가 없이 회귀만 검사한다.
7. 사용자 화면이 바뀌는 슬라이스는 production Pages에서 실제 흐름을 확인해야 완료다.

## 실행 슬라이스

### 진행 기록

- 슬라이스 0: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice0-review.md`.
- 슬라이스 1: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice1-review.md`.
- 슬라이스 2: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice2-review.md`.
- 슬라이스 3: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice3-review.md`.
- 슬라이스 4: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice4-review.md`.
- 슬라이스 5: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice5-review.md`.
- 슬라이스 6: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice6-review.md`.
- 슬라이스 7: 완료. review는 `docs/ai/reviews/2026-07-12-appwide-refactor-slice7-review.md`.
- 슬라이스 8: 실행 중.

### 슬라이스 0: 안전망과 기준선 분리

- 우선순위: P0
- 예상 실행 세션: 1~2
- 목표:
  - 현재 동작을 고정하는 계약 목록과 테스트 기반을 만든다.
  - 1,653줄 `verify-project`를 책임별 검사 모듈로 나누되 검사 결과는 유지한다.
- 범위:
  - Node 내장 test runner 기반 `test/`와 공통 fixture 구조 추가.
  - 거래 분류, 환급, 포인트, 영수증 병합, Android capture의 현재 입출력 fixture 고정.
  - `scripts/verify/checks/`로 syntax/assets/deployment/browser/android/domain 검사를 이동.
  - 핵심 화면 수동 smoke matrix 문서화.
- 예상 수정 파일:
  - `package.json`
  - `scripts/verify-project.mjs`
  - `scripts/verify/checks/*`
  - `test/*`
  - `docs/ARCHITECTURE.md`
- 수정하지 말 것:
  - 앱 런타임 코드, Firestore 데이터, UI.
- 검증 방법:
  - 변경 전/후 `npm.cmd run verify` 결과 동일.
  - `npm.cmd test` 통과.
  - 고의로 계약 하나를 깨뜨렸을 때 해당 검사가 실패하는 mutation smoke 후 원복.
- 완료 증거:
  - CI `Validate`가 verify와 tests를 모두 실행한다.

### 슬라이스 1: 미사용 표면과 배포 산출물 정리

- 우선순위: P0
- 예상 실행 세션: 1~2
- 목표:
  - 제거된 선택 탭의 잔여 코드와 오해를 부르는 이름을 실제 참조 증거에 따라 정리한다.
- 범위:
  - `choice/` 중 API/recipe 스크립트가 쓰는 공용 모듈과 완전 미사용 모듈을 분류.
  - `data.js`의 cart/pact API, Firestore 실제 데이터, scripts 참조를 감사한 뒤 보존/retire 결정 기록.
  - `styles/50-cart-detail.css`에서 현재 사용되는 설정/와인/모달 규칙을 의미 있는 파일로 이동.
  - Pages allowlist와 retired-artifact guard 갱신.
- 예상 수정 파일:
  - `choice/*`, `styles/50-cart-detail.css`, 신규 `styles/*`
  - `style.css`, `index.html`
  - `scripts/build-pages.mjs`, `scripts/verify/checks/*`
  - 사용 증거가 없을 때만 `data.js`의 cart/pact 영역
- 수정하지 말 것:
  - 과거 Firestore 문서 삭제, recipe/Gmail 흐름의 동작 변경.
- 검증 방법:
  - 참조 그래프 재검색, `npm.cmd test`, `npm.cmd run verify`, `npm.cmd run pages:build`.
  - 설정, 와인 셀러, 공통 모달의 첫 화면과 저장 흐름을 production에서 확인.
- 완료 증거:
  - `_site`에 런타임에 필요 없는 모듈이 없고, 남은 `choice` 명칭은 실제 도메인 의미가 문서화된다.

### 슬라이스 2: `data.js` 파사드와 repository 분리

- 우선순위: P0
- 예상 실행 세션: 4~6
- 목표:
  - 공개 import 경로는 유지하면서 Firestore CRUD, 정규화, 캐시, migration을 도메인별로 분리한다.
- 순서:
  1. 인증/scope/cache core.
  2. 거래/카테고리/계좌/영수증/정산.
  3. 설정/보상/아이디어/욕구/마인드뱅크.
  4. 재무/와인/뉴스피드와 migration.
- 목표 모듈:
  - `data/core/firebase.js`, `data/core/session.js`, `data/core/cache.js`
  - `data/repositories/transactions.js`, `categories.js`, `settings.js`, `rewards.js`, `finance.js`, `newsfeed.js` 등
  - `data.js`는 호환 re-export와 초기화 조정만 담당.
- 수정하지 말 것:
  - 기존 export 이름/인자/반환값, collection 이름, raw message 보존 규칙.
- 검증 방법:
  - export surface snapshot, Firestore path contract, fixture 기반 payload normalization 비교.
  - 매 하위 슬라이스마다 `npm.cmd test`, `npm.cmd run verify`, `npm.cmd run pages:build`.
  - 로그인 후 홈/거래/설정/재무/뉴스피드 데이터 로드를 production에서 확인.
- 완료 증거:
  - UI 모듈이 repository 구현을 직접 알지 않고 root `data.js`만 import한다.
  - migration과 seed는 명시적인 버전, idempotency test, 소유 repository를 가진다.

### 슬라이스 3: 금융 도메인 규칙 순수화

- 우선순위: P0
- 예상 실행 세션: 2~3
- 목표:
  - 표시 코드와 저장 코드에 섞인 금융 규칙을 환경 독립 함수와 fixture로 고정한다.
- 범위:
  - 거래 포함/제외, 환급, 네이버페이 충전, self-transfer, shared payment, 카테고리 학습 규칙.
  - Gmail receipt merge/classification과 브라우저 receipt 적용의 공통 규칙.
  - 보상 포인트 계산과 Android widget snapshot 계약.
- 목표 모듈:
  - `domain/transactions/*`, `domain/receipts/*`, `domain/rewards/*`.
- 수정하지 말 것:
  - 기존 거래의 자동 재분류, 과거 데이터 일괄 수정.
- 검증 방법:
  - 실데이터를 익명화한 fixture의 before/after deep equality.
  - 중복 저장, 부분 환급, 충전+구매, Gmail+SMS 병합 edge case test.
- 완료 증거:
  - 같은 규칙이 브라우저/서버에 중복 구현되지 않거나, 불가피한 경우 동일 fixture 계약을 공유한다.

### 슬라이스 4: 대형 화면을 feature 모듈로 분리

- 우선순위: P1
- 예상 실행 세션: 5~8
- 목표:
  - 렌더러별 상태, 순수 view, event binding, modal controller를 분리한다.
- 순서:
  1. `render-report.js`: 보상 원장 modal → 상세분류 modal → 홈 요약/예산 게이지.
  2. `render-finance.js`: 계산/차트 → 포트폴리오 → 자산/시나리오 편집기.
  3. `render-settings.js`, `render-tx.js`, `modals/tx-edit-modal.js`.
  4. urge/mindbank/wine/newsfeed의 공통 패턴 정리.
- 목표 구조:
  - `features/<feature>/controller.js`
  - `features/<feature>/state.js`
  - `features/<feature>/view.js`
  - `features/<feature>/events.js`
  - `features/<feature>/modals/*.js`
- 수정하지 말 것:
  - 화면 정보구조, 저장 시점, 계산 공식, 디자인 토큰.
- 검증 방법:
  - view 함수 snapshot/DOM contract test와 실제 화면 조작 검증 병행.
  - 홈/리포트: 기간 전환, 첫 viewport, 보상 모달 CRUD, 카테고리 drill-down, 상세분류 저장.
  - 재무: 탭 전환, 차트, 자산 import/review, 보유자산 편집, 시나리오 저장.
  - 거래: 월/일 필터, 추가/편집/환급, review 이동.
- 완료 증거:
  - `app.js`는 앱 셸만 담당하고 feature 내부 상태를 직접 수정하지 않는다.
  - 한 modal 변경이 전체 renderer 재작성을 요구하지 않는다.

### 슬라이스 5: 이벤트와 CSS 경계 정리

- 우선순위: P1
- 예상 실행 세션: 3~5
- 목표:
  - inline handler와 `window.*` 전역 결합을 줄이고 CSS 파일명을 실제 feature 소유권과 맞춘다.
- 범위:
  - 동적 UI를 `data-action` + delegated listener로 단계 전환.
  - `window` 노출은 root shell 또는 기존 inline HTML 호환 entry로 제한.
  - CSS를 `tokens/base/components/features` 계층으로 재배치.
  - `styles/60-urge.css`의 report/finance/settings 규칙 분리.
  - 중복 selector, 과도한 specificity, feature 간 selector 의존 제거.
- 수정하지 말 것:
  - 전역 handler를 한 번에 제거하는 빅뱅 변경, 시각 재디자인.
- 검증 방법:
  - 신규 inline handler 0개 guard.
  - 주요 버튼 click/keyboard/touch 흐름과 modal mount 위치 확인.
  - CSS selector 사용 검사, 실제 모바일 viewport 시각 확인.
- 완료 증거:
  - feature CSS가 다른 feature DOM 구조에 의존하지 않는다.
  - 전역 함수 목록이 명시적 allowlist로 관리된다.

### 슬라이스 6: 서버 API와 GitHub Actions 서비스 계층 분리

- 우선순위: P1
- 예상 실행 세션: 3~4
- 목표:
  - endpoint, 인증/환경 검증, use case, 외부 API adapter, 저장 로직을 분리한다.
- 범위:
  - Gmail receipt polling/parser/enricher.
  - recipe/product/visual API.
  - Telegram feed 수집과 static snapshot.
  - 공통 error/result, env validation, timeout/retry/idempotency 정책.
- 목표 구조:
  - `api/*.js`: HTTP 입력/응답만 담당.
  - `api/services/*`: use case 조정.
  - `api/adapters/*`: Gmail/Gemini/Groq/Telegram 호출.
  - `api/_lib/firebase-admin.js`: 인증과 서버 데이터 경계 유지.
- 수정하지 말 것:
  - secret 위치, Actions schedule, 기존 사용자 scope.
- 검증 방법:
  - 외부 호출은 fixture/fake adapter로 테스트.
  - receipt merge와 sync replay idempotency test.
  - Actions dry-run 또는 명시적인 수동 dispatch 검증.
- 완료 증거:
  - endpoint handler를 외부 네트워크 없이 단위 테스트할 수 있다.

### 슬라이스 7: Android 수집 경계와 계약 강화

- 우선순위: P1
- 예상 실행 세션: 2~3
- 목표:
  - notification parser, SMS scanner, local queue, widget, WebView bridge의 책임과 payload schema를 고정한다.
- 범위:
  - capture payload schema/version 문서화.
  - 한국 결제 알림 fixture와 parser 결과 검증.
  - queue ack/retry/dedupe, 로그인 전후 flush 계약 검증.
  - widget snapshot의 웹/Java 필드 parity 검증.
- 수정하지 말 것:
  - raw capture 삭제 정책 완화, 브라우저 secret 저장, 서버 ingest 재도입.
- 검증 방법:
  - `npm.cmd run verify:android-notification`.
  - APK build, 기존 설치본 update, 실제 알림 수집 → 앱 열기 → Firestore 저장 → 거래 화면 표시 E2E.
- 완료 증거:
  - 실패한 capture가 유실되지 않고 재시도/상태를 추적할 수 있다.

### 슬라이스 8: 캐시·빌드·문서 최종 정리

- 우선순위: P2
- 예상 실행 세션: 1~2
- 목표:
  - 분산된 query-string cache version과 배포 계약을 한 릴리스 단위로 관리한다.
- 범위:
  - 단일 release manifest 또는 Pages build 시 asset version 주입 방식 설계.
  - source import와 `_site` 산출물의 버전 일관성 검사.
  - verify/test/pages build CI 단계와 실패 메시지 정리.
  - `README.md`, `docs/ARCHITECTURE.md`, ADR, 배포 문서를 실제 구조에 맞춤.
- 수정하지 말 것:
  - 검증 없이 service worker 도입, 비밀정보가 포함될 수 있는 파일의 Pages 복사.
- 검증 방법:
  - `npm.cmd test`, `npm.cmd run verify`, `npm.cmd run pages:build`.
  - 새 버전 배포 후 production에서 최신 JS/CSS 응답과 주요 UI 상태 확인.
- 완료 증거:
  - 한 릴리스 ID로 앱 entry, 내부 모듈, CSS, APK metadata의 캐시 계약을 추적할 수 있다.

## 우선순위와 의존성

```text
슬라이스 0 안전망
  -> 슬라이스 1 미사용 표면
  -> 슬라이스 2 data 경계
       -> 슬라이스 3 금융 규칙
            -> 슬라이스 4 UI 모듈
                 -> 슬라이스 5 이벤트/CSS

슬라이스 0 -> 슬라이스 6 서버
슬라이스 0 + 3 -> 슬라이스 7 Android
모든 구조 슬라이스 -> 슬라이스 8 release 정리
```

권장 첫 실행은 슬라이스 0이다. 슬라이스 0 완료 전에는 `data.js`, `render-report.js`, `render-finance.js`의 대규모 이동을 시작하지 않는다.

## 전체 완료 기준

- 구조:
  - root `data.js`와 `app.js`가 얇은 파사드/앱 셸 역할만 가진다.
  - browser/server/Android의 데이터 계약과 소유 모듈이 문서화된다.
  - 제거된 기능과 파일이 Pages artifact에 재유입되지 않는다.
- 자동 검증:
  - `npm.cmd test` 통과.
  - `npm.cmd run verify` 통과.
  - `npm.cmd run pages:build` 통과.
  - Android 관련 변경 시 `npm.cmd run verify:android-notification`과 APK build 통과.
- 실제 UI 검증:
  - production `https://aretenald2018-sys.github.io/budget/`가 HTTP 200.
  - 로그인, 홈, 거래, 리포트, 리뷰, 설정, 재무, 욕구/마인드뱅크, 뉴스피드의 핵심 흐름을 실제 조작.
  - modal 첫 viewport, 저장/취소, 모바일 viewport, 키보드/터치 상태 확인.
- 배포:
  - 의도한 commit만 `main`에 push.
  - `Deploy GitHub Pages` workflow 성공.
  - 변경된 asset이 production에서 최신 버전으로 로드됨을 확인.
- 데이터/보안:
  - raw message 삭제 없음.
  - 브라우저/localStorage에 server secret 없음.
  - Firestore 접근 경계 우회 없음.
  - 중복 거래, receipt merge, reward ledger의 기존 계약 유지.

## 중단 조건

- characterization fixture와 현재 production 동작이 다르면 이동을 중단하고 먼저 현재 계약을 결정한다.
- 실제 Firestore 데이터가 문서화된 schema와 다르면 자동 migration을 작성하지 않고 별도 진단/승인을 받는다.
- 작업 트리에 unrelated dirty change가 생기면 해당 파일과 겹치는 슬라이스를 중단한다.
- UI 또는 Android E2E를 수행할 수 없으면 해당 슬라이스는 `not verified yet`으로 남긴다.

## 리뷰 세션 프롬프트

이 계획 문서와 직전 실행 세션의 변경 파일을 읽고 버그, 금융 계산 회귀,
Firestore 경계 우회, raw message 삭제 가능성, 중복 거래, Android queue 유실,
오래된 asset cache, UX 깨짐과 누락된 테스트를 우선 리뷰한다. 리뷰 중에는 새
기능을 구현하지 않는다.

## NEXT_ACTION.md 업데이트

- 계획 세션 종료 상태: 제안 완료
- 다음 자동 상태: `needs_user_decision`
- 다음 액션: 사용자가 계획을 승인하면 슬라이스 0 안전망과 기준선 분리를 시작한다.
- 차단 질문: 권장 순서대로 슬라이스 0부터 실행할지, 특정 영역을 먼저 리팩토링할지 선택한다.
