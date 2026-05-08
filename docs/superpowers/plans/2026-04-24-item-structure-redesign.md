# 품목 체계 개편 + 출고 대시보드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출력방식+소재 분리 단가 체계, 카드 그룹핑 변경, 판재 배치 최적화, 출고 대시보드 구현

**Architecture:** print_methods + print_media 테이블로 출력방식과 소재를 분리하고, 조합 시 items를 자동 생성. 카드 생성은 card_group(OUTPUT/TRANSFER_FLAG/SIGN) 기반으로 변경. 출고 대시보드는 order_items.shipment_ready로 거래처별 출고 준비 상태 추적.

**Tech Stack:** Cloudflare Workers + Hono 4.x + D1(SQLite) + Vanilla JS + Tailwind CSS

**설계 문서:** `docs/superpowers/specs/2026-04-24-item-structure-redesign.md`

---

## Phase 1: DB 마이그레이션 + 시드

### Task 1: 마이그레이션 SQL 작성

**Files:**
- Create: `migrations/0154_print_method_media.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- 0154_print_method_media.sql
-- 출력방식 + 소재 분리 단가 체계

-- 1. 출력방식 테이블
CREATE TABLE IF NOT EXISTS print_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  card_group TEXT NOT NULL DEFAULT 'OUTPUT',
  price_per_sqm REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 소재 테이블
CREATE TABLE IF NOT EXISTS print_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  media_type TEXT DEFAULT 'ROLL',
  price_per_unit REAL DEFAULT 0,
  unit TEXT DEFAULT '㎡',
  roll_width_cm REAL,
  sheet_width_cm REAL,
  sheet_height_cm REAL,
  media_group TEXT,
  group_sort INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 출력방식 ↔ 소재 연결
CREATE TABLE IF NOT EXISTS print_method_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_method_id INTEGER NOT NULL,
  print_media_id INTEGER NOT NULL,
  price_override REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(print_method_id, print_media_id),
  FOREIGN KEY (print_method_id) REFERENCES print_methods(id) ON DELETE CASCADE,
  FOREIGN KEY (print_media_id) REFERENCES print_media(id) ON DELETE CASCADE
);

-- 4. items 테이블 확장
ALTER TABLE items ADD COLUMN print_method_id INTEGER REFERENCES print_methods(id);
ALTER TABLE items ADD COLUMN print_media_id INTEGER REFERENCES print_media(id);

-- 5. order_items 출고 준비 플래그
ALTER TABLE order_items ADD COLUMN shipment_ready INTEGER DEFAULT 0;

-- 6. 출력방식 시드 데이터
INSERT INTO print_methods (name, code, card_group, price_per_sqm, sort_order) VALUES
  ('솔벤', 'SOLVENT', 'OUTPUT', 0, 1),
  ('수성', 'AQUEOUS', 'OUTPUT', 0, 2),
  ('UV', 'UV', 'OUTPUT', 0, 3),
  ('평판', 'FLATBED', 'OUTPUT', 0, 4);

-- 7. 인덱스
CREATE INDEX IF NOT EXISTS idx_print_media_group ON print_media(media_group);
CREATE INDEX IF NOT EXISTS idx_print_media_active ON print_media(is_active);
CREATE INDEX IF NOT EXISTS idx_items_print_method ON items(print_method_id);
CREATE INDEX IF NOT EXISTS idx_items_print_media ON items(print_media_id);
CREATE INDEX IF NOT EXISTS idx_order_items_shipment_ready ON order_items(shipment_ready);
```

- [ ] **Step 2: 로컬 마이그레이션 적용**

