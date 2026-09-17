# UI 상세 패턴 & 코드 예제

> SKILL.md 핵심 규칙의 상세 구현 참조용.
> ⚠️ 2026-09 리디자인(감청 navy·Linear형) 반영. **값 정본 = `src/layout/shared-styles.ts`** — 아래 hex/px 는 참고이며 낡을 수 있다. 토큰(`--c-*`)·`ds-*` 클래스 이름을 값보다 우선한다.
> 표준 카드=`ds-card`(평탄화 2026-09: hairline 테두리·radius 8px·패딩 16px·상시 그림자 없음). 아래 예제는 **소형 밀집 KPI 카드**(rounded-lg·p-2.5·gap-2) 변형 — 일반 요약 카드에 복사 금지.

## 카드 HTML

```html
<!-- 일반 카드 (평탄화: hairline 테두리만, 그림자 없음) -->
<div class="bg-white rounded-lg border p-2.5 text-center">
  <div class="text-xl font-bold tabular-nums" style="color:var(--c-text);">42</div>
  <div class="text-[10px] text-gray-400">전체</div>
</div>

<!-- 위험 카드 (테두리만 위험색, 그림자 없음) -->
<div class="bg-white rounded-lg border border-red-200 p-2.5 text-center">
  <div class="text-xl font-bold text-red-600 tabular-nums">2</div>
  <div class="text-[10px] text-red-500 font-medium">지연</div>
</div>
```

## 뱃지 HTML

```html
<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
  <i class="fas fa-check-circle text-[7px] mr-1"></i>완료
</span>
```
> 각진 태그(`rounded`, 알약 금지). **목록/테이블 행 상태는 이 색배경 뱃지 대신 점+글자** — `window.dsStatusDot('order'|'card'|'equip', status)` 또는 `window.dsDot('blue'|'green'|'amber'|'red'|'gray', label)`. 위 뱃지는 상세·카드보드·모달용.

## 테이블 호버 액션

```css
/* 표준(2026-09): 부모 tr 에 .ds-row, 액션 셀에 .ds-row-action — layout 전역 CSS 정본 */
.ds-row-action { opacity: 0; transition: opacity var(--transition-fast); }
tr.ds-row:hover .ds-row-action { opacity: 1; }
@media (hover: none) { .ds-row-action { opacity: 1; } }  /* 모바일은 항상 표시 */
```

## 줄무늬 + 밀도

```css
.ds-table-striped tbody tr:nth-child(even) { background: var(--c-surface-stripe); }
.ds-table-striped tbody tr:nth-child(even):hover { background: var(--c-bg); }
.ds-table-compact thead th { padding: 6px 8px; }
.ds-table-compact tbody td { padding: 6px 8px; font-size: var(--fs-xs); }
```

```html
<!-- 밀도 토글 -->
<button onclick="toggleTableDensity(this)" class="text-gray-400 hover:text-gray-600" title="테이블 밀도">
  <i class="fas fa-th-list text-xs"></i>
</button>
```

## 헤더 고정

```html
<div class="ds-table-wrap" style="max-height: calc(100vh - 280px); overflow-y: auto;">
  <table class="ds-table ds-table-striped">
    <thead>...</thead>  <!-- 자동 고정 (sticky top-0 z-5) -->
    <tbody>...</tbody>
  </table>
</div>
```

## 빈 상태

```html
<!-- 테이블 내 -->
<td colspan="N" class="text-center py-12">
  <i class="fas fa-inbox text-3xl mb-3 block text-gray-300"></i>
  <div class="text-sm text-gray-500 mb-1">데이터가 없습니다</div>
  <button class="ds-btn ds-btn-primary ds-btn-sm mt-2">+ 새 항목</button>
</td>

<!-- 독립 -->
<div class="ds-empty">
  <i class="fas fa-inbox"></i>
  <p>데이터가 없습니다</p>
</div>
```

## 로딩 스켈레톤

```css
.ds-skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: ds-shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}
.ds-skeleton-text { height: 14px; margin-bottom: 8px; width: 80%; }
.ds-skeleton-title { height: 24px; margin-bottom: 12px; width: 60%; }
.ds-skeleton-card { height: 80px; border-radius: var(--radius-lg); }
.ds-skeleton-row { height: 44px; margin-bottom: 4px; }
```

```html
<!-- 카드 -->
<div class="grid grid-cols-4 gap-2">
  <div class="ds-skeleton ds-skeleton-card"></div>
  <div class="ds-skeleton ds-skeleton-card"></div>
</div>

<!-- 테이블 (5~8행) -->
<div class="ds-skeleton ds-skeleton-row"></div>
<div class="ds-skeleton ds-skeleton-row"></div>
```

## 글래스톱 헤더

```css
.top-bar {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
```

## 트랜지션

| 요소 | 전환 | 속도 |
|------|------|------|
| 버튼 | `all` | 0.15s |
| 카드 | `border-color, box-shadow` | 0.15s |
| 테이블 행 | `background` | 0.15s |
| 입력 필드 | `border-color, box-shadow` | 0.15s |
| 사이드바 | `width` | 0.2s |

## 폰트

주폰트 = **Pretendard** (Inter 제거됨, 2026-09).
```css
--font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Malgun Gothic', sans-serif;
```
CDN (이미 `layout.ts:47` 로드): `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css`

## 폼 상세

- 라벨: `text-sm font-medium mb-1`, 색상 `var(--c-text-secondary)`, 필수 `<span class="text-red-500">*</span>`
- 입력: `w-full border rounded px-3 py-2 text-sm`, 색상 `var(--c-text)` (`ds-input` 클래스 우선)
- 포커스 링: `border-gray-400 shadow-[0_0_0_3px_rgba(156,163,175,0.15)]`
- 파일 업로드: `border-2 border-dashed border-gray-300 rounded-lg`
- 저장: Primary 우측, 취소: Secondary

## 간격

| 요소 | 값 |
|------|-----|
| 섹션 간 | `space-y-4` ~ `space-y-5` |
| 카드 그리드 | `gap-2` |
| 카드 테두리 | hairline(`--c-border`), 상시 그림자 없음 → 호버 시에만 약한 `shadow-sm` |
