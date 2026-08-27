-- base_price 축 정정 (2026-08-27 단위 축 전수조사, 용준님 승인)
--
-- 무엇: 관리단위(롤·EA) 당 값이어야 할 items.base_price 에 재고단위(M) 당 값이 들어 있던 4건.
--       주문서 품목 선택기가 이 값을 그대로 프리필한다(shell.js data-price) — 거래처를 고르기 전이거나
--       /api/prices 에 이력이 없으면 그대로 남아 롤 하나가 1/pack 가격으로 견적된다.
--       (ULTRA-CAL-100 = 2,700원 vs 실제 판매 87,000원)
--
-- 새 값: **실제 최근 매입 단가**. 파생값(avg_unit_cost × pack)이 아니라 실거래 숫자를 쓴다 —
--        입고(po-receive)가 스스로 쓰는 값이고, 나머지 100품목이 따르는 축이다.
--
-- 제외: LGSHT-122 — 유일한 발주가 CANCELLED 이고 판매 이력·재고가 없어
--       base_price(18,400)와 avg_unit_cost(11,000/M) 중 어느 쪽이 틀렸는지 판정 불가. 손대지 않는다.
--
-- 백업: _bak_0827_base_price (prod 상주). 되돌리기 =
--   UPDATE items SET base_price = (SELECT base_price FROM _bak_0827_base_price b WHERE b.item_id = items.id)
--    WHERE id IN (SELECT item_id FROM _bak_0827_base_price);
--
-- 멱등: WHERE 에 옛 값을 걸어 재실행해도 두 번 적용되지 않는다(이력 INSERT 도 NOT EXISTS 가드).
--   ⚠️ wrangler --file 은 성공해도 「Not currently importing anything」 오류를 뱉는 전례가 있다.
--      재실행 전 반드시 결과를 조회할 것.

INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by, changed_at, entity_id)
SELECT 'ITEM', i.id, i.item_name, i.base_price, 221820, 'sweep-0827', datetime('now','+9 hours'), 1
  FROM items i WHERE i.id = 848 AND i.base_price = 4057
   AND NOT EXISTS (SELECT 1 FROM price_change_history h WHERE h.target_id = 848 AND h.changed_by = 'sweep-0827');
UPDATE items SET base_price = 221820, updated_at = CURRENT_TIMESTAMP WHERE id = 848 AND base_price = 4057;

INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by, changed_at, entity_id)
SELECT 'ITEM', i.id, i.item_name, i.base_price, 93240, 'sweep-0827', datetime('now','+9 hours'), 1
  FROM items i WHERE i.id = 1074 AND i.base_price = 3100
   AND NOT EXISTS (SELECT 1 FROM price_change_history h WHERE h.target_id = 1074 AND h.changed_by = 'sweep-0827');
UPDATE items SET base_price = 93240, updated_at = CURRENT_TIMESTAMP WHERE id = 1074 AND base_price = 3100;

INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by, changed_at, entity_id)
SELECT 'ITEM', i.id, i.item_name, i.base_price, 80500, 'sweep-0827', datetime('now','+9 hours'), 1
  FROM items i WHERE i.id = 1073 AND i.base_price = 2700
   AND NOT EXISTS (SELECT 1 FROM price_change_history h WHERE h.target_id = 1073 AND h.changed_by = 'sweep-0827');
UPDATE items SET base_price = 80500, updated_at = CURRENT_TIMESTAMP WHERE id = 1073 AND base_price = 2700;

INSERT INTO price_change_history (target_type, target_id, target_name, old_price, new_price, changed_by, changed_at, entity_id)
SELECT 'ITEM', i.id, i.item_name, i.base_price, 3850, 'sweep-0827', datetime('now','+9 hours'), 1
  FROM items i WHERE i.id = 984 AND i.base_price = 2300
   AND NOT EXISTS (SELECT 1 FROM price_change_history h WHERE h.target_id = 984 AND h.changed_by = 'sweep-0827');
UPDATE items SET base_price = 3850, updated_at = CURRENT_TIMESTAMP WHERE id = 984 AND base_price = 2300;