```bash
npm run db:migrate:local
```
Expected: 마이그레이션 적용 성공

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```
Expected: 빌드 성공 (스키마만 추가, 코드 변경 없음)

- [ ] **Step 4: 커밋**

```bash
git add migrations/0154_print_method_media.sql
git commit -m "db: 출력방식+소재 분리 테이블 마이그레이션 (0154)"
```

---

## Phase 2: 출력방식/소재 API 라우트

### Task 2: 출력방식/소재 라우트 생성

**Files:**
- Create: `src/routes/printSystem.ts`
- Modify: `src/index.tsx` (라우트 등록)

- [ ] **Step 1: printSystem.ts 라우트 파일 생성**

출력방식 CRUD + 소재 CRUD + 연결 관리 + 품목 자동 생성 로직을 하나의 라우트 파일로 구현.

엔드포인트 목록:
```
GET    /api/print-system/methods              — 출력방식 목록
PATCH  /api/print-system/methods/:id          — 출력방식 단가 수정 (+ 품목 base_price 연쇄 업데이트)
GET    /api/print-system/media                — 소재 목록 (그룹핑)
POST   /api/print-system/media               — 소재 추가
POST   /api/print-system/media/bulk           — 소재 일괄 추가 (그룹 기반)
PUT    /api/print-system/media/:id            — 소재 수정
DELETE /api/print-system/media/:id            — 소재 삭제 (soft)
PATCH  /api/print-system/media/group/:groupName/price — 그룹 단가 일괄 조정
GET    /api/print-system/connections          — 연결 목록
POST   /api/print-system/connections          — 연결 추가 + 품목 자동 생성
DELETE /api/print-system/connections/:id      — 연결 해제 + 품목 비활성화
GET    /api/print-system/items-for-order      — 주문서용 품목 목록 (method별 필터)
```

핵심 로직:
- **연결 추가 시 품목 자동 생성**: print_method + print_media 연결 → items 테이블에 `[방식명] [소재명]` 품목 INSERT
- **단가 변경 시 연쇄 업데이트**: method 또는 media 단가 변경 → 관련 items.base_price 재계산
- **그룹 단가 조정**: media_group 내 모든 소재 단가를 비율(%) 또는 금액(±)으로 일괄 조정

- [ ] **Step 2: index.tsx에 라우트 등록**

```typescript
import printSystemRouter from './routes/printSystem'
// ...
app.route('/api/print-system', printSystemRouter)
```

- [ ] **Step 3: 빌드 + 타입체크**

```bash
npm run verify
```

- [ ] **Step 4: 스모크 테스트 엔드포인트 추가**

`scripts/smoke.cjs`의 ENDPOINTS 배열에 추가:
```javascript
{ path: '/api/print-system/methods', name: 'printSystem.methods' },
{ path: '/api/print-system/media', name: 'printSystem.media' },
{ path: '/api/print-system/connections', name: 'printSystem.connections' },
```

- [ ] **Step 5: 커밋**

```bash
git add src/routes/printSystem.ts src/index.tsx scripts/smoke.cjs
git commit -m "feat: 출력방식+소재 관리 API 라우트 (printSystem)"
```

---

## Phase 3: 출고 대시보드 API

### Task 3: 출고 대시보드 라우트

**Files:**
- Create: `src/routes/shipments.ts`
- Modify: `src/index.tsx` (라우트 등록)

- [ ] **Step 1: shipments.ts 라우트 생성**

엔드포인트:
```
GET   /api/shipments/dashboard    — 거래처별 출고 현황
PATCH /api/shipments/:orderId/ship — 출고 처리
GET   /api/shipments/counts       — 출고 가능/미완료 카운트 (사이드바 뱃지)
```

dashboard API 로직:
```sql
SELECT o.id, o.order_number, o.client_id, c.client_name,
       o.delivery_method, o.delivery_date, o.delivery_time,
       oi.id as item_id, oi.item_name, oi.quantity, oi.shipment_ready,
       ci.card_id, cd.card_number, cd.status as card_status
FROM orders o
JOIN clients c ON o.client_id = c.id
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN card_items ci ON ci.order_item_id = oi.id
LEFT JOIN cards cd ON cd.id = ci.card_id
WHERE o.status IN ('CONFIRMED','PRINTING','PRINT_DONE')
  AND DATE(o.delivery_date) = ?
