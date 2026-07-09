# GPS Route Rewrite 리뷰

- 날짜: 2026-07-10
- 관련 계획: `docs/ai/features/2026-07-10-gps-route-rewrite.md`
- 관련 진단: `docs/ai/diagnoses/2026-07-10-gps-route-rewrite.md`
- 상태: review rerun required after production deploy

## 목표

갤럭시워치와 모바일 러닝 기록 모두에서 시작점/끝점만 보이거나 `0.00 km`로 남는 GPS 표시를 제거하고, 실제 GPS sample 배열 기반 전체 궤적, 거리, km marker, 시간/페이스/칼로리/고도/심박/케이던스를 표시한다.

## 수정 결과

1. `utils/gps-route-core.js`에서 fixed meter delta thinning과 start/end endpoint synthesis를 제거했다.
2. `normalizeRunActivityRoute()`는 mobile `gps.samples`, Galaxy Watch형 `route.locations`, `latE7/lngE7`, mixed alias payload에서 가장 완전한 route set을 보존한다.
3. `render-run.js`는 최소 3개 GPS sample이 있을 때만 route path를 그리고, 0~2개 point는 insufficient route state로 처리한다.
4. `data.js`에 `saveRunActivity()`를 추가했다. GPS points는 `users/{uid}/run_activities/{activityId}/route_chunks`에 저장하고, `routeRevision`이 일치하며 `routeComplete === true`인 chunk set만 hydrate한다.
5. route rewrite 시 legacy inline `gps`/`routePoints`/`locations` 등 정밀 위치 필드는 삭제하고, 짧아진 route의 obsolete chunks도 삭제한다.
6. 목록은 `hydrateRoutes: false`로 요약만 읽고, 선택된 기록만 `getRunActivity()`로 full route를 hydrate한다.
7. Android APK는 `application/gpx+xml`, `application/vnd.garmin.tcx+xml`, `application/json`, `application/xml` route file share만 받는다. `text/plain` retired cart share target은 복구하지 않았다.
8. `RunActivityImportStore`와 `BudgetAndroidBridge`를 추가해 Android route import queue를 WebView로 넘기고, 웹앱은 `saveRunActivity()` 저장 성공 후 ack한다.
9. browser import/cache-bust token을 `20260710-gps-route-fidelity`로 올렸다.

## 검증

- `npm.cmd run verify`: PASS, `verify-project passed (95 JS files checked).`
- `node .omo/evidence/gps-route-storage-audit-20260710/gps-route-contract-qa.mjs`: PASS.
- `node .omo/evidence/gps-route-storage-audit-20260710/gps-route-repro.mjs`: PASS.
- `node .omo/evidence/gps-route-storage-audit-20260710/android-route-import-contract-qa.mjs`: PASS.
- Playwright mobile fixture QA 390x844: HTTP 200, full route 6 points, `2.84 km`, curved SVG path, 2 km markers.
- Full-route screenshot evidence: `.omo/evidence/gps-route-storage-audit-20260710/gps-route-ui-full-current.png`.
- Playwright endpoint QA: two-point route has 2 normalized points but `data-route-polyline-points=0`; endpoint-only has 0 points and no SVG path.
- `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ANDROID_SDK_ROOT="$LOCALAPPDATA/Android/Sdk" JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" npm.cmd run apk:build`: PASS, `v2.1.9/20`.
- `npm.cmd run pages:build`: PASS, `_site` artifact generated.
- `git diff --check`: PASS.

## Not Verified Yet

- Production GitHub Pages: not deployed yet, so production still needs asset/version verification after commit/push.
- Real Health Connect automatic Galaxy Watch sync: not implemented in this slice. Actual device route ingestion is covered by Android GPX/TCX/JSON file import queue, not background Health Connect sync.
- Authenticated production Firestore round trip with a real exported route file: still needs device-side verification after APK build/deploy.
