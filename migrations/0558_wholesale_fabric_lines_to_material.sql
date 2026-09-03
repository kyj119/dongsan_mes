-- 0558: 원단 도매 주문 E2-20260409-006 의 남은 2줄을 자재로 (수성 현수막 → 수성 현수막원단 2코팅)
--
-- 0557 로 잔여를 훑으니 이 2줄이 남았다(363만원 — 지금까지 옮긴 것 중 가장 큰 건).
--
-- 근거 = **주문 전체가 원단 도매**다. E2-20260409-006 은 12줄이고 거래처가 (주)동산기획(법인간),
--   전부 「폭만 있고 높이 없음 · 수량이 yd」다. 그리고 **나머지 10줄은 이미 자재에 붙어 있다** —
--   SVB-250 · SVB-320 · SVT-200/250/320 · ECB-T-070 · RM-I000x(잉크 4색).
--   `AQ-BANNER`(수성 현수막, PRODUCT) 에 남은 1624·1625 만 제품으로 잡혀 있었다.
--
-- 대상 선정:
--   1624  250폭 q=415 @3,900 → AQ2-250(수성 현수막원단 2코팅 250cm, 등록 4,120/yd) = **-5.3%**
--   1625  320폭 q=435 @4,640 → AQ2-320(320cm, 등록 4,840/yd)                      = **-4.1%**
--   ⚠️ 250cm·320cm 는 **2코팅에만 있다**(1코팅 21종은 30~180cm, 2코팅 23종에 200/250/320).
--      폭이 후보를 하나로 좁혀 준다.
--   ⚠️ 할인율이 같은 주문의 다른 자재 라인과 맞는다 — SVB-250 -6% · SVB-320 -5% · ECB-T-070 -5%.
--      이 주문의 도매가 대역이 -4~-6% 라는 뜻이고, 두 줄이 그 안에 있다.
--
-- ⚠️ 되돌리기 = UPDATE order_items SET item_id=(SELECT id FROM items WHERE item_code='AQ-BANNER')
--               WHERE id IN (1624, 1625);
UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'AQ2-250'), updated_at = datetime('now')
 WHERE id = 1624 AND item_id = (SELECT id FROM items WHERE item_code = 'AQ-BANNER');

UPDATE order_items
   SET item_id = (SELECT id FROM items WHERE item_code = 'AQ2-320'), updated_at = datetime('now')
 WHERE id = 1625 AND item_id = (SELECT id FROM items WHERE item_code = 'AQ-BANNER');

-- ⚠️ 같은 주문에서 **손대지 않은 것** — 잉크 4줄(1626~1629)이 각 200,000원인데 등록가는 12,000원
--    이다(+1,567%). 자재 분류는 이미 맞으므로 이관 대상이 아니고, 등록가가 소분 단위인지
--    라인이 통 단위인지는 확인이 필요하다. 여기서 추측으로 고치지 않는다.
