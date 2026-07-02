# 공개 APK와 native 수집 APK 이원화 리뷰

## 결론

- 이전 처리의 핵심 문제였던 "native 수집 기능 상실"을 복구했다.
- public APK는 Play Protect 차단 가능성을 줄이는 안전형 APK로 유지된다.
- native APK는 같은 signing key와 같은 package name을 사용하며, private 경로에서 앱 자체 수집을 활성화할 수 있다.

## 리스크

- native APK를 다시 공개 웹 다운로드로 배포하면 Play Protect 차단이 재발할 수 있다.
- native APK 설치는 ADB, Google Play internal testing, internal app sharing 등 신뢰 경로가 필요하다.
- public APK와 native APK가 같은 `versionCode`일 때 이미 같은 versionCode가 설치되어 있으면 package installer 업데이트가 거부될 수 있다. 설치 순서를 바꿀 때는 다음 빌드에서 `BUDGET_ANDROID_VERSION_CODE`를 더 크게 지정한다.

## 검증 상태

- public/native APK 양쪽 로컬 빌드 통과.
- public APK에서 sensitive native/bridge 문자열 제거 확인.
- native APK에서 notification listener/bridge 포함 확인.
- production deploy와 운영 APK URL 확인은 push 후 기록한다.
