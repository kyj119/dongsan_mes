# 재고 통합 재설계 — 창고별 분리 × 다단위(multi-UOM)

작성: 2026-06-27 / 상태: 설계(합의·핸드오프 대기) / **두 spec 통합·대체**: [창고별 분리](../../archive/superpowers/specs/2026-06-27-warehouse-stock-separation.md) + [다단위](../../archive/superpowers/specs/2026-06-27-multi-uom-inventory.md) (원본은 아카이브)

## 왜 통합인가
두 작업이 같은 inventory 테이블·쓰기경로(autoDeductInventory·po-receive·inventory.ts·receipt_items)·표시·발주를 동시에 건드림 → 분리 진행 시 충돌. **개념은 직교**: 다단위=*어떻게 측정*(통/롤→L/cm), 창고=*어디에 있나*(zone). 한 모델로 합치면 일관.

## 통합 모델
**재고 행 = (item_id, entity_id, storage_zone_id) UNIQUE 다중행.** 각 행:
- `quantity`: 품목 `base_unit` 단위. CONTINUOUS=cm/yd, PACK=미개봉 포장 개수.
- `safe_stock`/`reorder_point`/`auto_pr_enabled`: **행(창고)별** → 창고별 독립 발주.
- 품목 속성(행 아님): `items.unit`(관리단위 통/롤), `items.base_unit`(L/cm/yd), `items.pack_size`(1통=20L), `items.stock_mode`(PACK|CONTINUOUS).
- NULL zone 방지: **법인별 "미지정 창고" 센티넬**(storage_zones.is_default 활용) — 모든 행이 실 zone 보유.

직교 2축: **zone(위치) × uom(측정)**. 한 행 = "품목 I, 법인 E, 창고 Z에 base_unit X."

## 확정 결정 (양 spec + 사용자)
- 창고 단위 = storage_zone(배치도 facility_zone 매핑, 영역 편집 UI 신설).
- 입고 창고 = **품목 기본창고(items.storage_zone_id) 고정**. 창고 간 분배 = **이동(transfer)** 기능.
- 소모 출처 = card.equipment→zone→창고 자동(폴백 기본창고→미지정).
- 원가 = 전역 이동평균단가 × 창고별 소모량 집계.
- 다단위: 미개봉만 재고·개봉=전부소모(PACK), 시트류 cm 정밀(CONTINUOUS). **현수막원단(yd)·판재(장·BOARD) 현행 동작 불변(회귀 0).**

## 스키마 (통합 마이그)
- (기존 진행분 보존) `items` += base_unit·pack_size·stock_mode (다단위 0395), 잉크 통 품목 (0394).
- (신규 0396) `inventory` UNIQUE `idx_inventory_item_entity` DROP → `(item_id, entity_id, storage_zone_id)`. 법인별 미지정창고 INSERT + 기존 inventory NULL zone → 미지정 백필.
- (신규 0396) `inventory_transactions` += storage_zone_id, `inventory_count_items` += storage_zone_id.
- (다단위) `inventory_auto_deductions` += deducted_base, `inventory_receipt_items` += unit.

## Phase (통합, 의존순)
- **UP1. 모델 foundation** ✅ (커밋 `8f156f00`, 2026-06-27, 검증완료·미배포) — 마이그 **0396**(inventory UNIQUE→`(item,entity,IFNULL(zone,0))` + transactions/count_items.storage_zone_id, NULL=미배정). `utils/inventoryZone`(getItemDefaultZone). 전 쓰기경로 zone 키잉(입고 po-receive·receipts·settings·adjust·cancel / 소모 autoDeduct×2·stockShip·scan = **UP2 TODO 주석** / 환원 returns / 실사 inventoryCount per-zone). 읽기 GET/ SUM+GROUP(중복0)·GET/:id `zones[]`·dashboard/zones 실제창고. 신규 **POST /transfer**(창고 간 이동). **multi-UOM(0395) 독립**(base_unit 미참조→0396만 독립배포 가능). 검증: typecheck+build·smoke101/101·로컬 E2E(입고/이동/집계/부족/실사 zone 승인) 전부 PASS. ⚠️입고 zone키잉/표시환산(단위)·실사 표시환산은 multi-UOM 합류 시(UP3) 보완.
  - **남은 UP1 보완(소)**: 입고/조정 폼·재고현황 프론트의 창고별 표시(현 backend는 zones[] 제공, 프론트 미반영). multi-UOM 표시환산과 함께 UP3에서.
