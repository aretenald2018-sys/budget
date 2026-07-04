# 앱 화면 디자인 시스템

> **핵심 원칙:** 라이트 모드 베이스 위에 다크 그라디언트 히어로 카드 한 장이 강렬하게 떠있는 구조.  
> 히어로 카드의 보라·네이비 그라디언트 DNA를 나머지 라이트 UI 곳곳에 액센트로 얇게 흘려서 한 세계관으로 묶는다.
>
> **적응형/반응형 원칙:** 390px 모바일 폭을 기준으로 설계하되, 340px 이하의 좁은 화면과 460px 이상 기기 프레임 화면에서 패딩·간격·최소폭을 조정한다. 글자 크기는 `vw`로 연속 스케일하지 않고, 배포판 기준의 컴팩트 타입 크기를 기본값으로 둔 뒤 필요한 breakpoint에서만 1~2px 낮춘다.

---

## 1. 색상 토큰

### 1-1. 라이트 모드 베이스

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#f5f6fa` | 페이지 배경 |
| `--surface` | `#ffffff` | 카드, 입력란 |
| `--surface2` | `#f2f4f8` | progress track 배경, 보조 영역 |
| `--border` | `#e4e8f0` | 카드 테두리, 구분선 |
| `--text` | `#191f28` | 본문 · 제목 |
| `--text-2` | `#4e5968` | 서브 레이블, 숫자 분모 |
| `--text-3` | `#8b95a1` | 힌트, 메타 정보, 비활성 |

### 1-2. 히어로 카드 전용 (다크)

히어로 카드 내부에서만 쓰이는 값이다. **절대 일반 카드에 사용하지 않는다.**

```css
background: linear-gradient(135deg, #1a2244 0%, #2a2f5a 55%, #3a2d6e 100%);
```

| 역할 | 값 |
|---|---|
| 탭 바 배경 | `rgba(255,255,255,.10)` |
| 활성 탭 | `#ffffff` (텍스트: `#1a2244`) |
| 레이블 | `rgba(255,255,255,.70)` |
| 메타(기간) | `rgba(255,255,255,.50)` |
| 금액 | `#ffffff` |
| progress track | `rgba(255,255,255,.12)` |
| progress fill | `linear-gradient(90deg, #7a8cff, #b388ff)` |
| 하단 텍스트 | `rgba(255,255,255,.55)` |
| 우상단 글로우 | `radial-gradient(circle, rgba(179,136,255,.4), transparent 65%)` |
| 박스 섀도 | `0 16px 40px rgba(58,45,110,.35), 0 4px 12px rgba(26,34,68,.2)` |

### 1-3. 액센트 — 히어로 DNA를 라이트 UI에 흘리는 방법

히어로의 보라·블루를 일반 UI에 직접 쓰지 않는다.  
**연하게 희석한 버전**으로만 사용해 배경과 충돌하지 않게 한다.

| 토큰 | 값 | 사용처 |
|---|---|---|
| `--accent` | `#6366f1` | cycle pill 텍스트, pact % 뱃지 텍스트, cycle dot |
| `--accent-tint` | `rgba(99,102,241,.08)` | cycle pill 배경 |
| `--accent-tint2` | `rgba(99,102,241,.14)` | pact % 뱃지 배경 |
| `--grad-bar` | `linear-gradient(90deg, #7a8cff, #b388ff)` | **모든 progress bar fill** (히어로 bar와 동일 값 — 연결고리) |
| `--grad-warn` | `linear-gradient(90deg, #f59e0b, #fb923c)` | 관리 카테고리 횟수·금액 초과 경고 |
| `--grad-ok` | `linear-gradient(90deg, #10b981, #34d399)` | 소비 적음·정상 상태 |

> `--grad-bar` 를 모든 화면의 progress bar에 통일하는 것이 핵심.  
> 히어로 카드 안의 bar와 외부 라이트 카드의 bar가 같은 그라디언트를 쓰면서 시각적으로 같은 앱처럼 보인다.

---

## 2. 타이포그래피

기존 `style.css` 타입 스케일(`.t1`~`.t7`)을 그대로 사용하되, 홈 화면에서의 역할 매핑은 아래와 같다.

