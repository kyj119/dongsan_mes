-- 0551: 2026-08-08 등록 사고 정리 — 타입 오분류 · 매핑 오배선 · 판매플래그 · 과금방식
--
-- 배경 = 2026-09-01 품목 전수 점검. 「같은 이름이 PRODUCT 와 MATERIAL 양쪽에 있는」 11계열을
--   형제 대조로 훑은 결과, 자재가 PRODUCT 로 올라간 행이 나왔고 **전부 2026-08-08 11:15~12:25**
--   에 만들어졌다. 하나의 등록 사고다.
--   ⚠️ 기존 품목 중복 감사는 이걸 못 잡는다 — 두께가 다르면 「정상」으로 본다
--      (`audit:items:selftest` 가 `SKS-50T-W-36 ↔ SKS-10T-W-36 → 정상` 을 기대값으로 박아 뒀다).
--      중복이 아니라 **타입 오분류**라 감사망 밖이었다.
--
-- ⚠️ 1558 `RM-DOAN-100`(도안지 100폭)은 **제외한다**. 같은 사고 시각·같은 모양이지만
--    용준님이 「간판 나가면서 플로터에 도안 그려서 출고되는 형태」 = 판매 제품이라고 확인했고,
--    0550 에서 125폭(1685)을 제품으로 신설해 짝을 맞췄다. 모양만 보고 같이 내리면 틀린다.

-- ── B. 솔벤 텐트천 — 폭 축을 자재로 모은다 ───────────────────────────────────
-- 폭 4종이 두 타입으로 갈려 있었다: 160·200 은 MATERIAL(1482·1483), 250·320 은 PRODUCT(1576·1577).
-- 그래서 제품 목록에 「솔벤 텐트천」이 3줄로 떴다(PRODUCT 유일한 이름 충돌).
-- 실사용이 두 용도를 갈라 준다 — 392 는 인쇄물 29줄(440×400 등 · ㎡당 12,000~15,200원),
-- 1576·1577 은 원단 롤 판매 각 1줄(250×높이없음 · 수량 60 · 6,070/7,980원).
-- 정답 모델은 옆에 있다: 수성 텐트천 = PRODUCT 247 + MATERIAL 248~251(폭 90/127/152/180).
-- ⚠️ `order_items.item_id` 는 그대로라 붙어 있는 판매 2줄의 이력은 유지된다.
UPDATE items SET item_type = 'MATERIAL', updated_at = datetime('now')
 WHERE item_code IN ('SVT-250', 'SVT-320') AND item_type = 'PRODUCT';

-- 392 의 자재 매핑이 **수성 텐트천**(248~251)으로 걸려 있었다. 재단 패널에서 솔벤을 고르면
-- 수성 원단을 후보로 줬다는 뜻이다. 자기 원단(1482·1483)은 어느 제품에도 안 붙어 있었다.
-- ⚠️ 「계열이 다르면 오배선」이 아니다 — 374 UV 매쉬 → 솔벤 매쉬, 284 UV 현수막 → 솔벤 현수막은
--    373·283 과 **같은 롤을 공유**하는 정상 매핑이다(자재로쓰임=2 로 확인). 392 만 공유가 아니었다.
INSERT INTO product_materials (product_item_id, material_item_id, is_default, created_at)
SELECT p.id, m.id, 0, datetime('now')
  FROM items p, items m
 WHERE p.item_code = 'SV-TENT'
   AND m.item_code IN ('SVT-160', 'SVT-200', 'SVT-250', 'SVT-320')
   AND NOT EXISTS (SELECT 1 FROM product_materials x
                    WHERE x.product_item_id = p.id AND x.material_item_id = m.id);

DELETE FROM product_materials
 WHERE product_item_id = (SELECT id FROM items WHERE item_code = 'SV-TENT')
   AND material_item_id IN (SELECT id FROM items
                             WHERE item_code IN ('TENT-090','TENT-127','TENT-152','TENT-180'));

