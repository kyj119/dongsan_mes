# 재고차감 구조 재설계 + 품목 체계 개선

> **작성일**: 2026-04-25
> **상태**: 설계 확정 — 구현 대기
> **선행 설계**: `2026-04-24-item-structure-redesign.md` (품목 체계 개편)

## 1. 배경 및 목적

### 핵심 인사이트
> "재고차감 구조가 품목 구조를 결정한다"

소재 유형(ROLL vs SHEET)에 따라 소비 패턴이 근본적으로 다르므로,
차감 로직을 먼저 확정하고 품목 등록 구조를 그에 맞춘다.

### 현재 문제
- ROLL 차감: 동작하지만 올림 처리 없음 (로스 미반영)
- ROLL 표시: yd 수치만 표시, 롤 단위 환산 없음
- SHEET 차감: 미구현 (평판 재고 관리 불가)
- 품목 필터: is_sales_item/is_purchase_item 고정 플래그 → 역할별 유연성 부족
- category_id: FK 시스템 형해화 (대부분 '기타' fallback)

### 목표
- ROLL/SHEET 두 소비 패턴에 맞는 통합 차감 로직
- 역할별 기본 필터로 품목 접근성 개선
- 불필요한 이중 구조 정리

## 2. 설계 결정 요약

| 항목 | 결정 |
|------|------|
| ROLL 재고 단위 | yd (현행 유지) |
| ROLL 올림 | yd 소수 첫째자리 올림 (3.445 → 3.5) |
| ROLL 표시 | 고정 길이 품목: "X롤", 가변 길이: "Xyd" |
| SHEET 재고 단위 | ㎡ |
| SHEET 올림 | 치수 10cm 올림 → 면적 계산 → 소수 둘째자리 올림 |
| SHEET 표시 | "X장 (Y㎡)" |
| SHEET 규격 선택 | 주문서에서 추천 + 사용자 선택 |
| 합배치 | 같은 주문, 같은 원자재 → 면적 합산 차감 |
| 차감 시점 | logwatcher print_status='OK' (ROLL/SHEET 동일) |
| 품목 필터 | 역할별 기본 필터 (계정 관리 페이지에서 설정) |
| category_id | TEXT category로 통일, FK 의존 제거 |
| 코드 범위 | 현행 유지 (printSystem vs items 분리) |
| product_materials | 소재 일괄 등록 시 자동 생성 |

## 3. Phase 구성

### Phase 1: ROLL 차감 개선
- 올림 처리 추가
- roll_length_m 필드 + 롤 환산 표시
- product_materials 자동 생성 (소재 일괄 등록 시)

### Phase 2: SHEET 차감 신규 구현
- ㎡ 기반 차감 로직
- 주문서 판재 추천 UI
- logwatcher 연동

### Phase 3: 품목 필터 + 정리
- 역할별 기본 필터 (계정 관리)
- category_id 의존 제거
- is_sales_item/is_purchase_item → item_type 기반 전환

---

## 4. DB 스키마 변경

### 4-1. print_media 확장

```sql
-- 롤 길이 (고정 길이 품목만, NULL = 가변)
ALTER TABLE print_media ADD COLUMN roll_length_m REAL;
```

| 소재 | media_type | roll_length_m | 비고 |
|------|-----------|---------------|------|
| 매쉬 | ROLL | 50 | 50m/롤 고정 |
| 텐트천 | ROLL | 30 | 30m/롤 고정 |
| 현수막천 | ROLL | NULL | 114yd~130yd 가변 |
| 포맥스 3T | SHEET | NULL | 해당 없음 |

### 4-2. order_items 확장

```sql
-- SHEET 품목: 주문 시 선택한 원자재(판재 규격)
ALTER TABLE order_items ADD COLUMN selected_material_id INTEGER
  REFERENCES items(id);
```

- **NULL**: ROLL 품목 (차감 시 width_mm 자동 매칭)
- **값 있음**: SHEET 품목 (이 원자재에서 차감)

### 4-3. users 확장

```sql
-- 기본 품목 필터 (JSON 또는 CSV)
ALTER TABLE users ADD COLUMN default_item_filter TEXT DEFAULT 'PRODUCT,GOODS,MATERIAL';
```