| 역할 | 클래스/값 | 속성 |
|---|---|---|
| 앱바 타이틀 ("홈") | `.t4` | 20px / 700 / -0.02em |
| 섹션 제목 | 17px / 700 / -0.02em | — |
| 카드 주요 항목명 | 15px / 600 | — |
| 카드 서브 레이블 | 13px / 500 | `color: var(--text-2)` |
| 메타·힌트 | 12px / 400~500 | `color: var(--text-3)` |
| 뱃지·퍼센트 | 11px / 700 | — |
| **히어로 금액** | **30px / 800 / -0.02em** | `color: #fff`; 340px 이하에서는 28px |
| 히어로 금액 단위 | 15px / 600 | `rgba(255,255,255,.72)` |
| 히어로 탭 | 11px / 800 | 배포판 기준 컴팩트 토글 |
| 히어로 레이블 | 12px / 700 | `color: rgba(255,255,255,.70)` |
| 히어로 메타 | 11.5px / 500 | `color: rgba(255,255,255,.50)` |

**숫자는 항상 `font-variant-numeric: tabular-nums`.**  
분모(예: `/ 400,000원`)는 `color: var(--text-3)`, `font-weight: 400`으로 흐리게 처리한다.

---

## 3. 간격 · 반경

| 용도 | 값 |
|---|---|
| 카드 테두리 반경 | `16px` |
| 카드 내부 소형 요소 반경 | `10px` |
| pill/뱃지 반경 | `999px` |
| 아이콘 박스 반경 | `14px` |
| 페이지 좌우 패딩 | `18px` |
| 섹션 간격 | `26px` |
| 카드 내부 패딩 | `16px 18px` |
| 좁은 화면 카드 내부 패딩 | `14px 16px` (`max-width: 340px`) |

### 3-1. 적응형/반응형 규칙

- 기본 캔버스는 모바일 컴포넌트 폭을 유지한다. 앱 컨테이너는 `width: 100%`, `max-width: 430px`로 가운데 고정한다.
- 웹/태블릿에서 브라우저 폭을 넓혀도 홈 카드와 히어로 카드 자체는 늘어나지 않는다. 좌우 여백만 커지고, 앱바·하단 탭도 같은 고정 폭을 따른다.
- 홈 본문은 1열을 유지한다. 결심/관리/변동비/고정비 섹션을 웹 폭 때문에 2열로 찢지 않는다.
- 반응형은 “넓은 화면 확장”이 아니라 “좁은 화면 안전 보정”이다. 340px 이하에서만 좌우 패딩, 히어로 탭, 금액 크기, 카드 내부 패딩을 한 단계 낮춘다.
- 340px 이하에서는 좌우 패딩을 16px로 줄이고, 히어로 탭 패딩·금액 크기·카드 내부 패딩을 한 단계 낮춘다.
- 텍스트 크기는 `vw`, `clamp()` 기반 연속 스케일을 쓰지 않는다. 화면별 breakpoint로만 조정해 숫자 폭과 레이아웃 흔들림을 줄인다.
- 버튼·탭·progress bar는 고정 높이와 최소 폭을 갖되, 긴 한국어 텍스트는 `min-width: 0`, `text-overflow: ellipsis`로 잘리게 한다.

---

## 4. 그림자

라이트 모드는 그림자로 깊이를 만든다.

| 용도 | 값 |
|---|---|
| 아이콘 버튼, 작은 칩 | `0 1px 3px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)` |
| 일반 카드 | `0 2px 8px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.04)` |
| **히어로 카드** | `0 16px 40px rgba(58,45,110,.35), 0 4px 12px rgba(26,34,68,.2)` |

히어로 카드의 섀도는 의도적으로 보라·네이비 컬러 섀도를 쓴다 — 라이트 배경 위에서 카드가 둥실 뜨는 느낌을 준다.

---

## 5. 컴포넌트

### 5-1. 앱바

```
배경: var(--bg) — 스크롤해도 고정, 별도 blur 없음
구성: [앱 타이틀] [격주 pill]      [검색 버튼] [설정 버튼]
```

- **격주 pill:** `var(--accent-tint)` 배경, `var(--accent)` 텍스트, 좌측에 6px accent dot
- **아이콘 버튼:** 36×36 원형, `var(--surface)` 배경, `var(--border)` 테두리, `var(--sh-sm)` 섀도

---

### 5-2. Cycle Stepper (기간 이동 행)

