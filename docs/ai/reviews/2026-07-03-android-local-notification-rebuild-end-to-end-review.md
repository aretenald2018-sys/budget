# Android 로컬 알림 수집 end-to-end 리뷰

## 결과

- blocking source-level finding: 없음.
- stale legacy path 재도입: runtime/source 검색과 `scripts/verify-project.mjs` 계약상 retired phone collection purge/Android local notification contract가 유지된다. 최신 `npm.cmd run verify`는 v2.0.5 APK 빌드 후 통과한다.
- WebView 저장 경로: `BudgetAndroid` bridge pending capture -> `app.js` flush -> `findSimilarTransaction()` -> `saveTransaction()` -> `refreshCurrentTab()` 흐름 확인.
- 캘린더 반영 경로: 거래 탭은 `renderTx()`가 월간 `listTransactions()`를 다시 읽고 `calendarCells()`/day sheet를 재렌더링하므로 저장 후 현재 거래 탭이면 즉시 반영된다. `npm.cmd run verify`는 Android capture sample이 거래 payload와 캘린더 `-12,800` 셀 HTML까지 이어지는 smoke를 포함한다.

## 검증 공백

- production deploy/push는 unrelated dirty worktree가 대량으로 있어 수행하지 않았다.
- 실제 Android notification listener 수신, 알림 접근 설정 이동, 결제 알림 -> Firestore 저장 -> production 캘린더 표시 흐름은 연결된 Android 기기가 없어 아직 확인하지 않았다.

## 후속 액션

- 의도한 변경만 정리해 `main`에 push하고 Pages workflow 성공을 확인한다.
- Android 기기에서 v2.0.5 APK 설치 후 설정의 `Android 알림 수집` 패널에서 알림 접근 권한을 켜고, 실제 결제 알림 수신 뒤 거래 캘린더 반영을 확인한다.
