# Native ingest API origin canonicalization 리뷰

## 결론

- 즉시 수정해야 할 문제는 발견하지 못했다.
- browser API base, 설정 화면 native ingest 기본값, Android native ingest 전송 URL이 `https://budget-snowy-iota.vercel.app` 기준으로 통일됐다.
- Android native 전송은 `NativeIngestClient`가 전송 직전에 `NativeIngestStore.getApiUrl()`을 호출하므로, 기존에 저장된 `liart` URL도 실제 전송 시 `snowy`로 정규화된다.

## 검증 상태

- HTTP endpoint 확인:
  - `snowy /api/ingest`: 401 Unauthorized
  - `snowy /api/client-config`: 200 OK
  - `liart /api/ingest`: 404 Not Found
  - `liart /api/client-config`: 404 Not Found
- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- 로컬 `npm.cmd run apk:build`: not verified yet. 이 환경에 `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`가 없어 Android APK 빌드가 중단됐다.

## 남은 리스크

- GitHub Pages에 공개되는 기본 APK는 현재 정책상 native ingest가 빠진 public variant다.
- 앱 자체 notification ingest를 실제 폰에서 쓰려면 native variant APK를 별도로 빌드/설치해야 한다.
- production 배포 후 GitHub Actions의 APK build와 Pages deploy 성공 여부를 확인해야 한다.

## NEXT_ACTION.md 업데이트

- 상태: `complete`
- 다음 액션: 없음