```
배경: var(--surface)
테두리: 1px var(--border)
반경: 10px
패딩: 11px 14px
```

- 중앙: 6px accent dot + "9일째 · 남은 6일" (`font-weight: 500`, text-2)
- 화살표 버튼: 26×26 원형, `var(--border)` 테두리

---

### 5-3. 히어로 카드 ★

라이트 화면에서 유일하게 다크인 요소. 이 카드를 건드릴 때는 반드시 원본 스크린샷을 참조한다.

```
background: linear-gradient(135deg, #1a2244 0%, #2a2f5a 55%, #3a2d6e 100%)
border-radius: 16px
padding: 14px 18px 18px    ← 원본 스크린샷 기준, 세로가 너무 뚱뚱하지 않게 유지
box-shadow: 0 16px 40px rgba(58,45,110,.35), 0 4px 12px rgba(26,34,68,.2)
margin-bottom: 26px
```

**내부 구성 (위→아래):**
1. 탭 toggle pill (`이번 2주` / `이번 달`)
2. 레이블 ("이번 격주 지출") + 기간 메타 ("4/27 – 5/10 · 9일째")
3. 금액 — 30px / 800 / tabular-nums (340px 이하 28px)
4. progress track (높이 5px, border-radius 5px)
5. footer row ("750,000원 기준" / "33% 사용")

**탭 toggle:**
```
wrap background: rgba(255,255,255,.10)
wrap border-radius: 999px
wrap padding: 3px
활성 탭: background #fff, color #1a2244, shadow 0 2px 6px rgba(0,0,0,.18)
비활성 탭: color rgba(255,255,255,.65)
탭 크기: min-height 28px
탭 패딩: 0 12px
탭 폰트: 11px / 800
```

**Progress bar:**
```
track background: rgba(255,255,255,.12)
fill: linear-gradient(90deg, #7a8cff, #b388ff)
fill box-shadow: 0 0 10px rgba(179,136,255,.6)
height: 5px
```

---

### 5-4. 섹션 헤더

```
display: flex; justify-content: space-between; align-items: baseline
padding: 0 2px
margin-bottom: 10px
```

- 제목: 17px / 700 / letter-spacing -0.02em / `var(--text)`
- 액션 링크: 13px / 500 / `var(--text-3)` + chevron SVG

---

### 5-5. 결심(Pact) 카드

히어로 다음으로 가장 강조되는 카드. 좌측 보라 라인으로 히어로 톤을 이어받는다.

```
배경: var(--surface)
테두리: 1px var(--border)
반경: 16px
패딩: 16px 18px
구성: [아이콘 박스] [본문] [chevron]
```

**좌측 accent 라인 (::before):**
```css
position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
background: linear-gradient(180deg, #7a8cff 0%, #b388ff 100%);
```
→ 히어로 progress bar와 동일한 그라디언트. 이게 연결고리.

**아이콘 박스:**
```
크기: 46×46px, border-radius: 14px
background: linear-gradient(135deg, #6366f1, #a855f7)
box-shadow: 0 6px 16px rgba(99,102,241,.28)
```

**퍼센트 뱃지:**
```
background: var(--accent-tint2)
color: var(--accent)
font-size: 11px / 700
padding: 2px 7px; border-radius: 6px
```

**Progress bar:** 높이 3px, `var(--grad-bar)` fill

---

### 5-6. 관리 카테고리(Watch) 카드

```
배경: var(--surface)
테두리: 1px var(--border)
반경: 16px
패딩: 16px 18px 18px
```

**상단 행:** 아이콘(30×30, border-radius 9px, 경고 색 tint) + 카테고리명 + 금액 칩

**트랙 (횟수 / 금액 각각 분리):**
```
트랙 헤더: label (text-3) + 값 (text-2 / 600 / tabular-nums)
bar height: 5px
bar fill: var(--grad-bar) — 히어로 카드 게이지와 동일한 보라·블루 그라디언트
```

횟수·금액을 한 줄에 텍스트로 섞지 않고 **두 개의 분리된 progress track**으로 표현한다.

---

### 5-7. 변동비(Variable Cost) 카드

여러 카드로 나뉘지 않고 **하나의 카드** 안에서 부모·자식 위계를 표현한다.
홈에서는 히어로 카드 토글과 같은 기준을 따른다. 토글이 `이번 2주`이면 섹션 제목은 `이번 2주 변동비`, 데이터도 격주 기준이다. 토글이 `이번 달`이면 섹션 제목과 데이터가 월 기준으로 바뀐다.

