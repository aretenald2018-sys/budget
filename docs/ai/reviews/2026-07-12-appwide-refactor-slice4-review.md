# 앱 전체 리팩토링 슬라이스 4 리뷰

## 결론

- 슬라이스 4 완료. 대형 renderer의 상태 계산, 순수 view, modal/controller를 `features/` 소유 모듈로 분리했다.
- 정보구조, Firestore 저장 시점, 금융 계산 공식, 디자인 토큰은 바꾸지 않았다.
- production 조작 중 발견한 설정 의존성 2건과 report renderer 중복 instance 1건을 수정하고 재현 계약을 추가했다.
- 슬라이스 5 이벤트와 CSS 경계 정리로 진행할 수 있다.

## 변경 경계

- `features/report/*`: 보상 포인트 사용 원장, 상세분류 일괄 지정, 홈/리포트 예산 요약.
- `features/finance/*`: 시나리오 계산·차트, 포트폴리오 정책, 시나리오/실적 편집 view.
- `features/settings/*`: 보상 설정 정규화·form/view, 월 예산 그룹·요약.
- `features/transactions/*`: 검토 안내 controller/view, 거래 편집 view와 상세분류 control.
- `features/newsfeed/*`: pagination state, 화면 view, KST 다이제스트 생성.
- `features/wine-cellar/view.js`: 셀러 카드, 시음 카드, 사진/입력 view와 점수 요약.
- `render-report.js` 1,206줄, `render-finance.js` 1,450줄, `render-settings.js` 565줄, `render-tx.js` 376줄, `render-newsfeed.js` 194줄, `modals/tx-edit-modal.js` 399줄로 줄였다.

## 리뷰에서 발견하고 수정한 회귀

- `render-settings.js`가 추출된 `currentRhythm`을 import하지 않아 production 설정 탭이 실패했다. 명시 import와 verifier guard를 추가했다.
- `data/repositories/settings.js`에 `normalizeISODate`가 이동되지 않아 저장된 앱 설정 대신 fallback이 사용될 수 있었다. 정규화 함수를 복원하고 `20260712-domain-rules-r2` cache contract로 모든 browser data import를 갱신했다.
- `render-home.js`와 `app.js`가 서로 다른 query string으로 `render-report.js`를 로드해 STATE가 둘로 나뉘었다. 그 결과 카테고리 합계는 보이지만 상세 시트는 0건이었다. app/home/settings의 report module URL을 통일하고 singleton contract test를 추가했다.
- 위 세 문제는 최종 production에서 설정 저장값, 카테고리 16건, 상세분류 미지정 9건으로 재확인했다.

## 계약과 회귀 방지

- 27개의 feature/domain test 파일, 총 42개 Node test가 state/view/legacy payload/HTML action 계약을 고정한다.
- verifier가 report, finance, settings, transaction, newsfeed, wine feature 소유권과 renderer 최대 줄 수를 검사한다.
- Pages artifact 검사에 신규 `features/` 파일을 모두 추가했다.
- app/home/settings가 정확히 같은 `render-report.js` URL을 쓰는지 test와 verifier가 함께 확인한다.
- settings repository가 사용하는 ISO date normalizer와 renderer의 `currentRhythm` import를 verifier가 확인한다.

## 검증

- `npm.cmd test`: 42/42 통과.
- `npm.cmd run verify`: 통과, 142개 JS 파일 검사.
- `npm.cmd run verify:recipes`: 11개 sample 통과.
- `npm.cmd run pages:build`: `_site` 생성 통과.
- GitHub Pages workflow [29188192901](https://github.com/aretenald2018-sys/budget/actions/runs/29188192901): build/deploy 성공.
- production `https://aretenald2018-sys.github.io/budget/`: HTTP 200, 최종 브라우저 console warning/error 0건.
- 신규 report/finance/settings/transaction/newsfeed/wine feature 자산과 settings repository: 각각 HTTP 200.
- 로그인된 production UI에서 다음을 실제 조작했다.
  - 홈/리포트: 격주·월간 전환, 저장된 4개 포인트 설정, 포인트 사용 모달 첫 viewport와 닫기.
  - 카테고리 drill-down: 생활비용 369,410원, 16건과 상세분류별 합계 확인.
  - 상세분류 modal: 미지정 9건 전체 선택, custom select styling, native control 노출 0건, 저장하지 않고 취소.
  - 재무: 시나리오 차트/20년 표, 시뮬레이션 관리자, 실적 업데이트 sheet 열기·닫기, 자산/포트폴리오 panel.
  - 설정: 총 예산 2,550,000원, 14개 카테고리 rhythm control, 저장된 custom 포인트 4개와 일일 카드 설정.
  - 거래: 월/일 캘린더, 검토 안내 1건, 거래 편집 modal, 공동결제 2/3/4명, 환급예정, 상세분류 접힘·펼침, 취소.
  - 뉴스피드: 20,000건/71개 채널, category filter, 일일·주간 다이제스트 menu.
- 와인 셀러 view는 production asset HTTP 200과 snapshot/escape test로 확인했다. 현재 bottom nav에는 직접 진입 버튼이 없어 이번 slice에서 production 화면을 우회 호출하지 않았다.

## 커밋

- `435d2d8` Extract report reward point feature
- `00abef0` Extract report subcategory classifier feature
- `9c30e8d` Extract report budget summary feature
- `a34d6e3` Extract finance projection feature
- `4b6c8fc` Extract finance portfolio feature
- `ef54779` Extract finance editor feature
- `4357445` Extract settings feature modules
- `8568258` Extract transaction review guide feature
- `1e180a6` Extract transaction editor view
- `489dca3` Extract newsfeed feature modules
- `bb897f3` Extract wine cellar view feature
- `36dc584` Version feature module release
- `e90b87d`, `ed5b1b2`, `f9b39c8`, `b32e98e`: production review fixes와 cache/contract 보강.

## 다음 슬라이스 진입 조건

- 충족. 슬라이스 5에서 inline handler와 `window.*` 결합을 단계적으로 줄이고 feature CSS 소유권을 정리한다.
