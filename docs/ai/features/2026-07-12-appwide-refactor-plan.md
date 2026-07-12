# 앱 전체 리팩토링 계획 — 현재 화면 기준 교정본

## 상태

- 작성·교정일: 2026-07-12
- 구현 상태: 완료
- 검증 범위: 단위 테스트, 정적 계약 검사, GitHub Pages 산출물 빌드
- 제외 범위: 사용자 요청에 따라 브라우저·production·Android E2E를 수행하지 않음

## 오보고 교정

기존 문서는 다음 항목이 남아 있는데도 전체 완료로 기록했다.

- 이미 제품에서 삭제된 욕구, 마인드뱅크, 와인 셀러를 활성 범위로 취급했다.
- `render-finance.js`, `render-report.js`, `render-settings.js`, `render-tx.js`에 상태·이벤트·저장 책임이 남아 있었다.
- `release.json`과 별개로 소스 import마다 서로 다른 날짜형 cache query가 하드코딩돼 있었다.
- 수행하지 않은 production·Android E2E를 완료 증거로 적었다.

이 완료 표기는 무효로 하고 현재 화면과 저장 경계를 다시 조사해 아래 범위로 교정했다.

## 현재 제품 범위

- 앱 셸: 인증, 공개/인증 탭 라우팅, 공통 수명주기
- 화면: 홈/리포트, 거래, 재무, 설정, 리뷰, 정산, 뉴스피드
- 공통 UI: 거래·계좌·카테고리 모달
- 데이터: root `data.js` 파사드와 `data/repositories/*`
- 서버: Gmail 영수증, 레시피/상품 분석, Telegram 공개 피드 Actions/API
- Android: 로컬 알림/SMS 후보 큐와 WebView bridge

욕구, 마인드뱅크, 와인 셀러는 현재 제품 범위가 아니다. 관련 런타임, 데이터 파사드, 스타일, 테스트, Pages 복사 경로는 제거하고 재유입 방지 검사를 둔다. 기존 Firestore 사용자 데이터는 삭제하지 않는다.

## 목표 경계

```text
app.js
  -> 화면 renderer: 조회와 view 조합
       -> features/<feature>/state.js
       -> features/<feature>/controller.js
       -> features/<feature>/view.js 또는 events.js
       -> data.js
            -> data/repositories/*

features/app/background-sync.js
  -> Android queue flush
  -> server auto-sync

release.json
  -> scripts/build-pages.mjs
       -> _site의 모든 로컬 asset URL에 releaseId 주입
```

## 실행 결과

1. 삭제 기능 잔재 제거
   - 욕구·마인드뱅크·와인 셀러의 런타임, repository, API, 스타일, 테스트와 Pages 경로를 제거했다.
   - `index.html`, `app.js`, `data.js`, Firestore index와 verifier에서 활성 참조를 제거했다.
2. 화면 책임 분리
   - 재무와 리포트의 상태·폼·CRUD·이벤트를 feature state/controller로 이동했다.
   - 설정의 상태·Android 상태 view·mutation/event를 분리했다.
   - 거래, 리뷰, 정산, 뉴스피드의 상태와 이벤트/controller를 분리했다.
   - Android queue 및 서버 자동 동기화를 `features/app/background-sync.js`로 이동했다.
3. 릴리스 계약 단일화
   - 소스의 날짜형 cache query를 모두 제거했다.
   - `release.json.releaseId`를 브라우저 릴리스의 단일 source로 정했다.
   - Pages 빌드가 로컬 JS, CSS, webmanifest, JSON, 이미지, APK 참조를 동일 releaseId로 stamp하고 누락을 거부한다.
   - Android APK binary metadata의 `cache.apk`는 Android artifact 계약으로 별도 유지한다.
4. 회귀 방지
   - 각 state 모듈 단위 테스트와 renderer/controller 책임·크기 guard를 추가했다.
   - 삭제 기능과 수동 cache query의 재도입을 verifier가 차단한다.

## 완료 기준과 증거

- `npm.cmd test`: 66/66 통과
- `npm.cmd run verify`: 176개 JavaScript 파일 검사 통과
- `npm.cmd run pages:build`: `_site` 생성 및 release stamp/allowlist 검사 통과
- `git diff --check`: 통과
- E2E: 수행하지 않음(사용자 지시)

이 문서에서 완료는 위 비-E2E 구조·계약 검증 범위에만 해당한다. production 화면을 실제 조작했다거나 Android 실기기 흐름을 확인했다는 의미가 아니다.
