# Component Specs — 동산현수막 ERP+MES

이 문서는 공통 컴포넌트의 상세 구현 스펙입니다.
새 컴포넌트를 만들기 전에 여기에 해당하는 것이 있는지 먼저 확인하세요.

---

## SummaryCard

페이지 상단 KPI 요약 카드. 모든 목록/대시보드 페이지에서 사용.

### Props

```typescript
interface SummaryCardProps {
  label: string;           // 카드 상단 라벨 ("전체 주문", "납기 지연" 등)
  value: number | string;  // 표시할 숫자 또는 금액
  unit?: string;           // 단위 ("원", "개", "%" 등)
  description?: string;    // 부가 설명 ("출고완료 · 미확인")
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: ReactNode;        // 선택적 Lucide 아이콘
}
```

### Variant → Color 매핑

| variant | 숫자 색상 | 용도 |
|---------|-----------|------|
| `default` | `text-gray-900` | 일반 집계 (전체 주문, 거래처 수 등) |
| `success` | `text-green-600` | 완료, 정상 (출고완료, 입고완료) |
| `warning` | `text-amber-500` | 주의 (대기, 보류, 30~60일) |
| `danger` | `text-red-600` | 긴급/위험 (납기 지연, 미수금, 60일 초과) |
| `info` | `text-blue-600` | 진행중 (생산중, 입고대기) |

### 렌더링 규칙

```
┌────────────────────────────┐
│ label          (13px, gray-500, font-medium)
│ value + unit   (32px, bold, variant color)
│ description    (12px, gray-400)
└────────────────────────────┘
```

- 배경: `bg-white`
- 테두리: `border border-gray-200`
- 라운드: `rounded-xl` (12px)
- 패딩: `p-5`
- 그리드: `grid grid-cols-4 gap-4` (부모에서)
- 3개 카드면 `grid-cols-4` 유지, 마지막 칸 비움
- 5개면 `grid-cols-5` 또는 4+1 별도 행

---

## StatusBadge

상태를 나타내는 Pill 뱃지.

### Props

```typescript
interface StatusBadgeProps {
  label: string;
  variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  dot?: boolean;  // 좌측에 컬러 dot 표시 (선택)
}
```

### Variant 스타일

| variant | 배경 | 텍스트 | dot 색 |
|---------|------|--------|--------|
| `success` | `bg-green-50` | `text-green-700` | `bg-green-500` |
| `info` | `bg-blue-50` | `text-blue-700` | `bg-blue-500` |
| `warning` | `bg-amber-50` | `text-amber-700` | `bg-amber-500` |
| `danger` | `bg-red-50` | `text-red-700` | `bg-red-500` |
| `neutral` | `bg-gray-100` | `text-gray-700` | `bg-gray-500` |

### 공통 스타일
```
rounded-full px-2.5 py-0.5 text-xs font-medium inline-flex items-center gap-1.5
```

### 상태 매핑 (시스템 전체 통일)

| 데이터 | variant |
|--------|---------|
| 활성, 완료, 정상, 출고완료 | `success` |
| 진행중, 대기, 확정, 입고대기 | `info` |
| 보류, 부분입고, 30-60일 | `warning` |
| OFF, 취소, 에러, 납기지연, 60일초과 | `danger` |
| 매출(유형), 매입(유형), 기본값 | `neutral` |

---

## Button

4가지 variant만 존재.

### Props

```typescript
interface ButtonProps {
  variant: 'primary' | 'danger' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}
```

### Size 스펙

| size | 높이 | 패딩 | 텍스트 |
|------|------|------|--------|
| `sm` | `h-8` | `px-3` | `text-xs` |
| `md` | `h-10` | `px-4` | `text-sm` |
| `lg` | `h-12` | `px-6` | `text-base` |

### Variant 스타일

```
primary:   bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500
danger:    bg-red-600 text-white hover:bg-red-700 focus:ring-red-500
secondary: bg-white text-gray-700 border border-gray-300 hover:bg-gray-50
ghost:     text-gray-500 hover:text-gray-700 hover:bg-gray-100
```

