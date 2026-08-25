-- 한국엡손 월말 뭉침 전표 4건 → 발주서현황 실제 내역으로 분해 (2026-08-25)
-- 원천 = Z:\Designs\123\엡손1~7월.xlsx 「발주서현황」 (한국엡손(주), 2026/01/01~08/25)
--
-- ★분해해도 전표 총액은 바뀌지 않는다 — 세금계산서와 맞아야 하는 값이다.
--   PO 565 1,492,000 / PO 566 2,456,600 / PO 568 14,500,000 / PO 677 4,000,100 (생성기가 assert 로 검산)
-- ★04월만 발주서 합계(2,385,400)가 전표(2,456,600)보다 71,200 적다 → 「[미상] 차액」 라인으로 남긴다.
--   금액을 맞추려고 다른 라인을 늘리지 않는다.
-- ★9140 잉크 단가가 3~4월 97,000 → 7월 101,900 으로 인상(화이트 328,000 → 344,400).
--   memory design-ink-inventory 의 「엡손 101,900·화이트 344,400」과 일치한다.
-- ★SC-S8140 은 **6색기**이고 1,450만은 본체 14,105,000 + Lift Kit 395,000 의 합이었다.
-- ⚠️PO 116(SMP-0116, 04-24, @73,000, 공급처=(주)동산기획)은 **선명 이관 매입**이라 별개 전표다. 중복 아님.
--
-- 롤백: 백업 `_bak_0825_epson_split` 로 원본 4줄 복원 후 신규 줄 삭제
--   DELETE FROM purchase_order_items WHERE notes='엡손 발주서현황 분해 (2026-08-25)';
--   INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
--     SELECT po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status FROM _bak_0825_epson_split;

CREATE TABLE IF NOT EXISTS _bak_0825_epson_split AS
SELECT * FROM purchase_order_items WHERE id IN (3438, 3439, 3440, 3441);

-- Lift Kit 품목 신설 (6월 장비 발주의 두 번째 줄)
-- ⚠️`items.category_id` 는 NOT NULL 이다(빠뜨리면 전체 롤백). 상품=4 · 원자재=5. 기존 GDS-EQ 계열과 동일하게 4.
INSERT INTO items (item_code, item_name, category, category_id, unit, is_active, is_sales_item, is_purchase_item, search_keywords)
SELECT 'GDS-EQ-EPSLIFT', '엡손 9140/8140 리프트 키트', '상품', 4, 'EA', 1, 0, 1, '엡손 리프트 키트 Lift Kit 9140 8140 장비 부속'
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='GDS-EQ-EPSLIFT');