값 예시:
- `'PRODUCT,GOODS'` — 디자이너 (원자재 제외)
- `'PRODUCT,GOODS,MATERIAL'` — 경리/관리자 (전체)

### 4-4. category_id 정리 (비파괴적)

```sql
-- category_id의 NOT NULL 제약 제거 (기존 데이터 보존)
-- 신규 코드에서 category_id 참조하지 않음
-- item_categories, item_subcategories 테이블은 유지 (레거시 호환)
```

---

## 5. ROLL 차감 로직 (개선)

### 5-1. 현행 → 변경

```
현행:
  deductedYd = outputHeightMm / 914.4 × copyTotal

변경:
  deductedYd = Math.ceil((outputHeightMm / 914.4 × copyTotal) * 10) / 10
```

예시:
```
출력: 높이 315cm, 1매
현행: 3150 / 914.4 × 1 = 3.4449yd (정밀)
변경: ceil(3.4449 × 10) / 10 = 3.5yd (0.1yd 올림)
```

### 5-2. 롤 환산 표시

```typescript
function formatInventoryDisplay(quantity: number, media: PrintMedia): string {
  if (media.media_type === 'ROLL' && media.roll_length_m) {
    // 고정 길이: 롤 수 표시
    const ydPerRoll = media.roll_length_m / 0.9144
    const rolls = Math.floor(quantity / ydPerRoll)
    const remainYd = Math.round((quantity % ydPerRoll) * 10) / 10
    if (remainYd > 0) return `${rolls}롤 + ${remainYd}yd`
    return `${rolls}롤`
  }
  // 가변 길이: yd 직접 표시
  return `${Math.round(quantity * 10) / 10}yd`
}
```

예시:
```
매쉬 914폭 (roll_length_m=50):
  재고 120yd → ydPerRoll = 54.68 → 2롤 + 10.6yd

현수막천 914폭 (roll_length_m=NULL):
  재고 150yd → "150yd"
```

---

## 6. SHEET 차감 로직 (신규)

### 6-1. 차감 계산

```typescript
function calcSheetDeduction(
  widthCm: number,
  heightCm: number,
  quantity: number
): number {
  // 10cm 올림
  const w = Math.ceil(widthCm / 10) * 10
  const h = Math.ceil(heightCm / 10) * 10
  // ㎡ 계산 + 소수 둘째자리 올림
  const areaSqm = (w * h / 10000) * quantity
  return Math.ceil(areaSqm * 100) / 100
}
```

예시:
```
53×67cm × 3개
→ 60×70cm (10cm올림) → 0.42㎡ × 3 = 1.26㎡
→ ceil(1.26 × 100) / 100 = 1.26㎡ 차감

10×20cm × 1개
→ 10×20cm → 0.02㎡ × 1 = 0.02㎡ 차감 (1장이 아님!)
```

### 6-2. 장 수 환산 표시

```typescript
function formatSheetDisplay(quantitySqm: number, media: PrintMedia): string {
  const sheetArea = (media.sheet_width_cm * media.sheet_height_cm) / 10000
  const sheets = Math.floor(quantitySqm / sheetArea)
  const remainSqm = Math.round((quantitySqm % sheetArea) * 100) / 100
  if (remainSqm > 0) return `${sheets}장 + ${remainSqm}㎡ (총 ${quantitySqm}㎡)`
  return `${sheets}장 (${quantitySqm}㎡)`
}
```

예시:
```
포맥스 3T 4×8 (120×240cm, sheetArea=2.88㎡):
  재고 26.70㎡ → 9장 + 0.78㎡ (총 26.70㎡)
  
  50×70 × 6개 출력 → 2.10㎡ 차감
  잔량 24.60㎡ → 8장 + 1.56㎡ (총 24.60㎡)
```

### 6-3. 합배치 (같은 주문, 같은 원자재)

