# 자재 다중단위(multi-UOM) 재고 관리 — 설계 spec

> 2026-06-27 · 포장단위(롤/통/박스) ↔ 재고단위 ↔ 차감단위(cm/yd/EA) 분리를 전 자재에 일반화

## 배경 / 목적
입고는 **포장 단위**(롤·통·박스), 재고는 **관리 단위**, 소비는 **차감 단위**(cm·yd·EA)로 제각각인데
현재 시스템은 단일 `unit` 하나로만 처리 → 환산을 사람이 암산. 이를 구조화한다.

핵심 사용자 결정:
- **미개봉만 재고, 개봉=전부 소모 처리** (개봉통/개봉롤 잔량 미추적)
- **발주·표시는 포장↔낱개 전환**(multi-UOM)
- 잉크 통 용량·박스 입수는 **품목별로 다름** → 환산값은 품목 속성

## 단위 모델

**3단위**
| 개념 | 필드 | 예 |
|------|------|-----|
| 관리(재고)단위 | `items.unit` | 통 / 롤 / 박스 / EA / yd |
| 차감·저장 정밀단위 | `items.base_unit` | L / cm / EA / yd |
| 환산 | `items.pack_size` | 1통=20L, 1롤=5000cm, 1box=20EA |

**2유형** (`items.stock_mode`)
| 유형 | 재고 저장 | 입고 | 차감 | 표시 | 예 |
|------|----------|------|------|------|-----|
| **PACK** | 미개봉 포장 개수 | +N 포장 | 1포장씩(개봉=소모) | "3통=60L" | 잉크, 까치발 |
| **CONTINUOUS** | base(cm/yd) | 포장→base 환산 | cm·yd 정밀 | "2.96롤=148m" | 시트, 현수막원단 |

## 자재 매핑

| 자재 | unit | base_unit | pack_size | stock_mode | 차감 |
|------|------|-----------|-----------|-----------|------|
| 잉크 | 통 | L | 품목별(브랜드/장비) | PACK | 수동(개봉=1통) |
| SPM류 시트 | 롤 | cm | 롤길이(예 5000=50m) | CONTINUOUS | 자동 cm |
| 현수막 원단 | yd | yd | (1) | CONTINUOUS | 자동 yd (현행 불변) |
| 판재 | 장 | 장 | (1) | CONTINUOUS | 자동 BOARD (현행) |
| 까치발 | 박스 | EA | 규격별(300=20·800=15) | PACK | 수동 | *(구조 참고, 데이터 보류)* |

## 스키마 (마이그)

```sql
-- items
ALTER TABLE items ADD COLUMN base_unit TEXT;       -- NULL=unit과 동일
ALTER TABLE items ADD COLUMN pack_size REAL;       -- 1 unit = pack_size base_unit. NULL=1
ALTER TABLE items ADD COLUMN stock_mode TEXT DEFAULT 'CONTINUOUS';  -- PACK|CONTINUOUS
-- 차감 이력 (base 단위)
ALTER TABLE inventory_auto_deductions ADD COLUMN deducted_base REAL;  -- cm 등
-- 입고 단위 스냅샷
ALTER TABLE inventory_receipt_items ADD COLUMN unit TEXT;
```

## 자동차감 cm 정밀화 (`autoDeductInventory.ts`)
- 현재 ROLL: `output_height_mm / 914.4 × copy` = yd, `inventory.quantity -= yd`
- 변경: `base_unit` 읽어 환산 — `yd→/914.4`, `cm→/10`. `914.4` 등 상수 함수화.
- `inventory.quantity`는 품목 `base_unit` 단위로 누적(현수막=yd, 시트=cm).
- ⚠️ 현수막원단(yd)·판재(장) **현행 동작 불변**(회귀 0 필수). 시트류만 base_unit=cm로 신규.
- 폭매칭(width_mm)·중복방지(UNIQUE print_event_id) 유지.

## 입고 / 표시 / 발주
- **입고**: PACK=포장 개수 입력. CONTINUOUS=포장수 입력 → ×pack_size base 환산(또는 실량). `inventory_receipt_items.unit` 스냅샷.
- **표시** `/inventory`: `quantity` + 포장 환산 병기. PACK "3통(60L)" / CONTINUOUS "148cm 누적 → 2.96롤".
- **발주**: 포장↔base 전환 UI (multi-UOM). `purchase_order_items.unit` 활용.

## Phase 계획 (한 세션 순차, 각 검증)
| P | 내용 | 위험 |
|---|------|------|
| **P1** | 스키마 컬럼 + 잉크 통 전환(unit=통·base=L·PACK) + 단위 SSOT '통' 추가 + 품목폼 단위 입력 | 낮음(차감 무관) |
| **P2** | 자동차감 cm 정밀화(base_unit 분기·상수 함수화·deducted_base) | **높음(prod 생산차감)** |
| **P3** | 입고 단위 스냅샷 + 포장→base 환산 입력 | 중 |
| **P4** | 재고 표시 환산 병기(PACK 통수/L, CONTINUOUS 롤환산) | 낮음 |
| **P5** | 발주 multi-UOM (포장↔base) | 중 |

## 검증
- 잉크: 통 단위 재고·입고(개수). SPM: 롤 입고 → cm 차감 → 롤 환산 표시.
- **회귀**: 현수막원단 yd 자동차감·판재 BOARD 결과 **변화 없음** 확인(P2 핵심).
- build·smoke·prod 자동차감 회귀 테스트.
