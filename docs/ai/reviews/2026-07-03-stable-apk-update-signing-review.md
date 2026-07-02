# 안정 APK 업데이트 설치 지원 리뷰

## 결론

- 소스/빌드 기준으로 즉시 수정해야 할 문제는 발견하지 못했다.
- 기존 문제였던 매 빌드 신규 debug keystore 생성과 고정 `versionCode=1`은 제거됐다.
- production workflow는 GitHub Secrets의 동일 signing key를 사용하도록 연결됐다.

## 확인한 리스크

- 사용자의 휴대폰에 이미 설치된 APK가 이전 랜덤 debug key로 서명되어 있으면, 이번 안정키 APK로 넘어가는 첫 설치는 삭제 후 재설치가 필요할 수 있다.
- 다음 버전부터는 `versionCode`를 증가시키지 않으면 Android가 업데이트 설치를 거부할 수 있다.
- signing key 백업을 잃으면 기존 설치본을 업데이트할 수 없으므로 GitHub Secrets와 로컬 `.android-signing/budget-update.keystore` 보관이 중요하다.

## 검증 상태

- 로컬 syntax/verify/pages/APK build 통과.
- APK manifest의 package/versionCode/versionName 확인.
- APK signer certificate SHA-256 확인.
- GitHub Secrets 등록 확인.
- GitHub Pages workflow run `28626096639` 성공.
- production URL `https://aretenald2018-sys.github.io/budget/`: HTTP 200.
- production APK URL `https://aretenald2018-sys.github.io/budget/downloads/budget.apk?v=20260703-stable-apk-v2`: HTTP 200.
- production APK metadata:
  - `versionCode=2`
  - `versionName=2.0.1`
  - `signing.mode=github-secret`
  - `signing.updateSafe=true`
- production APK signer SHA-256:
  - `bf49ffeafd491e3e67aa3be8e0b7aff15f06b0b5931fb5b6840141836ebfba91`
- 운영 설정 화면에서 `v2.0.1 · APK 업데이트 설치 지원`과 APK 링크 `./downloads/budget.apk?v=20260703-stable-apk-v2` 노출 확인.