모든 버튼: `rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2`

---

## EmptyState

데이터가 없을 때 표시하는 빈 상태 컴포넌트.

### Props

```typescript
interface EmptyStateProps {
  icon: ReactNode;        // Lucide 아이콘 (size={40}, text-gray-300)
  title: string;          // "주문이 없습니다"
  description?: string;   // "새 주문을 등록해 보세요"
  action?: ReactNode;     // CTA 버튼 (선택)
}
```

### 레이아웃

```
      ┌─────────────────┐
      │     [아이콘]      │   size={40}, text-gray-300
      │                   │
      │   title           │   text-base, font-medium, text-gray-500
      │   description     │   text-sm, text-gray-400, mt-1
      │                   │
      │   [CTA 버튼]      │   mt-4 (있을 때만)
      └─────────────────┘
```

- 전체: `flex flex-col items-center justify-center py-12`
- 테이블 내부에서 사용 시 `colspan` 전체 적용

---

## FilterBar (`.ds-filter-bar`)

목록 페이지의 필터 영역. `layout.ts`에 정의된 CSS 컴포넌트.

### CSS 클래스 구조

```html
<div class="ds-filter-bar">
  <div class="ds-filter-chips">            <!-- 검색 + 인라인 필터 -->
    <div class="ds-filter-field">           <!-- 개별 필터 항목 -->
      <label class="ds-label">검색</label>
      <input class="ds-input ds-input-sm" />
    </div>
    ...
  </div>
  <div class="ds-filter-actions">           <!-- 버튼 그룹 (ml-auto) -->
    <button class="ds-btn ds-btn-ghost">초기화</button>
    <button class="ds-btn ds-btn-primary">검색</button>
  </div>
  <button class="ds-filter-toggle">더보기 ▼</button>  <!-- 4개+ 필터 시 -->
  <div class="ds-filter-expand">            <!-- 접힘 영역, .open 토글 -->
    <div class="ds-filter-field">...</div>
  </div>
</div>
```

### 주요 클래스

| 클래스 | 역할 |
|--------|------|
| `.ds-filter-bar` | 컨테이너 (flex wrap, gap, 배경/보더/라운드) |
| `.ds-filter-chips` | 인라인 필터 그룹 (flex wrap) |
| `.ds-filter-field` | 개별 필터 (label + input) |
| `.ds-filter-actions` | 버튼 그룹 (`margin-left: auto`) |
| `.ds-filter-toggle` | 더보기/접기 토글 버튼 |
| `.ds-filter-expand` | 접힘 영역 (`.open` 클래스로 토글) |
| `.ds-filter-divider` | 세로 구분선 |

---

## BulkBar (`.ds-bulk-bar`)

목록 페이지 하단 고정 일괄 작업 바. 체크박스 선택 시 나타남.

### CSS 클래스 구조

```html
<div class="ds-bulk-bar" id="bulkActionBar">       <!-- fixed bottom -->
  <div class="ds-bulk-bar-count">
    <i class="fas fa-check-square"></i> <span id="bulkCount">0</span>건 선택
  </div>
  <div class="ds-bulk-bar-divider"></div>
  <div class="ds-bulk-bar-actions">
    <select class="ds-input ds-input-sm">...</select>
    <button class="ds-btn ds-btn-primary ds-btn-sm">상태변경</button>
  </div>
  <div class="ds-bulk-bar-end">
    <button class="ds-btn ds-btn-ghost ds-btn-sm">선택 해제</button>
  </div>
</div>
<div class="ds-bulk-bar-spacer" id="bulkActionSpacer"></div>  <!-- 하단 여백 -->
```

### 주요 클래스