ORDER BY c.client_name, o.id, oi.sort_order
```

프론트엔드에서 거래처별 그룹핑. 각 주문의 모든 oi.shipment_ready=1이면 출고 가능.

- [ ] **Step 2: index.tsx에 라우트 등록**

- [ ] **Step 3: 스모크 테스트 추가**

- [ ] **Step 4: 빌드 + 타입체크**

```bash
npm run verify
```

- [ ] **Step 5: 커밋**

```bash
git add src/routes/shipments.ts src/index.tsx scripts/smoke.cjs
git commit -m "feat: 출고 대시보드 API (shipments)"
```

---

## Phase 4: 카드 생성 로직 변경

### Task 4: orders/core.ts 카드 그룹핑 변경

**Files:**
- Modify: `src/routes/orders/core.ts` (라인 750-890)

- [ ] **Step 1: card_group 결정 함수 추가**

orders/core.ts 상단에 헬퍼 함수 추가:
```typescript
function getCardGroup(item: any): string | null {
  // 1. print_method_id가 있으면 → print_methods.card_group 사용
  if (item.print_method_card_group) return item.print_method_card_group
  // 2. category 기반 판단
  const cat = (item.category_name || item.category || '').toLowerCase()
  if (['전사', '깃발', '윈드배너', '가로등배너', '민방위기'].some(k => cat.includes(k))) return 'TRANSFER_FLAG'
  if (['태극기', '새마을기'].some(k => cat.includes(k))) return 'TRANSFER_FLAG'
  if (cat.includes('간판')) return 'SIGN'
  // 3. 상품/부자재 등 → 카드 미생성
  return null
}
```

- [ ] **Step 2: order_items 조회 쿼리 수정**

라인 762-774의 쿼리에 print_methods JOIN 추가:
```sql
SELECT oi.*, i.category, i.sub_category, i.print_method_id, i.print_media_id,
       pm.card_group as print_method_card_group
FROM order_items oi
LEFT JOIN items i ON oi.item_id = i.id
LEFT JOIN print_methods pm ON i.print_method_id = pm.id
WHERE oi.order_id = ?
ORDER BY oi.sort_order ASC
```

- [ ] **Step 3: 그룹핑 로직 변경**

라인 777-821의 `itemsByCategory` → `itemsByCardGroup` 변경:
```typescript
const itemsByCardGroup = new Map<string, Array<...>>()

for (const item of regularItems) {
  const cardGroup = getCardGroup(item)
  if (!cardGroup) continue  // 카드 미생성 품목 건너뜀
  if (!itemsByCardGroup.has(cardGroup)) itemsByCardGroup.set(cardGroup, [])
  itemsByCardGroup.get(cardGroup)!.push({ item, ppJson: item.post_processing || null, qty: item.quantity || 0 })
}
// 자식 행도 동일하게 cardGroup 기반
```

- [ ] **Step 4: shipment_ready 자동 설정**

PATCH /api/orders/:id/status에서 카드 없는 품목 처리:
- CONFIRMED 전환 시: 카드 없는 order_items → shipment_ready = 1
- 카드 PRINT_DONE 시: 해당 카드의 order_items → shipment_ready = 1

- [ ] **Step 5: 빌드 + 타입체크**

```bash
npm run verify
```

- [ ] **Step 6: 스모크 테스트**

```bash
npm run smoke
```

- [ ] **Step 7: 커밋**

```bash
git add src/routes/orders/core.ts
git commit -m "feat: 카드 생성 로직 card_group 기반으로 변경"
```

---

## Phase 5: 품목 관리 페이지 개편 (프론트엔드)

### Task 5: 품목 페이지 탭 추가

**Files:**
- Modify: `src/pages/items.ts` — 탭 UI 추가
- Modify: `src/scripts/items.js` — 출력방식·소재 관리 로직

- [ ] **Step 1: items.ts에 탭 구조 추가**

기존 검색/필터 영역 위에 탭 버튼 추가:
```html
<div class="flex border-b border-gray-200 mb-4">
  <button class="px-4 py-2 font-medium text-sm border-b-2 border-blue-600 text-blue-600"
          onclick="switchMainTab('printSystem')" id="tabPrintSystem">출력방식·소재</button>
  <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700"
          onclick="switchMainTab('items')" id="tabItems">일반 품목</button>
  <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700"
          onclick="switchMainTab('materials')" id="tabMaterials">원자재</button>
</div>
```

출력방식·소재 탭 컨텐츠:
- 출력방식 단가 테이블 (인라인 편집)
- 소재 관리 영역 (그룹별 아코디언)
- 소재 추가 모달, 일괄 추가 모달, 그룹 단가 조정 모달

- [ ] **Step 2: items.js에 출력방식·소재 관리 함수 추가**

핵심 함수:
```javascript
// 탭 전환
function switchMainTab(tab) { ... }