```
배경: var(--surface)
테두리: 1px var(--border)
반경: 16px
그룹 구분: border-top: 1px var(--border)
```

**부모 행:**
```
padding: 15px 18px 10px
name: 15px / 600 / var(--text)
num: 13px / 600 / var(--text-2) + tabular-nums
분모: font-weight 400 / var(--text-3)
```

**자식 행 (들여쓰기):**
```
padding-left: 10px; border-left: 2px solid var(--border)  ← 위계 표현
name: 13px / 500 / var(--text-2)
num: 12px / 600 / var(--text) + tabular-nums
progress bar 오른쪽에 퍼센트 숫자 (11px / 600 / text-3)
홈 화면의 소카테고리 행은 우측 상단 금액을 생략하고, progress bar 아래 우측에 `사용액 / 한도`를 원화 숫자 표기(`170,000 / 400,000`)로 보여준다.
```

**Progress bar fill:**
- 일반: `var(--grad-bar)` (히어로와 동일 보라·블루)
- 긍정/적음: `var(--grad-ok)` (그린)
- 0%: fill 없음, 퍼센트 텍스트는 더 연한 `#c8cdd4`

---

### 5-8. 목표 탭(Finance / Goal) 카드와 그래프

`mockups/mockup-o-goal-segments.html`의 구성 순서를 따른다. 색은 다크 mockup을 가져오지 않고, 이 문서의 라이트 토큰과 보라·블루 accent만 사용한다.

**상단 구성:**
1. 목표 요약 히어로
2. 세그먼트 컨트롤 (`시나리오` / `자산`)
3. 단일 finance 카드

**시나리오 카드 내부 구성 (위→아래):**
1. 카드 헤더: 제목/설명 + 작은 pill 액션
2. 차트 바디: legend → 목표 경로 메타 → SVG chart → 축 힌트
3. 인사이트/축적표 영역
4. 시뮬레이션 관리 toggle + 요약/편집 영역

**라이트 그래프 규칙:**
```
chart background: var(--surface)
grid stroke: var(--border), opacity 1, dashed
axis/label: var(--text-3)
tooltip: var(--surface), border 1px var(--border), text var(--text)
목표선: #6366f1 또는 var(--accent)
비교선: #b388ff 계열 dashed
실제선: var(--text-3) dashed
```

- 그래프 내부에 `#0a0a0a`, `#111`, `rgba(0,0,0,...)` 기반 다크 박스나 다크 tooltip을 쓰지 않는다.
- 차트는 별도 둥근 보조 카드처럼 보이지 않게 finance 카드 안의 한 섹션으로 붙인다.
- 차트 wrapper는 `overflow: hidden`과 `contain: paint`로 카드 경계 밖에 선·점·tooltip이 삐져나가지 않게 한다.
- 시나리오 카드 안에는 별도 `최근 실적 기준 저축 가능액` strip을 두지 않는다. 해당 기능은 `실적 업데이트` chip/sheet로 진입한다.
- 시뮬레이션 추가/수정 폼은 카드 내부 아코디언으로 붙이지 않는다. `시뮬레이션 관리` 안에는 compact list와 추가 버튼만 두고, 폼은 하단 modal sheet로 띄운다.
- 실제 실적이 하나라도 있으면 히어로 금액에 `실적 입력`을 표시하지 않는다. 목표 연도와 실적 연도 차이 때문에 gap 계산이 비어도 최신 실적 값을 표시한다.
- 목표 탭도 웹 폭을 따라 늘어나지 않는다. 앱 컨테이너의 430px 모바일 프레임 안에서만 반응하고, 340px 이하에서만 간격을 줄인다.

**자산 세그먼트 구성:**
1. 3칸 요약 (`실제 총자산` / `운용자산` / `수익률`)
2. 시세 메타 strip
3. `70/10/15/5 포트폴리오 점검`
4. 추천 이동 영역
5. 시세 갱신 / 사진으로 가져오기 / 트랙 추가 액션 rail
6. 자산 트랙 목록

자산 세그먼트에서는 상태색을 당분간 전부 primary 보라로 통일한다. 수익률, 조정 필요 chip, 초과/부족 텍스트, 추천 이동 목적지, track action, gauge fill에 주황/초록/빨강을 쓰지 않는다.