- **UP2. 공간인식 소모** ✅ (커밋 `3ccd44ff`, 2026-06-27, 검증완료·미배포) — **인쇄 1경로만**(사용자 결정). autoDeductInventory에서 print_event/card.equipment_id→equipment.zone_id(facility)→storage_zone(entity정합·is_default우선) 차감. `resolveEquipmentZone`/`resolveDeductionZone`(inventoryZone.ts). 폴백: 장비zone→품목 기본창고→NULL. **수량·자재선택 불변**(현수막 yd·판재 장 차감결과 동일, 출처 창고만 변경). PP(라미≠프린터)·stockShip(창고피킹)·scan(위치 미캡처)은 장비신호 부재로 품목 기본창고 유지. 검증: typecheck+build·smoke101/101·로컬 E2E 4케이스 PASS.
  - **분리·이연**: multi-UOM cm 정밀(base_unit cm 차감)은 UP2에서 제외(0395 잉크전환과 함께 별도). 공간인식(zone)만 우선 완료.
- **UP3-B1. 재고 창고별 표시+이동 UI** ✅ (커밋 `8a8b7c09`, 2026-06-27, 검증완료·미배포) — `pages/inventory.ts`+`scripts/inventory.js`(프론트만). 재고현황 행 "창고별/이동" → zoneStockModal: 분해 read(`GET /:id` zones[]) + 창고 간 이동(`POST /transfer`, 미배정↔창고). 도착=`GET /storage-zones`. 입고/조정은 기본창고 고정 유지. 로컬 Playwright E2E PASS.
- **UP3-A. 배치도 영역 편집 UI** ✅ (커밋 `a1f47832`, 2026-06-28, 검증완료·미배포) — `pages/equipment.ts`+`scripts/equipment.js`(프론트만). 편집모드에서 구역 박스 드래그·SE 리사이즈·이름/색상 편집·삭제 + "구역 추가"(zoneEditModal). 좌표=장비 핀과 동일 canvas 상대 %. layoutZones z1<장비 z2 → 편집모드만 pointer-events:auto(무충돌). 이동/리사이즈=PUT `/zones/:id/bounds`. 로컬 Playwright E2E PASS.
- **UP3-B2. 재고 표시환산**(PACK 통/L·CONTINUOUS 롤) — 타 세션 0394/0395 미커밋 WIP 의존(items 라우트/폼 미사용·환산헬퍼 없음). 이연.
- **UP4. 창고별 발주**(MRP 창고별 임계치) + 다단위 발주(포장↔base).
- **UP5. 원가분석**(창고/공정/주문별 소모원가) + FIFO entity 버그 수정.

## 영향
- ~16파일(창고분리) + items/표시/발주(다단위) 교집합. 핵심 위험: autoDeductInventory.ts(양쪽), po-receive.ts, inventory.ts GET/, inventoryCount.ts.
- facility.ts(P2 정합 수정)는 다중행 그대로 동작.

## ⚠️ 핸드오프 전제 (구현 전 필수)
1. **다단위 세션 중단** + 그 WIP(마이그 0394/0395, items.ts) **커밋**으로 보존 → 이 세션이 그 위에서 통합 구현(0396~). 미커밋 상태로 동시진행 시 충돌·유실.
2. 양 source spec(warehouse/multi-uom)은 본 통합 spec으로 대체(상태 표기).
3. 매 Phase: build+typecheck+smoke + 로컬 E2E + worktree 격리 배포.