// 출력방식
function loadPrintMethods() { ... }
function updateMethodPrice(id, price) { ... }

// 소재
function loadPrintMedia() { ... }
function showMediaAddModal() { ... }
function showMediaBulkAddModal() { ... }
function saveMedia() { ... }
function saveBulkMedia() { ... }
function showGroupPriceAdjust(groupName) { ... }
function applyGroupPriceAdjust() { ... }

// 연결
function toggleMethodConnection(methodId, mediaId, checked) { ... }
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
git add src/pages/items.ts src/scripts/items.js
git commit -m "feat: 품목 관리 페이지 출력방식·소재 탭 추가"
```

---

## Phase 6: 주문서 UI 변경

### Task 6: orderForm.js 수정

**Files:**
- Modify: `src/scripts/orderForm.js`
- Modify: `src/pages/orderForm.ts` (필터 버튼 영역)

- [ ] **Step 1: 출력방식 필터 버튼 추가**

orderForm.ts에 품목 라인 영역 상단에 필터 UI:
```html
<button id="printMethodFilterBtn" class="w-6 h-6 bg-gray-100 border rounded text-xs text-gray-500 hover:bg-gray-200"
        onclick="togglePrintMethodFilter()" title="출력방식 필터">▼</button>
<div id="printMethodFilter" class="hidden mt-1">
  <!-- 1단계: 출력방식 버튼 -->
  <!-- 2단계: 소재 목록 -->
