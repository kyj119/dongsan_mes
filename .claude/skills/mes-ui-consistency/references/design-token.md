# Design Tokens — 동산기획 ERP+MES

**단일 소스 = `src/layout/shared-styles.ts` `:root` 블록.** 이 문서는 참조용 스냅샷(2026-09-16 감청·Linear형 리디자인 반영).
⚠️ **값은 shared-styles.ts가 정본** — 여기 hex는 낡을 수 있으니 토큰명(`--c-*`)으로 참조하고 값은 코드에서 확인. 여기 없는 토큰명(`--text-*`, `--space-1..8`, `--shadow-card`)은 존재하지 않음.

---

## Color Tokens (`--c-*`) — 라이트

```css
:root {
  /* Primary — 감청(navy). 주요 액션·링크·활성. ⛔ 옛 파랑 #3b82f6 아님 */
  --c-primary: #23528C;
  --c-primary-hover: #1C4577;
  --c-primary-light: #E6EDF6;
  --c-primary-dark: #163A66;

  /* 시맨틱 */
  --c-success: #16a34a;  --c-success-light: #dcfce7;
  --c-warning: #d97706;  --c-warning-light: #fef3c7;
  --c-danger:  #dc2626;  --c-danger-light:  #fee2e2;
  --c-info:    #23528C;  --c-info-light:    #E6EDF6;   /* info=감청 통일 */

  /* 확장 (차트·KPI 전용 — 상태 UI 사용 금지) */
  --c-purple: #7c3aed; --c-purple-light: #f5f3ff;
  --c-orange: #ea580c; --c-orange-light: #fff7ed;
  --c-teal:   #0d9488; --c-teal-light:   #f0fdfa;

  /* Surface & Layout — 웜뉴트럴 */
  --c-bg: #F3F3F2;
  --c-surface: #ffffff;
  --c-surface-secondary: #F6F6F5;
  --c-surface-stripe: #F8F8F7;
  --c-border: #E5E4E0;
  --c-border-light: #EDECE8;

  /* Text — 웜뉴트럴 */
  --c-text: #16140F;
  --c-text-secondary: #46423A;
  --c-text-muted: #6E6960;

  /* Sidebar — 네이비-차콜 */
  --c-sidebar: #1B2A3D; --c-sidebar-hover: #26384E; --c-sidebar-border: #2C3E54;
  --c-sidebar-text: #9DA7B4; --c-sidebar-text-active: #ffffff;

  --font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Malgun Gothic', sans-serif;
}
```

