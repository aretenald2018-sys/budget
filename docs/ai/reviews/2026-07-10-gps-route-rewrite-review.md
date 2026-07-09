# GPS Route Rewrite 리뷰

- 날짜: 2026-07-10
- 관련 계획: `docs/ai/features/2026-07-10-gps-route-rewrite.md`
- 관련 진단: `docs/ai/diagnoses/2026-07-10-gps-route-rewrite.md`
- 상태: review rerun pending
- 상태: local review in progress

## 목표

갤럭시워치와 모바일 러닝 기록 모두에서 시작점/끝점만 보이거나 `0.00 km`로 남는 GPS 표시를 제거하고, 실제 GPS 포인트 전체 궤적, 거리, km 마커, 페이스/시간/칼로리/고도/심박/케이던스를 표시한다.

## 초기 리뷰 실패

1. `data.js` cache-bust가 `20260708-reward-point-settlement`에 남아 있어 production cache에서 `listRunActivities()`가 없는 구버전 data module을 로드할 수 있었다.
2. QA harness가 `/data.js`를 stub 처리해 실제 앱 엔트리와 data boundary 로딩을 증명하지 못했다.
3. `utils/gps-route.js`가 250 LOC 기준을 초과했고, 여러 route alias 배열을 모두 이어붙일 수 있어 거리 과대계산 위험이 있었다.
4. QA harness localhost 서버가 repo root 임의 파일을 서빙할 수 있었다.
5. production GitHub Pages 배포/실데이터 검증은 아직 완료되지 않았다.

## 수정 결과

1. 모든 browser `data.js` import를 `data.js?v=20260710-gps-route-rewrite`로 통일했다.
2. 변경된 상위 모듈 import URL에 `data=20260710-gps-route-rewrite`를 추가해 cached parent module이 stale `data.js`를 다시 물고 가지 않도록 했다.
3. `utils/gps-route-core.js`를 분리해 `utils/gps-route.js`를 163 LOC, core를 170 LOC로 낮췄다.
4. route alias 후보는 첫 번째 유효 route set만 사용하고, 동일 배열 alias를 중복 연결하지 않도록 했다.
5. duration fallback은 `durationSeconds`/`durationMs` 외에 `startTime/endTime`, GPS timestamp, `elapsedSeconds`를 사용한다.
6. mobile summary는 `cadenceSpm`과 `heartRate.average`를 읽는다.
7. QA harness는 allowlist server로 제한했고, `/data.js` stub을 제거했다.
8. QA harness는 실제 `index.html`과 `app.js` module graph를 통과한 뒤 `renderRun()`을 실행하며, `requiredDataImport=true`, `requiredAppEntry=true`를 통과 조건으로 기록한다.
9. GPS route SVG는 직선 `L` segment 연결이 아니라 Catmull-Rom 계열 cubic curve path로 렌더링한다. 원본 GPS 포인트, 거리, km marker 계산은 그대로 유지한다.
10. `routePoints`가 시작/끝 2점 alias이고 `gps.samples` 또는 `workoutRoute.locations`가 전체 route인 혼합 payload에서는 유효 포인트 수가 가장 많은 route set을 선택한다.

## 검증

- `npm.cmd run verify`: PASS, `verify-project passed (95 JS files checked).`
- `npm.cmd run pages:build`: PASS, `_site` artifact 생성.
- `_site` cache contract: PASS.
- Headless Chrome 590x1280 app-entry QA:
  - Galaxy Watch fixture: 7 route points, `2.12 km`, 7 SVG points, `1킬로미터`/`2킬로미터` markers.
  - Mobile fixture: 7 route points, `2.12 km`, 7 SVG points, `1킬로미터`/`2킬로미터` markers.
  - `requiredDataImport=true`, `requiredAppEntry=true`.
  - `curveCommands=6`으로 전체 궤적 path가 cubic curve로 생성됨.
  - Mobile fixture는 2점 `routePoints`와 7점 `gps.samples`를 동시에 포함하며, QA 결과는 7 points/2.12 km/2개 km marker를 유지함.
  - No-route fixture: `0.00 km`, empty route state, `qaErrors=0`.
  - Two-point fixture: 2 route points, `0.69 km`, 최소 line state, `qaErrors=0`.
- Visual QA: `route-app-watch.png`, `route-app-mobile.png`에서 전체 궤적, 거리, 시간, 페이스, 칼로리, 고도, 심박, 케이던스 표시 확인.
  - `route-app-noRoute.png`, `route-app-twoPoint.png`에서 graceful fallback 확인.

## 리뷰 기준 점검

- `programming` 관점:
  - `utils/gps-route.js` 163 LOC, `utils/gps-route-core.js` 183 LOC로 250 LOC 기준 아래로 분리했다.
  - `as any`, `@ts-ignore`, `@ts-expect-error`를 추가하지 않았다.
  - GPS 포인트 정규화, 거리 계산, duration fallback, projection, rendering 경계를 분리했다.
- `remove-ai-slops` 관점:
  - route alias를 전부 이어붙이는 과잉 fallback을 제거하고, 유효 포인트가 가장 많은 단일 route set만 선택한다.
  - verifier의 구현명 mirror check를 제거하고 mixed-alias behavior check로 대체했다.
  - QA harness는 `/data.js` stub을 제거하고 실제 app entry/data import graph를 검증한다.
  - 실제 사용자 지적이 있었던 각진 path는 DOM `curveCommands > 0` QA로 퇴행 방지한다.

## 남은 배포 확인

- not verified yet: production GitHub Pages에는 아직 commit/push 배포 전이라 `render-run.js`와 `utils/gps-route.js`가 반영되지 않았다.
- 실제 사용자 Firestore 데이터의 collection 이름은 `users/{uid}/run_activities`로 구현했다. 실제 데이터가 다른 path에 있으면 ingest/export 쪽 매핑을 추가해야 한다.
