# 창고별 재고 분리 (공간 기반 다중행 재고)

작성: 2026-06-27 / 상태: 설계(합의 대기) / 선행: [창고↔배치도 연계 P1~P3](2026-06-26-storage-facility-zone-integration.md)

## 목적 (사용자)
1. 같은 품목을 **창고별로 다른 수량**으로 분리 관리.
2. **창고별 재고 기반 발주**(창고별 임계치 독립).
3. **창고별 소모량 파악**.
4. **원가분석**(어느 공정/창고/주문이 얼마 소모 → 원가).
5. 창고 = **배치도의 위치 영역**처럼(공간 기반), 배치도 구조(영역/크기)도 직접 구성.

## 현행 (탐색 결과)
- `inventory UNIQUE(item_id, entity_id)` 단일행. storage_zone_id는 단일 속성(품목 기본창고에서 시드). prod inventory 0건·items.storage_zone_id 0건(클린 전환 적기).
- 공간 인프라 60% 기완비: facility_zones(배치도 영역, bounds %좌표, 전사공용, **편집 UI 없음**)·storage_zones(창고, entity별, facility_zone_id 매핑 0391, **bounds 없음**)·equipment(zone_id·entity_id·공정 equipment_processes 0389)·product_materials(BOM).
- **소모 출처 체인 존재하나 미배선**: `card.equipment_id → equipment.zone_id → facility_zone → storage_zones(0391) → 창고 재고`. autoDeductInventory는 현재 공간 무시(법인 풀에서 차감).
- 원가: items.avg_unit_cost(품목 단위)·inventory_fifo_layers(entity 미포함=기존 버그)·inventory_transactions(entity 有, zone 無).

## 핵심 설계 결정 (확정)
1. **창고 단위 = storage_zone**(법인격리). 배치도 위치 = facility_zone 매핑(0391 유지) + 영역 편집 UI 신설.
2. **재고 키 = (item_id, entity_id, storage_zone_id)** 다중행. NULL 방지 위해 **법인별 "미지정 창고" 센티넬** 도입(모든 재고 행이 실 zone 보유 → UNIQUE 정합, 미배정 재고도 거처 확보).
3. **safe_stock/reorder_point/auto_pr_enabled = 창고(행)별** → 창고별 독립 발주.
4. **소모 출처 = card.equipment→zone→창고 자동**. 폴백: 품목 기본창고(items.storage_zone_id) → 법인 미지정 창고. 해당 창고 재고 부족 시: 기본은 0 클램프+부족 로그(현행 유지), 교차창고 폴백은 선택.
5. **원가 = 전역 이동평균단가 × 창고별 소모량 집계**. avg_unit_cost는 품목 단위 유지, inventory_transactions에 storage_zone_id 추가해 창고/공정/주문별 소모원가 집계.
6. **창고 간 이동(transfer)** 신규 기능(한 행 차감 + 다른 행 가산 + 이동 로그).

## 잔여 결정 (사용자 확인 필요)
- (A) **입고 시 창고 지정 방식**: 가)수동입고/조정 폼에서 창고 선택 + PO 라인 기본창고 / 나)품목 기본창고 고정(다중화 의미 약화) / 다)혼합(PO 라인 기본 + 입고 시 변경). → 추천 **가/다**.
- (B) **소모 시 지정 창고 재고 부족**: 가)0 클램프+부족 알림(현행) / 나)같은 법인 다른 창고에서 자동 보충 차감. → 추천 **가**(P2), 나는 후속.
- (C) **배치도 영역 편집 범위**: 가)facility_zones만 CRUD(방 단위) / 나)storage_zones에 bounds 부여해 창고를 배치도에 직접 그림. → 추천 **가 먼저, 나 후속**.

## Phase (5 — 세션 분리 권장)
- **P1. 모델 전환 (foundation)** — 마이그: UNIQUE→(item,entity,zone) + 법인별 미지정창고 + inventory_transactions.storage_zone_id + inventory_count_items.storage_zone_id. 입고 경로 창고지정(po-receive·receipts·adjustment·settings). 읽기/집계 SUM+GROUP(재고현황 GET / 페이지네이션·COUNT 재작성)·창고별 분해 뷰. 실사(P3) 재작업: count_items 창고별·승인 UPDATE에 zone 조건. 데이터 이관(prod 0건=무부담). **위험 TOP3: inventoryCount.ts·inventory.ts GET /·po-receive.ts.**
- **P2. 공간 인식 소모** — autoDeductInventory·autoDeductPostProcessingMaterials·stockShip·scan: card.equipment→zone→창고 도출해 그 행에서 차감. 부족 처리(결정 B). 창고별 소모 집계(transactions zone 태깅).
- **P3. 배치도 영역 편집 UI** — facility_zones CRUD + 그리기/크기/이름/색(현재 시드 고정). storage_zone↔facility_zone 배정 UI 확장. (결정 C에 따라 storage_zone bounds).
- **P4. 창고별 발주** — weeklyPurchase/MRP: 창고별 임계치→창고별 부족→PR. 입고 주소=창고.
- **P5. 원가분석** — 소모기반 원가 리포트(창고/공정/주문별), 대시보드. FIFO entity 버그 동반 수정.
- 창고 간 이동(transfer)= P1 말미 또는 P2.

## 영향 (탐색)
- 변경 ~16파일. 쓰기 11(po-receive·inventory×4·inventoryCount·returns·scan·autoDeduct×2·stockShip)·읽기 3(facility·weeklyPurchase·inventoryValuation)·신규 마이그.
- facility.ts layout-data·zones/:id/inventory는 이미 storage_zone 조건이라 다중행에 **그대로 동작**(P2 정합 수정 덕분).

## 비고
- facility_zones 전사공용(선명은 별도 layout 필요할 수 있음) — 다법인 배치도는 P3에서 검토.
- 매 Phase: build+typecheck+smoke + 로컬 E2E + worktree 격리 배포(동시 세션 churn). 각 Phase 독립 배포 가능.
