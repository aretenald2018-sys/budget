# 낡은 끌림 알림 제거 및 설정/리포트 CSS 정리 계획

## 요청

- 홈/앱 사용 중 `미국 피노누아 신상을 다시 볼 시간이예요.` 같은 낡은 끌림 예약 알림이 뜨지 않게 제거한다.
- 설정 화면의 `보상 적립` 섹션에서 checkbox, range, select, input이 기본 브라우저 UI처럼 깨져 보이는 문제를 정리한다.
- 리포트 카테고리 내역 모달의 `쿠팡 쿠페이` 거래 행과 `환급처리` 체크 영역이 좁게 깨지는 문제를 정리한다.

## 결정

- 기존 Firestore `urges` 데이터나 기록 UI는 삭제하지 않는다.
- 앱 시작 시 scheduled urge를 읽어 toast/브라우저 알림을 예약하는 코드만 제거한다.
- 새로 `2주 뒤 다시 보기`를 선택해도 브라우저 notification/requestPermission을 예약하지 않는다.
- 설정 화면은 기존 흰 카드 기반 디자인 시스템 안에서 보상 적립 폼만 컴팩트하게 다듬는다.
- 리포트 카테고리 내역 거래 행은 전용 CSS를 추가해 거래 버튼과 환급 pill을 분리한다.

## 실행 슬라이스

- 수정 파일:
  - `app.js`
  - `urge/render-urge-alternatives.js`
  - `urge/render-urge-input.js`
  - `render-settings.js`
  - `render-report.js`
  - `styles/20-records.css`
  - `styles/60-urge.css`
  - `style.css`
  - `index.html`
  - 문서
- 검증:
  - 낡은 알림 문자열과 `Notification` 예약 경로 제거 확인.
  - `npm.cmd run verify`
  - `npm.cmd run pages:build`
  - 운영 GitHub Pages 배포 후 설정 화면과 리포트 카테고리 내역 모달을 직접 확인한다.