```typescript
// autoDeductInventory 내부: SHEET 품목 합산
// 같은 card의 order_items 중 같은 selected_material_id를 가진 것들을 묶음

interface SheetDeduction {
  materialItemId: number
  totalAreaSqm: number
  orderItems: number[]  // 합산된 order_item ids
}

// 같은 material_id끼리 면적 합산 후 1회 차감
const sheetGroups = new Map<number, SheetDeduction>()
for (const oi of orderItems) {
  if (oi.selected_material_id) {
    const existing = sheetGroups.get(oi.selected_material_id)
    const area = calcSheetDeduction(oi.width, oi.height, oi.quantity)
    if (existing) {
      existing.totalAreaSqm += area
      existing.orderItems.push(oi.id)
    } else {
      sheetGroups.set(oi.selected_material_id, {
        materialItemId: oi.selected_material_id,
        totalAreaSqm: area,
        orderItems: [oi.id]
      })
    }
  }
}
```

### 6-4. 입고 시 ㎡ 변환

```
포맥스 3T 4×8 10장 입고
→ 10 × (1.2m × 2.4m) = 28.80㎡
→ inventory.quantity += 28.80

포맥스 3T 3×6 5장 입고
→ 5 × (0.9m × 1.8m) = 8.10㎡
→ inventory.quantity += 8.10
```

**주의**: 같은 "포맥스 3T"라도 3×6과 4×8은 **다른 원자재 품목** (RM-P0001 vs RM-P0002).
각각 별도 inventory 행을 가짐. 입고 시 장→㎡ 변환.

---

## 7. autoDeductInventory 통합 흐름

```
print_event (OK)
  ↓
autoDeductInventory(db, printEventId)
  ↓
  ├─ 중복 체크 (UNIQUE print_event_id)
  ├─ print_event → card → order_items 조회
  │
  ├─ order_items 분류:
  │   ├─ ROLL 품목 (selected_material_id IS NULL)
  │   │   → 기존 로직: width_mm 매칭 → yd 차감 (0.1yd 올림)
  │   │
  │   └─ SHEET 품목 (selected_material_id IS NOT NULL)
  │       → 같은 material_id끼리 면적 합산
  │       → ㎡ 차감 (0.01㎡ 올림)
  │
  ├─ inventory UPDATE (quantity -= 차감량)
  └─ inventory_auto_deductions INSERT (기록)
```

### 7-1. ROLL vs SHEET 판별

```typescript
// order_item에 selected_material_id가 있으면 SHEET
// 없으면 ROLL (기존 width_mm 매칭)
const isSheet = !!orderItem.selected_material_id
```

### 7-2. inventory_auto_deductions 확장

```sql
ALTER TABLE inventory_auto_deductions ADD COLUMN deduction_type TEXT DEFAULT 'ROLL';
-- 'ROLL': yd 기반 차감
-- 'SHEET': ㎡ 기반 차감

ALTER TABLE inventory_auto_deductions ADD COLUMN deducted_area_sqm REAL;
-- SHEET 전용: 차감된 면적
```

---

## 8. 주문서 UI — 판재 추천

### 8-1. SHEET 품목 선택 시 흐름

```
1. 품목 선택: "UV 포맥스 3T"
2. 규격 입력: 50×70cm, 수량 5개
3. 시스템 자동 계산 (product_materials에서 SHEET 원자재 조회):

   ┌─────────────────────────────────────────────────────┐
   │ 📋 판재 추천                                        │
   │                                                     │
   │ ● 4×8 (120×240) — 1판 (6개 배치, 여유 1개)  ← 추천  │
   │ ○ 3×6 (90×180)  — 3판 (2개 배치)                    │
   │                                                     │
   │ 사용 면적: 2.10㎡                                    │
   └─────────────────────────────────────────────────────┘

4. 사용자 선택 → order_item.selected_material_id에 저장
```

### 8-2. 배치 계산 함수

```typescript
function recommendSheet(
  itemW: number, itemH: number, qty: number,
  sheets: Array<{ id: number, name: string, w: number, h: number, stock: number }>
): SheetRecommendation[] {
  return sheets.map(sheet => {
    // 정방향 배치
    const a = Math.floor(sheet.w / itemW) * Math.floor(sheet.h / itemH)
    // 회전 배치
    const b = Math.floor(sheet.w / itemH) * Math.floor(sheet.h / itemW)
    const perSheet = Math.max(a, b)
    const sheetsNeeded = Math.ceil(qty / perSheet)
    const usedArea = calcSheetDeduction(itemW, itemH, qty)

    return {
      materialId: sheet.id,
      name: sheet.name,
      dimensions: `${sheet.w}×${sheet.h}`,
      perSheet,
      sheetsNeeded,
      usedArea,
      stockSheets: Math.floor(sheet.stock / (sheet.w * sheet.h / 10000)),
      isRecommended: false  // 최적 1개만 true
    }
  })
  .filter(r => r.perSheet > 0)
  .sort((a, b) => a.sheetsNeeded - b.sheetsNeeded)
  .map((r, i) => ({ ...r, isRecommended: i === 0 }))
}
```

