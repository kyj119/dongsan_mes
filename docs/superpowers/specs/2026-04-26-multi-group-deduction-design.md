# 다중 원자재 그룹 재고 차감 설계

> 날짜: 2026-04-26  
> 상태: 설계 완료, 구현 대기

## 배경

현재 `autoDeductInventory`는 1개 print_event당 **1개 원자재만 차감**한다.
하지만 실제 비즈니스에서는 1개 소재에 **여러 원자재 그룹**이 필요하다.

예시:
- 솔벤시트 = **시트** (원단) + **코팅지** (부자재)
- 인쇄 완료 시 시트 160cm + 코팅지 160cm **둘 다** 차감해야 함

## 현재 구조

```
print_event (인쇄 완료)
  → product_item_id (출력품목)
    → product_materials (1:N)
      → width_mm 매칭 → 1개 선택 → 재고 차감
```

**한계**: product_materials에 시트+코팅지가 모두 있어도, width_mm으로 1개만 선택.

## 변경 설계

### 핵심 변경: item_group별 1개씩 차감

```
print_event (인쇄 완료)
  → product_item_id (출력품목)
    → product_materials (1:N)
      → item_group별 그룹핑
        → 각 그룹 내 width_mm 매칭 → 그룹별 1개 선택 → 각각 재고 차감
```

### SQL 변경

**현재** (단일 차감):
```sql
SELECT pm.material_item_id, i.width_mm, i.item_name
FROM product_materials pm
JOIN items i ON pm.material_item_id = i.id
WHERE pm.product_item_id = ? AND i.width_mm IS NOT NULL
ORDER BY i.width_mm ASC
```

**변경** (그룹별 차감):
```sql
SELECT pm.material_item_id, i.width_mm, i.item_name, i.item_group
FROM product_materials pm
JOIN items i ON pm.material_item_id = i.id
WHERE pm.product_item_id = ? AND i.width_mm IS NOT NULL
ORDER BY i.item_group ASC, i.width_mm ASC
```

### 알고리즘 변경

```typescript
// 현재: 전체에서 1개 선택
for (const material of materialRows) {
  if (material.width_mm >= outputWidthMm) { selectedMaterial = material; break; }
}

// 변경: 그룹별로 1개씩 선택
const groupMap: Record<string, typeof materialRows> = {};
for (const m of materialRows) {
  const g = m.item_group || '__default__';
  if (!groupMap[g]) groupMap[g] = [];
  groupMap[g].push(m);
}

const selectedMaterials: typeof materialRows = [];
for (const [group, materials] of Object.entries(groupMap)) {
  for (const material of materials) {
    if (material.width_mm >= outputWidthMm) {
      selectedMaterials.push(material);
      break;
    }
  }
}

// 각 selectedMaterial에 대해 재고 차감
for (const material of selectedMaterials) {
  await deductSingle(db, material, deductedLengthYd, ...);
}
```

### 반환값 변경

```typescript
// 현재
{ success: true, deducted: true, materialName: '시트 160cm', deductedLength: 2.5 }

// 변경
{ 
  success: true, 
  deducted: true, 
  deductions: [
    { materialName: '시트 160cm', deductedLength: 2.5, group: '시트' },
    { materialName: '코팅지 160cm', deductedLength: 2.5, group: '코팅지' }
  ]
}
```

### inventory_auto_deductions 테이블

현재 UNIQUE 제약: `print_event_id` (1개만 허용)

**변경**: UNIQUE를 `(print_event_id, material_item_id)`로 변경

```sql
-- 마이그레이션
DROP INDEX IF EXISTS idx_iad_print_event_id;
CREATE UNIQUE INDEX idx_iad_event_material 
  ON inventory_auto_deductions(print_event_id, material_item_id);
```

이로써 1개 print_event에 **여러 차감 이력** 기록 가능.

### 중복 차감 방지

현재: `SELECT id FROM inventory_auto_deductions WHERE print_event_id = ?`
변경: 동일 → 이미 차감 이력이 있으면 전체 스킵 (부분 차감 방지)

또는 더 세밀하게: 그룹별로 이미 차감됐는지 확인:
```sql
SELECT material_item_id FROM inventory_auto_deductions WHERE print_event_id = ?
```
이미 차감된 material은 건너뛰기.

**추천**: 전체 스킵 방식 유지 (단순, 안전). 부분 실패 시 전체 롤백.

### 하위 호환

- item_group이 NULL인 원자재 → `'__default__'` 그룹으로 처리
- product_materials에 1개 그룹만 있으면 → 기존과 동일 동작
- 기존 차감 이력은 영향 없음 (UNIQUE 인덱스 변경만)

## 영향 범위

| 파일 | 변경 내용 |
|------|----------|
| `src/utils/autoDeductInventory.ts` | 그룹별 매칭 + 다중 차감 루프 |
| `migrations/xxxx_multi_deduction.sql` | UNIQUE 인덱스 변경 |
| `src/scripts/costAnalysis.js` | 차감 이력 표시 (다중 행) |

## 차감 흐름 다이어그램

```
인쇄 완료 (print_event OK)
  │
  ├─ product_materials 조회 (item_group 포함)
  │
  ├─ item_group별 그룹핑
  │   ├── 시트 그룹: [30mm, 40mm, ... 3200mm]
  │   └── 코팅지 그룹: [30mm, 40mm, ... 3200mm]
  │
  ├─ 각 그룹에서 width_mm >= output_width 매칭
  │   ├── 시트: 160cm 선택
  │   └── 코팅지: 160cm 선택
  │
  ├─ 각각 재고 차감
  │   ├── inventory(시트 160cm).quantity -= 2.5yd
  │   └── inventory(코팅지 160cm).quantity -= 2.5yd
  │
  └─ inventory_auto_deductions 2건 INSERT
```

## 구현 예상

- 변경 규모: ~50줄 (autoDeductInventory.ts) + 마이그레이션 1건
- 리스크: 낮음 (기존 단일 그룹 = 변경 후 1개 그룹 = 동일 결과)
- 테스트: 기존 단일 차감 + 다중 차감 케이스 검증