</div>
```

- [ ] **Step 2: 필터 로직 구현 (orderForm.js)**

```javascript
function togglePrintMethodFilter() { ... }
function selectPrintMethod(methodId) { ... }  // → 소재 목록 표시
function selectPrintMedia(mediaId) { ... }    // → 품목 필드 채우기 + 필터 접기
```

- [ ] **Step 3: 단가 계산 로직 수정**

calcItem 함수에서 새 구조 품목 처리:
- print_method_id + print_media_id가 있는 품목 → method.price + media.price 합산
- SHEET 타입 소재 → 판재 배치 계산 표시

- [ ] **Step 4: 금액 필드 수정 가능 처리**

amount 필드에서 readonly 제거, 수정 시 시각적 표시:
```javascript
// 금액 직접 수정 시
amountEl.addEventListener('change', function() {
  const calc = calcItemAmount(id);  // 자동 계산값
  const manual = parseMoney(this.value);
  if (calc !== manual) {
    this.classList.add('border-amber-400');  // 수정됨 표시
  }
});
```

- [ ] **Step 5: 단가 변경 시 저장 제안**

단가 수동 변경 시 client_prices 저장 제안:
```javascript
unitPriceEl.addEventListener('change', function() {
  const basePrice = getBasePrice(itemId);
  const newPrice = parseMoney(this.value);
  if (basePrice !== newPrice && clientId) {
    showPriceSavePrompt(clientId, itemId, newPrice);
  }
});
```

- [ ] **Step 6: 판재 배치 계산 표시**

```javascript
function updateSheetCalc(rowId) {
  const media = getSelectedMedia(rowId);
  if (!media || media.media_type !== 'SHEET') return;
  // 최적 판 계산 + 한 줄 표시
}
```

- [ ] **Step 7: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 8: 커밋**

```bash
git add src/scripts/orderForm.js src/pages/orderForm.ts
git commit -m "feat: 주문서 출력방식 필터 + 판재 배치 + 금액 수정"
```

---

## Phase 7: 출고 대시보드 프론트엔드

### Task 7: 출고 대시보드 페이지

**Files:**
- Create: `src/pages/shipments.ts`
- Create: `src/scripts/shipments.js`
- Modify: `src/layout.ts` (사이드바 메뉴)
- Modify: `src/index.tsx` (페이지 등록)

- [ ] **Step 1: shipments.ts 페이지 생성**

거래처별 출고 현황 레이아웃:
- 날짜 필터 (오늘/내일/이번주)
- 배송 방법 필터
- 출고 상태 필터 (전체/출고 가능/미완료)
- 거래처 블록 리스트 (각 블록: 주문 라인들 + 카드 상태)

- [ ] **Step 2: shipments.js 스크립트 생성**

```javascript
(function() {
  function loadShipments() { ... }
  function renderClientBlocks(data) { ... }
  function shipOrder(orderId) { ... }
  // 초기 로드
  loadShipments();
})();
```

- [ ] **Step 3: layout.ts 사이드바에 출고 메뉴 추가**

```typescript
{
  group: '출고/배송',
  items: [
    { path: '/shipments', icon: 'fa-truck', label: '출고 대시보드', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
  ],
},
```

- [ ] **Step 4: index.tsx 페이지 등록**

- [ ] **Step 5: 빌드 + 타입체크**

```bash
npm run verify
```

- [ ] **Step 6: 커밋**

```bash
git add src/pages/shipments.ts src/scripts/shipments.js src/layout.ts src/index.tsx
git commit -m "feat: 출고 대시보드 페이지 신설"
```

---

## Phase 8: 카드 알림 배너 + 통합 검증

### Task 8: 카드 페이지 알림 배너

**Files:**
- Modify: `src/scripts/cards.js`

- [ ] **Step 1: 같은 주문 다른 카드 조회 함수**

카드 상세 로드 시 같은 order_id의 다른 카드 조회:
```javascript
async function loadSiblingCards(orderId, currentCardId) {
  const res = await axios.get(`/api/cards?order_id=${orderId}`);
  return res.data.data.filter(c => c.id !== currentCardId);
}
```

- [ ] **Step 2: 알림 배너 렌더링**

카드 상세 모달 상단에 배너 삽입:
```javascript
function renderSiblingBanner(siblings) {
  if (!siblings.length) return '';
  const pending = siblings.filter(s => s.status !== 'PRINT_DONE' && s.status !== 'SHIPPED');
  if (!pending.length) return '';
  return `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
    <p class="text-sm font-medium text-amber-800">⚠️ 이 주문에 다른 카드가 있습니다</p>
    ${pending.map(s => `<p class="text-xs text-amber-600 mt-1">${s.card_number}: ${s.category_name} (${statusLabel(s.status)})</p>`).join('')}
    <p class="text-xs text-amber-500 mt-1">→ 전체 완료 후 같이 출고해야 합니다</p>
  </div>`;
}
```

- [ ] **Step 3: 빌드 확인**

- [ ] **Step 4: 커밋**

```bash
git add src/scripts/cards.js
git commit -m "feat: 카드 상세에 같은 주문 다른 카드 알림 배너"
```

### Task 9: 통합 검증

- [ ] **Step 1: 타입체크**

```bash
npm run typecheck
```

- [ ] **Step 2: 빌드**

```bash
npm run build
```

- [ ] **Step 3: 스모크 테스트**

```bash
npm run smoke
```

- [ ] **Step 4: 전체 변경 파일 리뷰**

```bash
git diff --stat main
```

모든 변경 파일 대상으로 review-checklist 스킬 실행.

- [ ] **Step 5: 최종 커밋 (필요 시)**

---

## 변경 파일 요약

| 구분 | 파일 | 작업 |
|------|------|------|
| DB | `migrations/0154_print_method_media.sql` | 3 테이블 생성 + 2 컬럼 추가 + 시드 |
| 라우트 | `src/routes/printSystem.ts` | 신규 (출력방식/소재/연결 CRUD) |
| 라우트 | `src/routes/shipments.ts` | 신규 (출고 대시보드 API) |
| 라우트 | `src/routes/orders/core.ts` | 카드 생성 로직 변경 |
| 페이지 | `src/pages/items.ts` | 탭 추가 |
| 페이지 | `src/pages/orderForm.ts` | 필터 버튼 |
| 페이지 | `src/pages/shipments.ts` | 신규 |
| 스크립트 | `src/scripts/items.js` | 출력방식/소재 관리 |
| 스크립트 | `src/scripts/orderForm.js` | 필터+단가+판재+금액 |
| 스크립트 | `src/scripts/shipments.js` | 신규 |
| 스크립트 | `src/scripts/cards.js` | 알림 배너 |
| 레이아웃 | `src/layout.ts` | 출고 메뉴 |
| 엔트리 | `src/index.tsx` | 라우트/페이지 등록 |
| 테스트 | `scripts/smoke.cjs` | 엔드포인트 추가 |
