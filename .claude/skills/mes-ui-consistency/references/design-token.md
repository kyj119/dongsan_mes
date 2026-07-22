# Design Tokens — 동산기획 ERP+MES

**단일 소스 = `src/layout/shared-styles.ts` `:root` 블록.** 이 문서는 참조용 스냅샷(2026-07-22 실코드 기준 재생성).
⚠️ 여기 없는 토큰명(`--text-*`, `--space-1..8`, `--border-radius-*`, `--shadow-card`)은 **존재하지 않는다** — 과거 문서 드리프트였음. 반드시 아래 실명만 사용.

---

## Color Tokens (`--c-*`)

```css
:root {
  /* Primary — 주요 액션, 링크, 활성 상태 (#3b82f6 = blue-500) */
  --c-primary: #3b82f6;
  --c-primary-hover: #2563eb;
  --c-primary-light: #eff6ff;
  --c-primary-dark: #1e40af;

  /* 시맨틱 */
  --c-success: #16a34a;  --c-success-light: #dcfce7;
  --c-warning: #d97706;  --c-warning-light: #fef3c7;
  --c-danger:  #dc2626;  --c-danger-light:  #fee2e2;
  --c-info:    #2563eb;  --c-info-light:    #dbeafe;

  /* 확장 (차트·KPI 전용 — 상태 UI 사용 금지) */
  --c-purple: #7c3aed; --c-purple-light: #f5f3ff;
  --c-orange: #ea580c; --c-orange-light: #fff7ed;
  --c-teal:   #0d9488; --c-teal-light:   #f0fdfa;

  /* Surface & Layout */
  --c-bg: #F0F1F3;
  --c-surface: #ffffff;
  --c-surface-secondary: #f9fafb;
  --c-surface-stripe: #f8fafc;
  --c-border: #e2e8f0;
  --c-border-light: #f1f5f9;

  /* Text */
  --c-text: #1e293b;
  --c-text-secondary: #64748b;
  --c-text-muted: #94a3b8;

  /* Sidebar */
  --c-sidebar: #1e293b; --c-sidebar-hover: #334155; --c-sidebar-border: #334155;
  --c-sidebar-text: #94a3b8; --c-sidebar-text-active: #ffffff;
}
```

> 다크 모드(`html.dark`)는 동일 변수명 재할당(shared-styles.ts 참조). **인라인 hex는 다크모드에서 안 바뀜** — 색은 토큰/Tailwind 유틸로.
> ⚠️ 버튼 채움색 구분: Tailwind `bg-blue-600`(#2563eb)=Primary 버튼 배경, `--c-primary`(#3b82f6)=링크·포커스·아이콘. 둘은 의도적으로 다름.

### 차트 팔레트 (시각화 전용, 이 순서로)
```
--c-primary → --c-success → --c-warning → --c-danger → --c-purple → --c-teal → --c-orange
```

---

## Typography Tokens (`--fs-*`)

```css
--font-family: 'Inter', 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
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
| 요약 카드 숫자 | `--fs-3xl`(text-3xl) | bold | 기본 `#212529`, 위험만 시맨틱 |
| 섹션 제목 | `--fs-lg` | bold | gray-900 |
| 테이블 헤더 | `--fs-xs` | semibold | gray-600 |
| 테이블 셀/본문/입력 | `--fs-sm` | normal | gray-900 |
| 뱃지/캡션 | `--fs-xs` | medium | 시맨틱 *-700 |

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
| ds-card 내부 패딩 | `--space-xl` 24px (compact=`--space-lg` 16px) |
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
| `.ds-card` | `--radius-lg` 12px | `--space-xl` 24px (compact 16px) | md → hover lg |
| `.ds-btn` | `--radius-md` 8px | 8px 16px (`-sm`은 축소) | — |
| `.ds-badge` | pill | 2px 8px | — |
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
| 드롭다운/서브메뉴 | 100 |
| 커맨드 팔레트 (`.ds-cmd-overlay`) | 200 |
| 툴팁 | 999 |
| 토스트·entity 드롭다운 | 9999 |

- ⚠️ 사이드바(50)와 모달(50)이 **동률 — DOM 순서 의존**. 신규 모달은 50 유지(토스트보다 아래), 임의 `z-[60]`+ 신설 금지.
- 페이지 임의 z-값 잔존: `z-[60]`×4·`z-[70]`×2 (품목검색·거래처검색 모달 70) — 정리 전까지 신규 답습 금지.
