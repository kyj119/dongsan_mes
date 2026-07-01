-- 0425_solvent_lightsheet_output.sql
-- 솔벤 조명시트 출력 제품 + SPT031M 출력 substrate화 (사용자: 조명시트 출력=솔벤만='솔벤조명시트')
-- SPT031M(원자재 dual)을 출력 자동차감 substrate로 전환: unit 롤→yd, deduction ROLL, width 137폭.
--   (roll 50m≈54.68yd, 매입 221,820/roll → per-yd 4,057. 단가는 후속 일괄정비 대상)
-- 솔벤 조명시트(제품): 솔벤·AREA·ROLL → SPT031M(137폭) 자동차감. SPC031G→UV투명시트 패턴 동일.

-- ① SPT031M 을 출력 substrate 로 (매입/판매 dual 유지)
UPDATE items
SET unit='yd', deduction_method='ROLL', width_mm=1370, base_price=4057, updated_at=datetime('now')
WHERE item_code='SPT031M';

-- ② 솔벤 조명시트 (출력 제품)
INSERT INTO items (item_code,item_name,item_type,category_id,category,sub_category,pricing_method,pricing_profile,unit,deduction_method,is_sales_item,is_purchase_item,production_required,group_sort,is_favorite,waste_factor,stock_mode,is_active,base_price,item_group,created_at,updated_at)
SELECT 'SV-LSHT','솔벤 조명시트','PRODUCT',3,'솔벤','시트','AREA','AREA','EA','ROLL',1,0,1,0,0,1,'CONTINUOUS',1,0,'솔벤 조명시트',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM items WHERE item_code='SV-LSHT');

-- ③ 연결: 솔벤 조명시트 → SPT031M (137폭 자동차감)
INSERT INTO product_materials (product_item_id, material_item_id, is_default, created_at)
SELECT p.id, m.id, 1, datetime('now')
FROM items p, items m
WHERE p.item_code='SV-LSHT' AND m.item_code='SPT031M'
  AND NOT EXISTS (SELECT 1 FROM product_materials pm WHERE pm.product_item_id=p.id AND pm.material_item_id=m.id);
