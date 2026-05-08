# Design Tokens — 동산현수막 ERP+MES

이 문서는 시스템 전체에서 사용하는 디자인 토큰의 정확한 값을 정의합니다.
CSS 변수 또는 Tailwind config에서 이 값을 참조하세요.

---

## Color Tokens

### Semantic Colors (의미 기반)

```css
:root {
  /* Primary — 주요 액션, 링크, 활성 상태 */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;   /* 기본 */
  --color-primary-700: #1d4ed8;

  /* Success — 완료, 활성, 정상 */
  --color-success-50: #f0fdf4;
  --color-success-100: #dcfce7;
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;   /* 기본 */
  --color-success-700: #15803d;

  /* Warning — 주의, 대기 */
  --color-warning-50: #fffbeb;
  --color-warning-100: #fef3c7;
  --color-warning-400: #fbbf24;
  --color-warning-500: #f59e0b;   /* 기본 */
  --color-warning-600: #d97706;

  /* Danger — 에러, 긴급, 삭제 */
  --color-danger-50: #fef2f2;
  --color-danger-100: #fee2e2;
  --color-danger-500: #ef4444;
  --color-danger-600: #dc2626;    /* 기본 */
  --color-danger-700: #b91c1c;

  /* Neutral — 텍스트, 배경, 보더 */
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;
}
```

### 사용 금지 색상

아래 색상은 본문 UI에서 사용하지 않습니다. 차트/그래프 데이터 시각화에서만 허용.

| 색상 | 용도 제한 |
|------|-----------|
| Purple (`#7c3aed`) | 차트 전용 |
| Pink (`#db2777`) | 차트 전용 |
| Teal (`#0d9488`) | 차트 전용 |
| Indigo (`#4f46e5`) | 사용 금지 (Primary Blue와 혼동) |

### 차트 팔레트 (시각화 전용)

데이터 시각화에 필요할 때만 아래 순서로 사용:
```
#2563eb → #16a34a → #f59e0b → #dc2626 → #7c3aed → #0d9488 → #db2777
```

---

## Typography Tokens

```css
:root {
  /* Font Family */
  --font-sans: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

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