## 다크 모드 (`html.dark`) — 중립 차콜 (⛔ 갈색 아님)
```css
--c-bg: #17181B;  --c-surface: #1F2025;  --c-border: #303139;
--c-text: #E8E9EC;  --c-text-secondary: #ABABB4;  --c-text-muted: #76767F;
--c-primary: #4C7DB8;  /* 흰 글씨 읽히는 중간 블루. 연한 하늘색이면 버튼 글씨 묻힘 */
--c-success: #52C081; --c-warning: #E5B84A; --c-danger: #EC8272;  /* 톤다운(형광 아님) */
```
> 눈부심 방지: 배경 ≠ 순흑(#0f172a), 텍스트 ≠ 순백(#e2e8f0). ⛔ 웜차콜(#161513, R>G>B)은 세피아/갈색으로 보여 폐기.
> **인라인 hex는 다크에서 안 바뀜** — 색은 반드시 토큰/Tailwind 유틸로. Tailwind blue 유틸은 전역에서 감청으로 리맵됨(shared-styles.ts).
> **강조색은 토큰 하나(`--c-primary`)** — 옛 "버튼=bg-blue-600, 링크=#3b82f6 분리"는 폐기, 전부 감청 토큰.

### 차트 팔레트 (시각화 전용, 이 순서로)
```
--c-primary → --c-success → --c-warning → --c-danger → --c-purple → --c-teal → --c-orange
```

---

## Typography Tokens (`--fs-*`)

```css
--font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Malgun Gothic', sans-serif;  /* ⛔ Inter 제거됨 */
--fs-xs: 11px;   /* 뱃지, 테이블 헤더, 캡션 */
--fs-sm: 13px;   /* 본문, 테이블 셀, 입력, 버튼 */
--fs-base: 14px; /* 기본 */
--fs-lg: 16px;   /* 섹션 제목 */
--fs-xl: 18px;   /* 페이지 내 대제목 */
--fs-2xl: 24px;  /* KPI 숫자(중) */
--fs-3xl: 30px;  /* 요약 카드 숫자 */
```

### 사용 매핑
| 요소 | 크기 | 굵기 | 색상 |
|------|------|------|------|
| 요약 카드 숫자 | `--fs-3xl` | bold | 기본 `--c-text`(먹색), 위험만 `--c-danger` |
| 섹션 제목 | `--fs-lg` | bold | `--c-text` |
| 테이블 헤더 | 10.5px | 500(소라벨) | `--c-text-muted` (Linear형) |
| 테이블 셀/본문/입력 | `--fs-sm` | normal | `--c-text` |
| 목록 상태 | `--fs-sm` | normal | 점(dot)+글자, 색은 tone dot |
| 뱃지(상세)/캡션 | `--fs-xs` | medium/600 | 시맨틱 *-700 |

---

## Spacing Tokens (`--space-*`)

```css
--space-xs: 4px;  --space-sm: 8px;  --space-md: 12px;
--space-lg: 16px; --space-xl: 24px; --space-2xl: 32px;
```

| 위치 | 값 |
|------|-----|
| 페이지 상단/섹션 간 | `--space-xl` 24px |
| 카드 그리드 간격 | `--space-lg` 16px (`gap-4`) |
| ds-card 내부 패딩 | `--space-lg` 16px (평탄화 후·compact=`--space-md` 12px) |
| 아이콘↔텍스트 | 8~12px |

---

## Radius & Shadow

```css
--radius-sm: 6px;  --radius-md: 8px;  --radius-lg: 12px;  --radius-full: 9999px;
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
--shadow-lg: 0 4px 12px rgba(0,0,0,0.1);
--shadow-xl: 0 8px 24px rgba(0,0,0,0.12);
```

### 컴포넌트 실규격 (수제 재현 금지 — 클래스 사용)
| 컴포넌트 | radius | padding | shadow |
|----------|--------|---------|--------|
| `.ds-card` | `--radius-md` 8px | `--space-lg` 16px (compact 12px) | **none → hover 약한 sm**(평탄화) |
| `.ds-btn` | `--radius-md` 8px | 8px 16px (`-sm`은 축소) | — |
| `.ds-badge` | **`--radius-sm` 각진** | 2px 8px | — (⛔ pill 아님) |
| `.ds-status`(목록 점) | — | dot 7px + gap | — |
| `.ds-input` | `--radius-md` 8px | 8px 12px | 포커스 링 |

---

## Layout / Transition

```css
--sidebar-w: 60px; --sidebar-w-expanded: 240px; --topbar-h: 48px;
--transition-fast: 0.15s ease; --transition-normal: 0.2s ease;
```

---

## Z-Index 실태 (shared-styles.ts 실측)

| 레이어 | 실값 |
|--------|------|
| 테이블 sticky 헤더 (`.ds-table thead th`) | 5 |
| 필터 sticky 영역 | 35~45 |
| ds-bulk-bar | 40 |
| **사이드바** | **50** |
| **모달 (`.ds-modal-overlay`)·ds-sheet** | **50~51** |
| **스택 모달 (`.ds-z-stack`)** — 모달 위 모달(품목·거래처 검색, 라이트박스, 발송결과 오버레이) | **60** |
| 드롭다운/서브메뉴 | 100 |
| 커맨드 팔레트 (`.ds-cmd-overlay`) | 200 |
| 툴팁 | 999 |
| 토스트·entity 드롭다운 | 9999 |

- ⚠️ 사이드바(50)와 모달(50)이 **동률 — DOM 순서 의존**. 신규 모달은 50 유지(토스트보다 아래).
- 모달 위에 뜨는 오버레이는 임의 `z-[60]`/`z-[70]` 대신 **`.ds-z-stack`(60) 단일 클래스** 사용 (shared-styles.ts 정의). 임의 z 브래킷 잔존 0 (2026-07-22 전수 정리).