| 클래스 | 역할 |
|--------|------|
| `.ds-bulk-bar` | 하단 고정 바 (`position: fixed; bottom: 0`) |
| `.ds-bulk-bar.visible` | 표시 상태 (`transform: translateY(0)`) |
| `.ds-bulk-bar-count` | 선택 건수 표시 |
| `.ds-bulk-bar-divider` | 세로 구분선 |
| `.ds-bulk-bar-actions` | 액션 버튼 그룹 |
| `.ds-bulk-bar-end` | 우측 정렬 (`margin-left: auto`) |
| `.ds-bulk-bar-spacer` | 바 높이만큼 여백 (`.visible`로 토글) |

### JS 토글 패턴

```javascript
var bar = document.getElementById('bulkActionBar');
var spacer = document.getElementById('bulkActionSpacer');
if (selectedCount > 0) {
  bar.classList.add('visible');
  spacer.classList.add('visible');
} else {
  bar.classList.remove('visible');
  spacer.classList.remove('visible');
}
```

---

## ActionButton (테이블 내)

테이블 행의 액션 컬럼에 사용하는 아이콘 버튼.

### Props

```typescript
interface ActionButtonProps {
  icon: ReactNode;
  tooltip: string;
  variant?: 'default' | 'danger';
  onClick?: () => void;
}
```

### 스타일

```
default: text-gray-400 hover:text-gray-600 hover:bg-gray-100
danger:  text-gray-400 hover:text-red-600 hover:bg-red-50
```

공통: `p-1.5 rounded-md transition-colors`

### 사용 패턴

```jsx
<td className="flex items-center gap-1">
  <ActionButton icon={<Eye size={16} />} tooltip="상세" />
  <ActionButton icon={<Pencil size={16} />} tooltip="수정" />
  <ActionButton icon={<Trash2 size={16} />} tooltip="삭제" variant="danger" />
</td>
```

---

## 현장 카드(칸반) 칼럼

### 칼럼 헤더

| 칼럼 | 배경색 | 뱃지색 |
|------|--------|--------|
| RIP 대기 | `bg-amber-50` | `bg-amber-500 text-white` |
| 출력중 | `bg-blue-50` | `bg-blue-500 text-white` |
| 출력완료 | `bg-green-50` | `bg-green-500 text-white` |

- 칼럼 제목: `text-sm font-semibold text-gray-700`
- 카운트 뱃지: 해당 칼럼 색상의 `rounded-full px-2 py-0.5 text-xs font-bold`
- 칼럼 최소 높이: `min-h-[200px]` (빈 상태에서도 드롭 가능 영역 확보)

---

## Bento Grid (`.ds-bento`)

대시보드 KPI 카드 레이아웃. 첫 번째 카드를 2x2 히어로로 배치.

### CSS 클래스

```html
<div class="ds-bento">
  <div class="ds-bento-hero"><!-- 히어로 카드 (2col x 2row) --></div>
  <div><!-- 일반 카드 --></div>
  <div><!-- 일반 카드 --></div>
  ...
</div>
```

| 클래스 | 역할 |
|--------|------|
| `.ds-bento` | `display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-lg)` |
| `.ds-bento-hero` | `grid-column: span 2; grid-row: span 2` (첫 번째 카드 강조) |

반응형: `@media ≤1024px` → 3열, `≤768px` → 2열, `≤640px` → 1열 (hero span 해제)

---

## Count-Up 애니메이션

KPI 숫자에 적용하는 카운트업 효과. `src/scripts/dashboard.js`에 구현.

### 사용 패턴

```javascript
function animateCount(el, target, duration) {
  // requestAnimationFrame 기반, 0 → target까지 duration(ms) 동안 증가
  // 금액은 toLocaleString() 포맷 적용
}
```

---

## 스크롤 그림자 (`.ds-table-wrap`)

테이블 컨테이너에 스크롤 위치에 따른 상단 그림자 효과.

```css
.ds-table-wrap {
  overflow-x: auto;
  /* JS로 scroll 이벤트 감지 → .scrolled 클래스 토글 */
}
.ds-table-wrap.scrolled {
  box-shadow: inset 0 8px 6px -6px rgba(0,0,0,0.08);
}