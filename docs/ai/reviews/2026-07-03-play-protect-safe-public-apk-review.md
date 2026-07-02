# Play Protect 대응 공개 APK 리뷰

## 결론

- 소스/빌드 기준으로 즉시 수정해야 할 문제는 발견하지 못했다.
- 공개 APK에서 Play Protect 차단 가능성이 큰 notification listener와 WebView JS bridge가 제거됐다.
- 기본 APK 권한은 `INTERNET`만 남았다.

## 리스크

- Play Protect 판정은 Google 서버/기기 상태에 좌우되므로 코드 변경만으로 설치 허용을 보장할 수 없다.
- 기존 `versionCode=2` APK가 이미 설치된 경우 이번 `versionCode=3`은 같은 signing key라 업데이트 조건을 만족하지만, 이전 랜덤 debug key APK에서 넘어오는 첫 설치는 삭제가 필요할 수 있다.
- native 앱 자체 알림 수집은 공개 APK에서 빠졌으므로, 현 시점 결제 알림 자동 수집의 운영 기본값은 MacroDroid다.

## 검증 상태

- 로컬 syntax/verify/pages/APK build 통과.
- 공개 APK manifest에서 `NotificationListenerService` 제거 확인.
- 공개 APK dex에서 native ingest/JS bridge 문자열 제거 확인.
- GitHub Pages workflow run `28626751326` 성공.
- production URL `https://aretenald2018-sys.github.io/budget/`: HTTP 200.
- production APK URL `https://aretenald2018-sys.github.io/budget/downloads/budget.apk?v=20260703-play-protect-safe-v3`: HTTP 200.
- production APK metadata:
  - `versionCode=3`
  - `versionName=2.0.2`
  - `nativeIngestEnabled=false`
  - `signing.updateSafe=true`
- production APK manifest:
  - permission `android.permission.INTERNET`만 표시
  - `notification-listener` component 없음
- production APK dex:
  - native ingest/JS bridge 문자열 없음
- 운영 설정 화면에서 `v2.0.2 · Play Protect 대응 공개 APK`, 새 APK 링크, MacroDroid 기본 안내 문구 확인.