포트폴리오 gauge는 실제 비중만 굵은 `var(--grad-bar)` fill로 그린다. 목표 비중은 세로 marker로 표시하고, 미달 구간은 얇은 점선 guide로만 표시한다. 부족분까지 같은 굵기의 보라 fill로 이어 붙이지 않는다.

자산 트랙별 `트랙 수정` / `종목 추가` / `삭제` 액션은 트랙명 아래에 항상 노출하지 않는다. 각 트랙 우측에 28px 원형 설정 버튼만 두고, 누르면 하단 modal sheet에서 세 액션과 필요한 편집 폼을 보여준다. 트랙 목록 안에는 종목 리스트와 핵심 금액만 남겨 피로도를 낮춘다.

목표 탭은 정보 밀도가 높으므로 보라색을 “강한 CTA”가 아니라 “얇은 위치 표시”로 쓴다. 큰 면적의 보라 배경, 진한 gradient, 800 이상 굵기의 반복 텍스트를 피하고, 보조 수치/추천 이동/상태 chip은 `rgba(99,102,241,.055)` 수준의 연한 tint와 560~720 weight를 기본으로 둔다. Gauge fill은 실제 값만 4px 높이의 연한 보라 gradient로 표시한다.

자산 세그먼트에서 피로도가 올라가면 보조 정보부터 접는다. 시세 출처 메타, 긴 기준 설명, 버킷별 `현재/목표` 반복 문구는 기본 화면에서 숨긴다. 추천 이동은 3개 정도만 보여주되, 목적지(`→ 나스닥100 ETF`)는 조용한 보라 텍스트로 남긴다.

벤치마크와 약속은 목표 탭의 상단 세그먼트에서 제외한다. 벤치마크 데이터는 `시나리오 관리`와 그래프 비교 안에서만 다룬다.

### 5-9. 거래 탭 밀도 규칙

거래 탭은 리스트 자체가 정보이므로 상단 필터 chip을 기본 화면에서 제거한다. 거래 추가는 FAB 하나로 충분하다. 지출 금액은 반복될 때 빨강을 쓰지 않고 `var(--text-2)` 계열 중립색으로 표시한다. 날짜별 합계도 경고색이 아니라 `var(--text-3)`로 낮춘다. 빨강은 실패/삭제/실제 오류처럼 사용자가 즉시 주의해야 하는 상태에만 남긴다.

캘린더 날짜 셀의 환급 표기는 긴 `환급 21,500` 대신 `(+21,500)` 한 줄로 표시한다. 날짜 셀 안의 금액 텍스트는 `white-space: nowrap`, `text-overflow: ellipsis`로 줄바꿈을 막는다.

### 5-10. 목록형 위젯 그래프

Android 위젯 선택 화면의 `배터리 상태(목록형)` preview처럼, 홈의 그래프성 UI는 카드 안에 작은 rounded row들이 쌓이는 구조를 쓴다. 색은 reference의 초록/회색을 가져오지 않고, 이 문서의 라이트 토큰과 `var(--grad-bar)`를 그대로 쓴다.

**적용 범위:**
- 홈 `오늘의 적립` 포인트 3개 row.
- 홈 `이번 2주/이번 달 변동비` 카테고리 row.
- Android 홈 화면 위젯은 별도 native slice에서 같은 row anatomy를 따른다.

**Row anatomy:**
```text
[mark] [label 또는 카테고리명        ] [92%]
└ 전체 row 자체가 pill track이며, fill은 row 뒤쪽에서 scaleX로 채운다.
```

- row shell: `min-height: 34px`, `border-radius: 999px`, `background: var(--surface2)`, `overflow: hidden`, `contain: paint`.
- fill: `position: absolute`, `inset: 0`, `width: 100%`, `transform-origin: left center`, `background: var(--grad-bar)`.
- mark: 22px 원형 또는 pill, `var(--surface)` 배경, `var(--accent)` 텍스트, 11px/850.
- label: 12.5-13px, 760-850 weight, `min-width: 0`, `text-overflow: ellipsis`.
- value: 우측 정렬, 13-14px/900, `font-variant-numeric: tabular-nums`.
- meta: row 아래 1줄만 허용한다. `사용액 / 기준액`, `오늘 +P`, `월 예상` 같은 보조값은 `var(--text-3)` 10.5-11px로 낮춘다.