### 8-3. 합배치 알림

같은 주문에 같은 판재를 쓰는 아이템이 여러 개일 때:

```
⚠️ 이 주문의 다른 품목도 포맥스 3T를 사용합니다.
   아이템 B: 30×40 × 2개 (0.24㎡)
   합산: 2.34㎡ → 4×8 1판이면 충분합니다.
```

---

## 9. 역할별 기본 필터

### 9-1. 계정 관리 페이지 UI

```
사용자 편집 모달:
  ┌────────────────────────────────────────┐
  │ 기본 정보                              │
  │   이름: 홍길동                          │
  │   역할: DESIGNER                       │
  │                                        │
  │ 품목 검색 기본 필터                      │
  │   ☑ 제품 (PRODUCT)                     │
  │   ☑ 상품 (GOODS)                       │
  │   ☐ 원자재 (MATERIAL)                  │
  │                                        │
  │ ※ 주문서/발주서에서 기본 표시 항목.      │
  │   사용 중 언제든 필터 변경 가능.          │
  └────────────────────────────────────────┘
```

### 9-2. 역할별 기본값

| 역할 | 기본 필터 | 근거 |
|------|----------|------|
| ADMIN | PRODUCT, GOODS, MATERIAL | 전체 |
| MANAGER | PRODUCT, GOODS, MATERIAL | 전체 |
| ACCOUNTANT | PRODUCT, GOODS, MATERIAL | 원자재 직접 판매 가능 |
| DESIGNER | PRODUCT, GOODS | 원자재 사용 안 함 |
| OPERATOR | PRODUCT, GOODS | 원자재 사용 안 함 |

### 9-3. 적용 위치

```typescript
// 주문서 품목 검색 API 호출 시
const userFilter = window.__userData?.default_item_filter || 'PRODUCT,GOODS,MATERIAL'
axios.get('/api/items', {
  params: {
    search: query,
    item_type_in: userFilter,  // 새 파라미터: CSV로 복수 타입 필터
    limit: 20
  }
})
```

### 9-4. is_sales_item / is_purchase_item 전환

- **즉시 삭제 안 함** (기존 쿼리 호환)
- 새 코드에서는 `item_type_in` 파라미터 사용
- 기존 `type=sales` 파라미터 → `item_type_in=PRODUCT,GOODS`로 내부 변환
- GOODS 타입 등록 시 자동으로 is_sales_item=1, is_purchase_item=1 설정 (즉시 수정)

---

## 10. category_id 정리

### 10-1. 변경 범위

| 파일 | 변경 | 이유 |
|------|------|------|
| GET /api/items | LEFT JOIN item_categories 제거 | category TEXT 직접 사용 |
| GET /api/items/categories | 유지 (레거시 호환) | 기존 UI에서 사용 가능 |
| POST /api/items | category_id 조회 로직 단순화 | '기타' fallback 제거 |
| items.ts 쿼리 전반 | ic.category_name → i.category | JOIN 제거 |

### 10-2. 마이그레이션

```sql
-- category_id NOT NULL 제약 제거 (SQLite는 ALTER 불가 → 재생성 불필요)
-- 기존 데이터: category_id 값 유지 (레거시 호환)
-- 신규 데이터: category_id = NULL 허용 (실제로는 기존 로직상 값 들어감)
-- item_categories 테이블: 삭제하지 않음
```

---

## 11. product_materials 자동 생성

### 11-1. 소재 일괄 등록 시

printSystem.ts POST /media/bulk에서 원자재(RM) 생성 후:

