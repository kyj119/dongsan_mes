# 창고 구역 ↔ 공장 배치도 연계 (배치도 기반 재고 실사·현황)

작성: 2026-06-26 / 상태: P1 구현 완료, P2~P4 대기

## 배경
- 위치 체계가 분산: `inventory.location`(텍스트, 사장)·`storage_zones`(발주·보관 창고, 좌표X)·`facility_zones`(배치도, bounds 좌표)·`inventory_locations`(배치도 보관위치).
- 재고는 `storage_zones`에 귀속되나 좌표가 없고, 배치도는 `facility_zones`이라 **재고 → 배치도 좌표 경로가 단절**.
- 기존 인프라: 재고 실사(`inventory_counts`, FULL/PERIODIC), 창고별 대시보드(`/inventory-dashboard`, storage_zones 기준), 배치도(`/equipment`, `facility.ts`).

## 목적 (사용자 확인)
- **재고 실사 + 재고 현황 파악**을 공장 배치도(공간) 위에서. 발주 자동화·위치 안내는 부차적.
- 현재 `storage_zones`·`inventory_locations` 거의 미사용 → 깔끔하게 새로 세우는 시점.

## 핵심 설계 결정
1. **구역 체계 = 매핑(둘 유지+연결)**. 일원화가 아니라 `storage_zones → facility_zones` N:1 FK. 발주 구역(논리·담당자)과 배치도 영역(물리)을 별개 유지하되 연결. (한 물리 영역에 여러 발주 창고가 들어가는 현실 반영)
2. **재고 집계·실사 기본 단위 = 발주 창고(storage_zone)**. 담당자(manager_id) 기준 책임. 배치도에선 영역 → 창고 드릴다운.
3. 경로 완성: `inventory.storage_zone_id → storage_zones.facility_zone_id → facility_zones.bounds(좌표)`.

## Phase
- **P1. 매핑 인프라** ✅ (2026-06-26)
  - 마이그 `0391`: `storage_zones.facility_zone_id` FK(nullable, ON DELETE SET NULL) + 인덱스.
  - `routes/storageZones.ts`: GET(facility_zone_name JOIN)·POST·PUT에 `facility_zone_id` 처리.
  - `scripts/storageZones.js`: `/api/facility/zones` 로드, 모달 배치도영역 드롭다운, 목록 구역명에 영역 병기.
  - 모달 HTML 2곳(`pages/storageZones.ts`, `pages/settings.ts` 창고구역 탭)에 `zoneModalFacilityZone` select.
  - 빌드·타입체크 통과, 로컬 0391 적용.
- **P2. 배치도 재고 오버레이** ✅ (2026-06-26)
  - `facility.ts /layout-data`: zones에 `inv_item_count`·`inv_shortage_count` 집계 병합(facility_zone → storage_zones → inventory, 부족=안전재고 설정+현재고≤안전재고).
  - 신규 `GET /api/facility/zones/:id/inventory`: 영역의 storage_zone별 품목 재고 상세.
  - `equipment.js renderZones`: 영역 박스에 재고 뱃지(품목수·부족수, 적/녹색). `pointer-events:auto`로 클릭 가능(layoutZones가 none). `showZoneInventory()` 모달로 창고별 품목 재고 표시.
  - `equipment.ts`: `zoneInvModal` 추가. 빌드·타입체크 통과.
- **P3. 구역 기반 재고 실사** (대기)
  - 배치도 영역 → "이 구역 실사" 진입. `inventory_counts`에 storage_zone 필터 추가. 첫 실사가 미배정 품목↔구역 배정 겸함.
- **P4. (선택) 정리** (대기)
  - 창고구역 진입점 일원화(설정 탭 vs 독립 페이지), `inventory_locations` 처리.

## 미해결/주의
- `facility_zones`는 전사 공용(entity_id 없음), `storage_zones`/`inventory`는 법인별. 집계 시 entity 기준 명확히.
- prod 마이그 적용은 `db:migrate:prod` 추적 불일치 가능 → `execute --file` 직접 적용 검토.
- 창고구역 관리 진입점 2개(설정 탭 + 독립 페이지)가 같은 스크립트 공유 → P4에서 정리.