**반응형 규칙:**
- 340px 이하에서는 mark를 20px, row horizontal padding을 6px로 줄인다.
- label과 value가 겹치면 label이 먼저 ellipsis 된다. value는 줄바꿈하지 않는다.
- `2x2`, `4x2` 같은 preview 크기 텍스트를 실제 UI에 노출하지 않는다.
- 홈 리포트/월간 리포트 공용 함수가 이 primitive를 쓰더라도 적용 class는 홈 전용으로 제한한다.

---

## 6. Progress Bar 규칙

앱 전체에서 progress bar는 다음 규칙을 따른다.

| 상태 | fill 그라디언트 | 비고 |
|---|---|---|
| 일반 (소비 진행) | `linear-gradient(90deg, #7a8cff, #b388ff)` | 히어로 bar와 동일 |
| 관리 카테고리 | `linear-gradient(90deg, #7a8cff, #b388ff)` | 홈에서는 히어로 bar와 동일 |
| 경고 | `linear-gradient(90deg, #f59e0b, #fb923c)` | 홈 외부의 명시적 경고 상태에서만 사용 |
| 긍정 (적게 씀) | `linear-gradient(90deg, #10b981, #34d399)` | 그린 |
| 미사용 (0%) | fill 없음 | 퍼센트 텍스트 `#c8cdd4` |

track 공통: `background: var(--surface2)`, `border-radius: 5px`  
fill 공통: `border-radius: 5px`  
높이: 히어로 5px / 일반 카드 5px / 결심 카드 3px

---

## 7. 디자인 원칙 요약

1. **히어로만 다크, 나머지는 라이트.** 다크 요소를 다른 카드에 섞지 않는다.
2. **그라디언트 bar로 연결.** 히어로 progress bar의 `#7a8cff → #b388ff` 값을 일반 카드 bar에도 그대로 쓴다. 사용자 눈에 "같은 앱"으로 보이게 만드는 가장 조용한 연결고리.
3. **숫자는 tabular-nums.** 금액이 바뀌어도 레이아웃이 흔들리지 않는다.
4. **분모는 흐리게.** `/ 400,000원` 형태의 분모는 항상 `var(--text-3)` + `font-weight: 400`.
5. **카드는 하나로 묶는다.** 관련 항목을 개별 카드로 나누지 않고 한 카드 안 hairline 구분선으로 처리한다.
6. **세로 패딩은 아껴라.** 히어로 카드는 세로로 뚱뚱해지지 않게 `padding: 14px 18px 18px`. 정보가 많아 보여도 실제 높이는 컴팩트하게.
7. **히어로 타입은 배포판처럼 작게.** 히어로 금액은 30px, 토글은 11px을 기본으로 하고 좁은 화면에서만 더 줄인다.
8. **적응형은 breakpoint로.** `vw` 폰트 스케일 대신 340px 이하, 460px 이상 같은 명확한 breakpoint에서 간격과 크기를 조정한다.

---

## 8. 적용 체크리스트

코덱스나 다른 도구가 이 디자인을 수정할 때 확인할 것들:

- [ ] 히어로 카드 배경이 `#f5f6fa` (라이트)로 바뀌지 않았는가
- [ ] 나머지 카드 배경이 `#1a2244` (다크)로 바뀌지 않았는가
- [ ] 모든 progress bar fill이 `var(--grad-bar)` (보라·블루 계열) 또는 위 규칙을 따르는가
- [ ] 히어로 카드 세로 패딩이 `14px 18px 18px` 수준으로 컴팩트한가
- [ ] 히어로 금액이 기본 `30px`, 340px 이하 `28px`로 배포판처럼 조밀한가
- [ ] 히어로 토글이 `11px / 800`, `min-height: 28px`, `padding: 0 12px`인가
- [ ] 숫자에 `font-variant-numeric: tabular-nums`가 있는가
- [ ] 반응형은 `vw` 폰트가 아니라 breakpoint 기반으로 처리했는가
- [ ] 결심 카드 좌측 3px 라인이 `#7a8cff → #b388ff` 그라디언트인가
- [ ] 섀도가 라이트 모드 값(`rgba(15,23,42,...)`)으로 되어 있는가 (다크 모드 `rgba(0,0,0,...)` 아님)