```typescript
// 생성된 출력 품목(PRODUCT)과 원자재(MATERIAL)를 자동 매핑
for (const product of createdItems) {
  for (const rm of createdRM) {
    // 같은 소재(print_media)에서 파생된 경우
    if (rm.parent_media_id === product.print_media_id) {
      await db.prepare(`
        INSERT OR IGNORE INTO product_materials
          (product_item_id, material_item_id, is_default)
        VALUES (?, ?, 0)
      `).bind(product.id, rm.id).run()
    }
  }
}
```

### 11-2. 개별 소재 등록 시

printSystem.ts POST /media에서 품목 자동 생성 시에도 동일 로직 적용:
- 기존 원자재 중 `parent_media_id`가 같은 것들을 자동 매핑

---

## 12. API 변경

### 12-1. 신규/변경 엔드포인트

| Method | Path | 변경 | Phase |
|--------|------|------|-------|
| GET | /api/items | `item_type_in` CSV 파라미터 추가 | 3 |
| PATCH | /api/users/:id | `default_item_filter` 필드 추가 | 3 |
| GET | /api/inventory | 롤/장 환산 표시 추가 | 1,2 |

### 12-2. 기존 엔드포인트 변경

| Path | 변경 | Phase |
|------|------|-------|
| autoDeductInventory | ROLL 올림 + SHEET ㎡ 차감 | 1,2 |
| POST /api/print-system/media/bulk | product_materials 자동 생성 | 1 |
| GET /api/items | category_id JOIN 제거 | 3 |
| POST /api/items | GOODS 타입 is_sales+is_purchase 자동 설정 | 3 |

---

## 13. 파일 변경 목록

| Phase | 파일 | 변경 |
|-------|------|------|
| 1 | migrations/새 파일 | print_media.roll_length_m 추가 |
| 1 | src/utils/autoDeductInventory.ts | 0.1yd 올림 처리 |
| 1 | src/routes/printSystem.ts | product_materials 자동 생성 |
| 1 | src/routes/inventory.ts | 롤 환산 표시 |
| 1 | src/scripts/inventory.js | 롤/yd 표시 UI |
| 2 | migrations/새 파일 | order_items.selected_material_id, deductions 확장 |
| 2 | src/utils/autoDeductInventory.ts | SHEET ㎡ 차감 로직 |
| 2 | src/scripts/orderForm.js | 판재 추천 UI |
| 2 | src/routes/orders/core.ts | selected_material_id 저장 |
| 2 | src/routes/inventory.ts | ㎡→장 환산 표시 |
| 3 | migrations/새 파일 | users.default_item_filter |
| 3 | src/routes/items.ts | item_type_in 파라미터, category_id JOIN 제거 |
| 3 | src/routes/settings.ts | 사용자 필터 설정 API |
| 3 | src/scripts/settings.js | 계정 관리 필터 UI |
| 3 | src/scripts/orderForm.js | 기본 필터 적용 |

---

## 14. 검증 체크리스트

### Phase 1 완료 시
- [ ] ROLL 차감값 올림 확인 (3.445yd → 3.5yd)
- [ ] roll_length_m 설정된 소재의 롤 환산 표시 ("2롤 + 10.6yd")
- [ ] roll_length_m=NULL 소재의 yd 표시 ("150yd")
- [ ] 소재 일괄 등록 시 product_materials 자동 생성 확인
- [ ] 기존 ROLL 차감 동작 유지 (regression 없음)

### Phase 2 완료 시
- [ ] 주문서에서 SHEET 품목 선택 → 판재 추천 표시
- [ ] 판재 선택 → order_item.selected_material_id 저장
- [ ] logwatcher print_event → SHEET ㎡ 차감
- [ ] 같은 주문 합배치 면적 합산 차감
- [ ] 장 수 환산 표시 ("9장 + 0.78㎡")
- [ ] 입고 시 장→㎡ 변환 정상

### Phase 3 완료 시
- [ ] 계정 관리에서 기본 필터 설정/변경
- [ ] 역할별 기본값 적용 (DESIGNER → PRODUCT,GOODS)
- [ ] 주문서 품목 검색에 기본 필터 반영
- [ ] 필터 토글로 override 가능
- [ ] GOODS 등록 시 is_sales_item=1, is_purchase_item=1
- [ ] category_id JOIN 제거 후 기존 기능 정상