-- ── PO 565 (전표 50115 · 2026/03/05) · 1,492,000원 · 11줄 ──
DELETE FROM purchase_order_items WHERE id = 3438;
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,466,'엡손 잉크(9140)-C [1600mm]',(SELECT category FROM items WHERE id=466),2,2,COALESCE((SELECT unit FROM items WHERE id=466),'EA'),97000,194000,1,1,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,471,'엡손 잉크(9140)-LM [1600mm]',(SELECT category FROM items WHERE id=471),2,2,COALESCE((SELECT unit FROM items WHERE id=471),'EA'),97000,194000,1,2,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,467,'엡손 잉크(9140)-M [1600mm]',(SELECT category FROM items WHERE id=467),1,1,COALESCE((SELECT unit FROM items WHERE id=467),'EA'),97000,97000,1,3,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,473,'엡손 잉크(9140)-LK [1600mm]',(SELECT category FROM items WHERE id=473),1,1,COALESCE((SELECT unit FROM items WHERE id=473),'EA'),97000,97000,1,4,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,468,'엡손 잉크(9140)-Y [1600mm]',(SELECT category FROM items WHERE id=468),1,1,COALESCE((SELECT unit FROM items WHERE id=468),'EA'),97000,97000,1,5,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,472,'엡손 잉크(9140)-Or [1600mm]',(SELECT category FROM items WHERE id=472),1,1,COALESCE((SELECT unit FROM items WHERE id=472),'EA'),97000,97000,1,6,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,469,'엡손 잉크(9140)-K [1600mm]',(SELECT category FROM items WHERE id=469),1,1,COALESCE((SELECT unit FROM items WHERE id=469),'EA'),97000,97000,1,7,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,475,'엡손 잉크(9140)-Gr [1600mm]',(SELECT category FROM items WHERE id=475),1,1,COALESCE((SELECT unit FROM items WHERE id=475),'EA'),97000,97000,1,8,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,474,'엡손 잉크(9140)-Rd [1600mm]',(SELECT category FROM items WHERE id=474),1,1,COALESCE((SELECT unit FROM items WHERE id=474),'EA'),97000,97000,1,9,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,470,'엡손 잉크(9140)-LC [1600mm]',(SELECT category FROM items WHERE id=470),1,1,COALESCE((SELECT unit FROM items WHERE id=470),'EA'),97000,97000,1,10,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (565,476,'엡손 잉크(9140)-W [1600mm]',(SELECT category FROM items WHERE id=476),1,1,COALESCE((SELECT unit FROM items WHERE id=476),'EA'),328000,328000,1,11,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');

-- ── PO 566 (전표 50095 · 2026/04/15·04/23) · 2,456,600원 · 16줄 ──
DELETE FROM purchase_order_items WHERE id = 3439;
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,473,'엡손 잉크(9140)-LK [1600mm]',(SELECT category FROM items WHERE id=473),3,3,COALESCE((SELECT unit FROM items WHERE id=473),'EA'),97000,291000,1,1,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,471,'엡손 잉크(9140)-LM [1600mm]',(SELECT category FROM items WHERE id=471),3,3,COALESCE((SELECT unit FROM items WHERE id=471),'EA'),97000,291000,1,2,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,467,'엡손 잉크(9140)-M [1600mm]',(SELECT category FROM items WHERE id=467),2,2,COALESCE((SELECT unit FROM items WHERE id=467),'EA'),97000,194000,1,3,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,468,'엡손 잉크(9140)-Y [1600mm]',(SELECT category FROM items WHERE id=468),4,4,COALESCE((SELECT unit FROM items WHERE id=468),'EA'),97000,388000,1,4,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,476,'엡손 잉크(9140)-W [1600mm]',(SELECT category FROM items WHERE id=476),1,1,COALESCE((SELECT unit FROM items WHERE id=476),'EA'),328000,328000,1,5,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,469,'엡손 잉크(9140)-K [1600mm]',(SELECT category FROM items WHERE id=469),1,1,COALESCE((SELECT unit FROM items WHERE id=469),'EA'),97000,97000,1,6,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,475,'엡손 잉크(9140)-Gr [1600mm]',(SELECT category FROM items WHERE id=475),1,1,COALESCE((SELECT unit FROM items WHERE id=475),'EA'),97000,97000,1,7,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,470,'엡손 잉크(9140)-LC [1600mm]',(SELECT category FROM items WHERE id=470),2,2,COALESCE((SELECT unit FROM items WHERE id=470),'EA'),97000,194000,1,8,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,474,'엡손 잉크(9140)-Rd [1600mm]',(SELECT category FROM items WHERE id=474),1,1,COALESCE((SELECT unit FROM items WHERE id=474),'EA'),97000,97000,1,9,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,1000,'엡손 잉크(80610)-C [700mm]',(SELECT category FROM items WHERE id=1000),1,1,COALESCE((SELECT unit FROM items WHERE id=1000),'EA'),71200,71200,1,10,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,1001,'엡손 잉크(80610)-M [700mm]',(SELECT category FROM items WHERE id=1001),1,1,COALESCE((SELECT unit FROM items WHERE id=1001),'EA'),71200,71200,1,11,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,1002,'엡손 잉크(80610)-Y [700mm]',(SELECT category FROM items WHERE id=1002),1,1,COALESCE((SELECT unit FROM items WHERE id=1002),'EA'),71200,71200,1,12,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,1003,'엡손 잉크(80610)-K [700mm]',(SELECT category FROM items WHERE id=1003),1,1,COALESCE((SELECT unit FROM items WHERE id=1003),'EA'),71200,71200,1,13,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,1004,'엡손 잉크(80610)-LC [700mm]',(SELECT category FROM items WHERE id=1004),1,1,COALESCE((SELECT unit FROM items WHERE id=1004),'EA'),71200,71200,1,14,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,1005,'엡손 잉크(80610)-LM [700mm]',(SELECT category FROM items WHERE id=1005),1,1,COALESCE((SELECT unit FROM items WHERE id=1005),'EA'),52400,52400,1,15,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (566,NULL,'[미상] 계산서-발주서 차액 (04월)','원자재',1,1,'EA',71200,71200,1,16,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');

-- ── PO 568 (전표 50075 · 2026/06/16) · 14,500,000원 · 2줄 ──
DELETE FROM purchase_order_items WHERE id = 3440;
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (568,1673,'엡손 SureColor SC-S8140 본체 [6색]',(SELECT category FROM items WHERE id=1673),1,1,COALESCE((SELECT unit FROM items WHERE id=1673),'EA'),14105000,14105000,1,1,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (568,(SELECT id FROM items WHERE item_code='GDS-EQ-EPSLIFT'),'엡손 9140/8140 Lift Kit','상품',1,1,'EA',395000,395000,1,2,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');

-- ── PO 677 (전표 50071 · 2026/07/08·07/21·07/22) · 4,000,100원 · 12줄 ──
DELETE FROM purchase_order_items WHERE id = 3441;
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,1674,'엡손 유지보수 키트(9140)',(SELECT category FROM items WHERE id=1674),2,2,COALESCE((SELECT unit FROM items WHERE id=1674),'EA'),91400,182800,1,1,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,466,'엡손 잉크(9140)-C [1600mm]',(SELECT category FROM items WHERE id=466),5,5,COALESCE((SELECT unit FROM items WHERE id=466),'EA'),101900,509500,1,2,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,467,'엡손 잉크(9140)-M [1600mm]',(SELECT category FROM items WHERE id=467),5,5,COALESCE((SELECT unit FROM items WHERE id=467),'EA'),101900,509500,1,3,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,473,'엡손 잉크(9140)-LK [1600mm]',(SELECT category FROM items WHERE id=473),2,2,COALESCE((SELECT unit FROM items WHERE id=473),'EA'),101900,203800,1,4,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,476,'엡손 잉크(9140)-W [1600mm]',(SELECT category FROM items WHERE id=476),1,1,COALESCE((SELECT unit FROM items WHERE id=476),'EA'),344400,344400,1,5,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,468,'엡손 잉크(9140)-Y [1600mm]',(SELECT category FROM items WHERE id=468),5,5,COALESCE((SELECT unit FROM items WHERE id=468),'EA'),101900,509500,1,6,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,472,'엡손 잉크(9140)-Or [1600mm]',(SELECT category FROM items WHERE id=472),2,2,COALESCE((SELECT unit FROM items WHERE id=472),'EA'),101900,203800,1,7,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,469,'엡손 잉크(9140)-K [1600mm]',(SELECT category FROM items WHERE id=469),2,2,COALESCE((SELECT unit FROM items WHERE id=469),'EA'),101900,203800,1,8,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,474,'엡손 잉크(9140)-Rd [1600mm]',(SELECT category FROM items WHERE id=474),2,2,COALESCE((SELECT unit FROM items WHERE id=474),'EA'),101900,203800,1,9,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,1006,'엡손 잉크(80610)-Cleaning [700mm]',(SELECT category FROM items WHERE id=1006),2,2,COALESCE((SELECT unit FROM items WHERE id=1006),'EA'),55100,110200,1,10,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,470,'엡손 잉크(9140)-LC [1600mm]',(SELECT category FROM items WHERE id=470),5,5,COALESCE((SELECT unit FROM items WHERE id=470),'EA'),101900,509500,1,11,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
INSERT INTO purchase_order_items (po_id,item_id,item_name,category_name,quantity,received_quantity,unit,unit_price,amount,vat_included,sort_order,notes,line_status,price_status)
VALUES (677,471,'엡손 잉크(9140)-LM [1600mm]',(SELECT category FROM items WHERE id=471),5,5,COALESCE((SELECT unit FROM items WHERE id=471),'EA'),101900,509500,1,12,'엡손 발주서현황 분해 (2026-08-25)','RECEIVED','CONFIRMED');