-- ── C. 자재인데 PRODUCT 로 올라간 나머지 6행 ─────────────────────────────────
-- 형제가 전부 MATERIAL 이고, 매입 이력은 있는데 주문 이력은 0 이다.
--   광확산PC  1557(5T)      ↔ 641(2T) · 642(3T) · 1441(1.8T)
--   스카시    1560(50T 백)  ↔ 635~640 (10T/20T/30T × 백·검)
--   알마이트  1561(3T 은)   ↔ 643(2T 은)
--   KIV 전선  1504~06(백색) ↔ 807~809(검정)   · 1504·1506 은 매입 1줄씩, 주문 0
-- `is_sales_item` 은 건드리지 않는다 — 자재도 파는 축이 따로 있다(수성 텐트천 원단이 그렇다).
UPDATE items SET item_type = 'MATERIAL', updated_at = datetime('now')
 WHERE item_code IN ('SGM-KIV-W15','SGM-KIV-W25','SGM-KIV-W40',
                     'PC-5T-M-48','SKS-50T-W-36','ALM-3T-S-48')
   AND item_type = 'PRODUCT';

-- ── D. 계열 안에서 갈린 판매플래그 ───────────────────────────────────────────
-- 같은 이름·같은 타입인데 일부 행만 `is_sales_item=0` 이라 자재 목록에서 **조용히 빠져** 있었다.
-- 목록은 이름 기준으로 중복을 제거하므로, 빠진 행이 그 이름의 유일한 행이면 폭 하나가 통째로 사라진다.
UPDATE items SET is_sales_item = 1, updated_at = datetime('now')
 WHERE item_code IN (
         'PC-1.8T-M-48',   -- 광확산PC 1.8T (형제 2T·3T 는 판매 ON)
         'SVT-160',        -- 솔벤 텐트천 160cm (형제 200cm 는 판매 ON)
         'SVB-300'         -- 솔벤 현수막 300cm (형제 12행 전부 판매 ON)
       )
   AND COALESCE(is_sales_item, 0) = 0;

-- 무광코팅지 180g-호홍 4행 중 2행 · 유광코팅지 SPP031G 5행 중 3행이 꺼져 있었다.
-- 코드가 아니라 이름으로 잡는다(폭별 코드가 제각각이다).
UPDATE items SET is_sales_item = 1, updated_at = datetime('now')
 WHERE item_name IN ('무광코팅지 180g-호홍', '유광코팅지 SPP031G')
   AND COALESCE(is_active, 1) = 1
   AND item_type = 'MATERIAL'
   AND COALESCE(is_sales_item, 0) = 0;

-- ── E. 과금방식 이상치 3행 ───────────────────────────────────────────────────
-- 판재는 색상 축으로 일관돼 있다 — 아크릴 투명 3종 전부 AREA · 아크릴 백색 3종 전부 FIXED ·
-- 포맥스 10종 · 폼보드 · 자작나무 5종 · 광확산PC 4종 전부 AREA. 여기서 혼자 벗어난 게 셋이다.
--   587 UV 아크릴 2T 검정  AREA  (3T·5T 검정은 FIXED)   주문 0줄
--   598 UV 스카시 20T 백색 AREA  (10T·30T·50T 백색 FIXED) 주문 3줄
--   601 UV 스카시 30T 검정 AREA  (10T·20T 검정은 FIXED)  주문 3줄
-- 형제 다수 쪽으로 맞춘다(3행 변경). 반대 방향 — 아크릴·스카시 12종을 전부 AREA 로 — 이 맞다면
-- 청구 방식 자체가 바뀌는 큰 변경이므로 여기서 하지 않는다. 되돌리기는 이 UPDATE 하나뿐이다.
-- ⚠️ 무엇이 달라지나: `orderLineAmount.ts:113` 이 AREA 일 때만 면적을 곱하고,
--    `prices.ts:88` 의 최근거래가 면적 환산(이관분 unit_price = 장당금액 → ㎡ 단가 복원)도
--    AREA 일 때만 돈다. 12종 전부 기준단가가 0 이라 현재 자동계산 자체는 시작되지 않는다.
UPDATE items SET pricing_method = 'FIXED', updated_at = datetime('now')
 WHERE item_code IN ('UV-ACR-2T-B', 'UV-SKS-20T-W', 'UV-SKS-30T-B')
   AND pricing_method = 'AREA';
