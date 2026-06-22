-- 0339: 자동차감 후보에서 미사용 특수폭 제외 — AQ-BANNER product_materials에서 45/105/127/137cm unlink
--
-- 원단은 모든 폭을 판매하나, 출력(생산)에는 표준폭 + 95cm만 사용. 45/105/127/137폭은 미사용.
-- autoDeductInventory는 product_materials(제품 연결 원단)에서만 후보를 뽑아 'output_width 이상 최소폭'을
-- 선택하므로, 미사용 폭을 unlink하면 차감이 실제 사용 폭으로만 매칭됨. 품목은 판매용으로 그대로 유지.
-- (95cm는 사용하므로 유지)
DELETE FROM product_materials
WHERE product_item_id = (SELECT id FROM items WHERE item_code = 'AQ-BANNER')
  AND material_item_id IN (
    SELECT id FROM items WHERE item_code IN ('AQ2-045', 'AQ2-105', 'AQ2-127', 'AQ2-137')
  );
