---
name: mes-ui-consistency
description: "동산기획 ERP+MES UI 일관성 가이드. 프론트엔드 작업 시 참조. TRIGGERS: UI 수정, 페이지 생성, 스타일 변경, CSS, Tailwind, 버튼, 테이블, 카드, 뱃지."
---

# UI/UX 일관성 가이드 (핵심)

> 상세 HTML 예제·스켈레톤·트랜지션 → `references/ui-detail.md`
> 금액 포맷 규칙 → `.claude/references/decisions-money.md`
> **디자인 체계 정본 = `src/layout/shared-styles.ts` + 메모리 `design-ui-system-navy-linear`.**
> ⚠️ **2026-09 리디자인(감청·Linear형) 반영본.** 옛 파랑(#3b82f6)·Inter·알약 뱃지·상시 그림자는 폐기값 — 되돌리지 말 것. 아래 hex는 참고이며 값 정본은 shared-styles.ts.

## 1. 색상 시스템 — **토큰(`--c-*`) 우선, hex 하드코딩 최소화**

### 배경 & 텍스트 (웜뉴트럴)
| 역할 | 토큰 | 값(참고) |
|------|------|-----|
| 페이지 배경 | `--c-bg` | `#F3F3F2` (맑은 뉴트럴) |
| 카드/패널 | `--c-surface` | `#FFFFFF` |
| 본문 텍스트 | `--c-text` | `#16140F` |
| 보조 텍스트 | `--c-text-secondary` | `#46423A` |
| 비활성 | `--c-text-muted` | `#6E6960` |

- ⛔ 슬레이트(`#1e293b`·`#64748b`) 하드코딩 금지 — 웜뉴트럴 토큰 사용.

### 시맨틱 색
| 역할 | 토큰 | 값(참고) | 사용처 |
|------|------|---------|--------|
| Primary | `--c-primary` | 감청 `#23528C` | CTA 버튼, 활성 탭, 링크 |
| Success | `--c-success` | `green-600` | 완료, 정상, 가동 |
| Warning | `--c-warning` | `amber-600` | 주의, 대기, 보류 |
| Danger | `--c-danger` | `red-600` | 에러, 삭제, 지연 |
| Neutral | `--c-text-muted` | gray | 비활성, 미접수 |

- **Primary = 감청(navy)**. ⛔ 옛 파랑 `blue-600`/`#3b82f6` 되돌리기 금지.
- 보라/핑크/틸은 **차트 전용**. 같은 데이터는 어디서든 같은 색.
- **강조는 아껴서 한 곳**(Linear형) — 화면당 감청 강조는 주요 동작 하나. 숫자는 기본 먹색, 색은 위험(미수금·지연)에만. 무지개 KPI 금지.

## 2. 버튼 — `ds-btn` 클래스 우선 (수제 hex 금지)

| 종류 | 클래스 | 용도 |
|------|--------|------|
| Primary | `ds-btn ds-btn-primary` | 주요 동작(저장·검색). 감청 solid |
| Danger | `ds-btn ds-btn-danger` | 파괴적(삭제). 빨강 solid |
| Secondary | `ds-btn ds-btn-secondary` | 보조(취소). 테두리 |
| Outline | `ds-btn ds-btn-outline` | 강조-보조(승인 등). 감청 외곽선 |
| Danger-outline | `ds-btn ds-btn-danger-outline` | 조용한 파괴적. 빨강 외곽선 |
| Ghost | `ds-btn ds-btn-ghost` | 배경 없음 |

- 색은 **클래스가 토큰(`--c-primary` 등)에서 가져온다** — `bg-blue-600` 같은 수제 hex 금지.
- radius 표준=`--radius-md` 8px. 검색 버튼 텍스트: 항상 **"검색"**. 새 변형 금지.

## 3. 아이콘
- **Font Awesome `fas`/`far`만**. 이모지 UI 금지. 버튼 내 `mr-1` 간격.

## 4. 요약 카드 — **평탄화(Linear형)**
- `.ds-card` = 배경 `--c-surface`, 테두리 `--c-border`(**hairline**), **그림자 없음**(hover 시 약한 `shadow-sm`만). radius 8px, 패딩 16px.
- ⛔ `shadow-sm hover:shadow-md` 상시 그림자 금지 — 그림자는 모달·드롭다운 등 진짜 떠야 할 것만.
- 숫자: 기본 `--c-text`(먹색), 위험만 `--c-danger`. `tabular-nums` 필수. 노랑/보라/분홍 배경·무지개 KPI 금지.
- **대시보드 = C안 하이브리드**: 매출 hero(`ds-hero-metric`) + 주의 요약(`ds-attn`) + 미니 KPI 행(`ds-minikpi`).

## 5. 상태 표시 — **목록은 점, 상세는 뱃지** (Linear형)

### 목록/테이블 행 = 상태 점(dot+글자) — 색배경 알약 금지
- `window.dsStatusDot(kind, status)` — kind=`'order'|'card'|'equip'`. 라벨·tone 자동.
- `window.dsDot(tone, label)` — 자체 상태축(발주·견적·입고 등 MES_STATUS 밖). tone=`blue|green|amber|red|gray`.
- 한 화면에 상태가 많아도 조용하다. ⛔ 목록에 `rounded-full`+`bg-*-50` 색배경 뱃지 재현 금지.

### 상세 화면·카드보드·모달 = 뱃지(`ds-badge`, **각진 태그** radius-sm)
- `dsStatusBadge(kind, status)` = 아이콘+텍스트+색상 3요소(WCAG 1.4.1), 배경 `bg-*-50`·텍스트 `*-700`.
- ⛔ 알약(`rounded-full`) 아님 — 각진(`--radius-sm`). 상태색은 유지.

| 상태 | 아이콘 | tone |
|------|--------|------|
| 완료/정상 | `fa-check-circle` | green |
| 진행중/확정 | `fa-check`/`fa-spinner` | blue(감청) |
| 대기/보류 | `fa-pause`/`far fa-clock` | amber |
| 에러/지연 | `fa-exclamation-triangle` | red |
| 미접수 | `far fa-clock` | gray |

## 6. 테이블 — **Linear형 (소라벨 헤더·hairline·호버 액션)**
- 헤더: 작은 회색 라벨(`.ds-table thead th` = 10.5px, `--c-text-muted`, letter-spacing). ⛔ 옛 `text-xs font-semibold` 진한 헤더 아님.
- 구분선: **hairline**(`--c-border-light`) — 격자가 아니라 흐름으로 읽히게.
- 행 hover: `--c-primary-light`(감청 틴트). ⛔ `hover:bg-blue-50` 파랑 금지.
- **행 액션 호버화**: `<tr>`에 `ds-row`, 액션 `<td>`에 `ds-row-action`(평소 opacity:0, hover 시 노출). 시야를 비운다.
- 숫자 셀: `tabular-nums text-right`
- **헤더 정렬**: 숫자/상태 헤더는 `<th class="text-right">`/`text-center` 그대로 사용. `.ds-table(-striped) thead th`가 `text-align:left`를 강제하지만 **layout.ts 전역 규칙**(`.ds-table thead th.text-right/.text-center/.text-left`, 특정성 0,2,2)이 유틸을 복원 → **페이지별 `thead th{text-align}` 패치 금지**(단일 소스)
- 액션 버튼: 호버 시에만 노출
- 줄무늬: `ds-table-striped` (짝수행 `#f8fafc`)
- 밀도 토글: `ds-table-compact`
- **고정형(table-layout: fixed) 원칙 (필수)**: 컬럼이 많거나 금액(가변 자릿수) 위주인 표는 반드시 `table-layout: fixed` + 명시적 컬럼 너비(`<colgroup><col style="width:..">` 또는 `th` width)로 만든다. 기본 auto-layout(=내용에 따라 너비가 변하는 "움직이는 형식")은 **금지** — 셀 값이 `0`↔큰 숫자로 바뀔 때 컬럼 폭이 출렁여 정렬/헤더가 어긋난다. 넘치는 셀은 `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`로 클립하고, 전체 폭은 가로 스크롤(`overflow-x-auto`)로 처리. 컬럼이 너무 많으면 **탭/섹션으로 분리**(예: 급여대장=지급·공제 / 회사부담금=별도 탭).

## 6.5 XSS / 이스케이프 (필수)
- 사용자 입력 필드(`*name`, `*_name`, `notes`, `description`, `memo`, `message`, `*_message`, `content`)를 innerHTML / 템플릿 리터럴 / `+=` HTML에 삽입할 땐 **전역 `window.escapeHtml(...)`로 반드시 감쌀 것**.
- URL/속성(href, src, query) 컨텍스트는 `encodeURIComponent` 사용.
- **로컬 `esc` 복사본 만들지 말 것** — 전역 `window.escapeHtml`로 단일화.
- `escapeHtml`은 `& < > " '`를 이스케이프하므로 속성값(`data-*`, `title`)에도 그대로 사용 가능. 별도 `.replace(/"/g,...)` 불필요.

## 7. 필터/폼
- 필터: `.ds-filter-bar`(hairline, 그림자 없음), 검색은 `flex-1`, 액션 `ml-auto`. 활성 조회조건은 **삭제 칩**(`.ds-conds`/`ds-cond`)으로 항상 노출.
- 폼 라벨: `text-sm font-medium`, 입력: `.ds-input`, 포커스 링: 은은한 그레이 쉐도우(토큰)
- 금액 입력: `type="text" inputmode="numeric" data-money` (상세 → decisions-money.md)
- 날짜 입력: `type="text" class="js-fp" maxlength="10" inputmode="numeric" placeholder="예: 2020-01-15"` + 폼 로드/모달 시 `window.hrInitDatePickers(rootSel)` 호출(flatpickr 달력 — 헤더 년도 빠른 선택 + 텍스트 자동하이픈 병행). **native `type="date"` 지양**(년도 점프 불편).

## 9. 공용 헬퍼 카탈로그 — 재구현 금지 (공유 우선 원칙)

같은 UI/로직은 반드시 전역 헬퍼·ds-* 컴포넌트를 쓴다. **페이지별 재구현 = 리뷰 반려**(review-checklist §14). ?raw 단일 전역 스코프에서 공유 경로는 ①`window.*` 헬퍼(shell.js) ②전역 CSS 클래스(shared-styles.ts ds-*) ③주입 상수(STATUS_LABELS_JS 등) 3가지 — 이 경로로 못 만드는 위젯은 없다(품목검색 모달 실증).

| 용도 | 전역 헬퍼 (window.*) | 금지 패턴 |
|------|---------------------|----------|
| HTML 이스케이프 | `escapeHtml` | 로컬 esc 재구현 (가드형 `window.escapeHtml \|\| fallback`만 허용) |
| 금액 표시 | `fmtMoney`(null→'-') / 숫자 콤마 `fmtNum`(null→'0') | 로컬 `fmt()`/`accWon`류 재정의 |
| 금액 입력 | `data-money` + `bindMoneyInputs`/`readMoney`/`fmtMoneyInput` | `type="number"` 금액 입력 |
| 날짜 표시 | `fmtDateOnly`(YYYY-MM-DD 절단) / `formatKST`(시각) | 로컬 formatDate/fmtDate slice 재작성 |
| CSV | `dsCsvCell`(셀) · `dsBuildCsv`(조립) · `dsDownloadCsv`(BOM+Blob+click+revoke) | Blob+a.click 복붙 |
| 페이지네이션 | `dsPaginate(el, pag, 'gotoFn')` | top-level `renderPagination` 동명 전역 (덮어쓰기 사고 전례) |
| 모달 | `dsOpenModal`/`dsCloseModal`(hidden 클래스 SSOT) + 부수효과 모달 `data-esc-close` | 인라인 `style.display` 토글 (ESC closer 충돌) |
| 거래처 검색 | `openClientSearchModal({onSelect, search})` | 자체 드롭다운/모달 신작 |
| 품목 검색 | `openItemSearchModal({onSelect, type})` | 〃 |
| 상태(목록) = 점 | `dsStatusDot(kind, status)`(order/card/equip) · `dsDot(tone, label)`(자체 상태축) | 목록에 색배경 알약 뱃지 |
| 상태(상세) = 뱃지 | `dsStatusBadge(kind, status)` = `MES_STATUS.badge`(각진 ds-badge·아이콘+텍스트+색) | 상태→라벨/색/아이콘 리터럴 맵 재정의 |
| 상태 원자 | `MES_STATUS` label·tone·icon·badgeClass·textClass·chipClass·dotBgClass — 장비 IDLE=gray 확정 | 페이지별 색 맵 재정의 |
| 토스트/확인 | `showToast`·`showConfirm`·`showPrompt`·`showFieldError` | alert/confirm/prompt |
| 로딩/빈상태 | `dsSkeleton`·`ds-empty`·`emptyRow` | fa-spinner 단독·수제 빈상태 |
| 탭 | 페이지-prefix 함수(accSwitchTab식) | top-level `switchTab` 동명 전역 |

- 새 공통 위젯이 필요하면 **페이지에 만들지 말고 shell.js에 window 헬퍼로 추가** 후 사용 (openClientSearchModal 선례).

## 체크리스트

### 기본
- [ ] 배경·텍스트·색은 **토큰(`--c-*`)** 사용, hex 하드코딩 최소 (값 정본=shared-styles.ts)
- [ ] Primary = **감청**(`--c-primary`), ⛔ 옛 파랑 아님
- [ ] 카드 숫자 기본 먹색(`--c-text`), 위험만 `--c-danger`. 무지개 KPI 금지
- [ ] **목록 상태 = 점**(`dsStatusDot`/`dsDot`), 상세 = 각진 뱃지(`dsStatusBadge`)
- [ ] 테이블 액션 **호버 시에만**(`ds-row`/`ds-row-action`), `tabular-nums`
- [ ] 와이드/금액 테이블은 `table-layout: fixed` + 고정 컬럼 너비, 넘치면 탭 분리
- [ ] 검색 버튼 "검색", 이모지 미사용

### 비주얼+UX
- [ ] 카드 **평탄화**(hairline·그림자 없음), 인터랙티브 요소 트랜지션
- [ ] 상단바 글래스톱 `backdrop-filter: blur`, **Pretendard** 폰트
- [ ] 테이블 헤더 = **작은 회색 소라벨**·hairline 구분선
- [ ] API 대기 시 스켈레톤, 빈 상태(아이콘+메시지+CTA)
- [ ] 다크모드 = 중립 차콜(갈색 아님), 감청 강조
