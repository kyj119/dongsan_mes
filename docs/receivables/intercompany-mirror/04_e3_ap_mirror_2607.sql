-- 청주(entity 3) 2026-07 관계사 미러 매입채무 (2026-08-08)
--
-- 용준님 확인: 「청주의 매입은 선명→청주 형태로만 이루어지고, 운산직물에서만 직접 몇 번
--   계산서가 나간다」. 즉 청주 매입의 정본은 **선명이 청주에 판 금액**이고, MES 는 그걸 미러로 세운다.
--
-- 실측이 이를 확증한다 — 미러 금액이 선명→청주 판매액과 **원단위로 같다**:
--     2026-05  선명→청주 16,802,000 = ICM-AP-E3-2605
--     2026-06  선명→청주 24,023,060 = ICM-AP-E3-2606
--     2026-07  선명→청주  9,678,890 = **누락** ← 이 파일이 메운다
--
-- ★ 담당자로는 이걸 못 만든다. 구매현황(양식 1)을 받아 보니 매입 담당은
--   공란 150라인(73%)·김용준 79·강지영 1 이고 **최인호는 0건**이다.
--   담당자는 판매의 entity 를 가르지만 매입은 못 가른다 — 매입 전표에 담당이 안 붙는다.
--
-- 멱등: 재적용 전 99_rollback 또는 아래 DELETE 선실행.
DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E3-2607');
DELETE FROM purchase_orders WHERE po_number='ICM-AP-E3-2607';

INSERT INTO purchase_orders (po_number,supplier_id,status,order_date,total_amount,vat_amount,final_amount,notes,created_by,entity_id)
VALUES ('ICM-AP-E3-2607',1271,'RECEIVED','2026-07-31',9678890,967889,10646779,'관계사 미러 매입채무(선명 2026-07, 청주) [ICM]',5,3);
INSERT INTO purchase_order_items (po_id,item_id,item_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order)
VALUES ((SELECT id FROM purchase_orders WHERE po_number='ICM-AP-E3-2607'),NULL,'관계사 매입채무(선명 2026-07, 청주)',1,1,'EA',9678890,9678890,1,0);
