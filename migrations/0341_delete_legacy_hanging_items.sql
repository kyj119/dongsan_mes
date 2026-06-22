-- 0341: 재개편 전 legacy 현수막 품목 5건(P-0001~0005) 완전삭제
--
-- HANGING 분류(0340 비활성)에 묶인 비활성 legacy 제품(category 텍스트 null, is_active=0).
-- items를 참조하는 20개 inbound FK 테이블(order_items·quotation_items·inventory·bom_items·
-- product_materials·purchase_*·waste_records 등) 전수 점검 결과 참조 0건 → 안전 완전삭제.
-- 방어: code + category_id=8 + 비활성 동시 조건으로 의도 품목만 삭제.
DELETE FROM items
WHERE item_code IN ('P-0001', 'P-0002', 'P-0003', 'P-0004', 'P-0005')
  AND category_id = 8
  AND is_active = 0;
