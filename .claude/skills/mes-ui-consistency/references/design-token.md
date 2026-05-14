# Design Tokens — 동산기획 ERP+MES

이 문서는 시스템 전체에서 사용하는 디자인 토큰의 정확한 값을 정의합니다.
**단일 소스**: `src/layout.ts` `:root` 블록. 이 문서는 참조용 스냅샷.

---

## Color Tokens

### `--c-*` 시맨틱 변수 (layout.ts :root)

```css
:root {
  /* Primary — 주요 액션, 링크, 활성 상태 */
  --c-primary: #3b82f6;
  --c-primary-hover: #2563eb;
  --c-primary-light: #eff6ff;
  --c-primary-dark: #1e40af;

  /* Success — 완료, 활성, 정상 */
  --c-success: #16a34a;
  --c-success-light: #dcfce7;

  /* Warning — 주의, 대기 */
  --c-warning: #d97706;
  --c-warning-light: #fef3c7;

  /* Danger — 에러, 긴급, 삭제 */
  --c-danger: #dc2626;
  --c-danger-light: #fee2e2;

  /* Info — 진행중, 대기 */
  --c-info: #2563eb;
  --c-info-light: #dbeafe;

  /* 확장 시맨틱 (KPI·카드·차트에서도 사용) */
  --c-purple: #7c3aed;
  --c-purple-light: #f5f3ff;
  --c-orange: #ea580c;
  --c-orange-light: #fff7ed;
  --c-teal: #0d9488;
  --c-teal-light: #f0fdfa;

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
  --c-sidebar: #1e293b;
  --c-sidebar-hover: #334155;
  --c-sidebar-border: #334155;
  --c-sidebar-text: #94a3b8;
  --c-sidebar-text-active: #ffffff;
}
```

> 다크 모드(`html.dark`)는 동일 변수명에 다른 값을 할당 (layout.ts 참조).

### 차트 팔레트 (시각화 전용)

데이터 시각화에 필요할 때만 아래 순서로 사용:
```
--c-primary → --c-success → --c-warning → --c-danger → --c-purple → --c-teal → --c-orange
```

---

## Typography Tokens

```css
:root {
  /* Font Family */
  --font-family: 'Inter', 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

  /* Font Sizes */
  --text-xs: 0.75rem;     /* 12px — 뱃지, 카테고리 라벨 */
  --text-sm: 0.875rem;    /* 14px — 본문, 테이블 셀, 입력 필드 */
  --text-base: 1rem;      /* 16px — 기본 */
  --text-lg: 1.125rem;    /* 18px — 섹션 제목 */
  --text-xl: 1.25rem;     /* 20px — 페이지 내 대제목 */
  --text-3xl: 1.875rem;   /* 30px — 요약 카드 숫자 (실제 32px에 가까움) */

  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

### Typography 사용 매핑

| 요소 | 크기 | 굵기 | 색상 |
|------|------|------|------|
| 요약 카드 숫자 | `text-3xl` | `font-bold` | 시맨틱 또는 `gray-900` |
| 요약 카드 라벨 | `text-sm` | `font-medium` | `gray-500` |
| 요약 카드 부가설명 | `text-xs` | `font-normal` | `gray-400` |
| 섹션 제목 | `text-lg` | `font-bold` | `gray-900` |
| 테이블 헤더 | `text-xs` | `font-semibold` | `gray-600` |
| 테이블 셀 | `text-sm` | `font-normal` | `gray-900` |
| 필터 라벨 | `text-sm` | `font-medium` | `gray-700` |
| 폼 라벨 | `text-sm` | `font-semibold` | `gray-700` |
| 입력 필드 | `text-sm` | `font-normal` | `gray-900` |
| 빈 상태 타이틀 | `text-base` | `font-medium` | `gray-500` |
| 빈 상태 설명 | `text-sm` | `font-normal` | `gray-400` |

---

## Spacing Tokens

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
}
```

### 간격 사용 매핑

| 위치 | 값 | Tailwind |
|------|-----|----------|
| 페이지 상단 여백 | 24px | `pt-6` |
| 섹션 간 간격 | 24px | `space-y-6` |
| 카드 그리드 간격 | 16px | `gap-4` |
| 카드 내부 패딩 | 20px | `p-5` |
| 필터 ↔ 테이블 간격 | 16px | `mt-4` |
| 사이드바 카테고리 간 | 24px | `mt-6` |
| 사이드바 메뉴 항목 간 | 4px | `space-y-1` |
| 아이콘 ↔ 텍스트 | 12px | `gap-3` |
| 버튼 내 아이콘 ↔ 텍스트 | 8px | `gap-2` |

---

## Border & Shadow Tokens

```css
:root {
  /* Border */
  --border-default: 1px solid #e5e7eb;   /* gray-200 */
  --border-radius-md: 0.375rem;           /* 6px */
  --border-radius-lg: 0.5rem;             /* 8px */
  --border-radius-xl: 0.75rem;            /* 12px — 카드 */
  --border-radius-full: 9999px;           /* 뱃지 pill */

  /* Shadow */
  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);
  --shadow-card: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1);
}
```

---

## Z-Index Scale

| 레이어 | 값 |
|--------|-----|
| 테이블 sticky 헤더 | `z-10` |
| 드롭다운 메뉴 | `z-20` |
| 사이드바 | `z-30` |
| 모달 배경 | `z-40` |
| 모달 | `z-50` |
| 토스트/알림 | `z-60` |