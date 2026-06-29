-- 0394: 현장 잉크 재고관리 품목 등록 (74품목, 장비별 분리) — 2026-06-26
-- 결정 요약:
--   - item_type=MATERIAL, category=원자재, sub_category=잉크, unit=L
--   - deduction_method=NONE (자동차감 없음 — 수동 입출고 재고관리만)
--   - is_purchase_item=1. 코드=RM-I0001~0074 (기존 자동채번 규칙 routes/items.ts와 동일)
--   - 식별축 = 장비 × 브랜드 × 색 (같은 KM테크라도 1800/3200 별도). 식별은 품목명+item_group
--   - 법인: 품목은 공유. inventory = 동산(1) 72품목 + 선명(2) 6품목
--   - 수성 잉크테크 Lc/Lm(RM-I0005/0006) = 선명 매출품목(is_sales_item=1), 동산 미사용

-- ── 멱등: 기존 RM-I 잉크 제거 후 재삽입 ──
DELETE FROM inventory WHERE item_id IN (SELECT id FROM items WHERE item_code LIKE 'RM-I%');
DELETE FROM items WHERE item_code LIKE 'RM-I%';

-- ── 잘못 등록된 레거시 활성 잉크(PRODUCT) 비활성화 ──
UPDATE items SET is_active = 0, updated_at = CURRENT_TIMESTAMP
 WHERE item_code = 'MT-004' AND item_name LIKE '%잉크%';

-- ── 잉크 품목 74건 ──
INSERT INTO items
  (item_code, item_name, item_type, category, category_id, sub_category, unit, item_group,
   is_sales_item, is_purchase_item, production_required, is_active, deduction_method,
   base_price, sales_price, pricing_method)
VALUES
-- 수성 잉크테크 (CMYK=동산+선명 / Lc·Lm=선명 매출)
('RM-I0001','수성잉크 잉크테크 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 잉크테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0002','수성잉크 잉크테크 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 잉크테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0003','수성잉크 잉크테크 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 잉크테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0004','수성잉크 잉크테크 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 잉크테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0005','수성잉크 잉크테크 Lc','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 잉크테크',1,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0006','수성잉크 잉크테크 Lm','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 잉크테크',1,1,0,1,'NONE',0,0,'FIXED'),
-- 수성 코스테크
('RM-I0007','수성잉크 코스테크 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0008','수성잉크 코스테크 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0009','수성잉크 코스테크 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0010','수성잉크 코스테크 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
-- 수성 TPM
('RM-I0011','수성잉크 TPM C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 TPM',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0012','수성잉크 TPM M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 TPM',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0013','수성잉크 TPM Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 TPM',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0014','수성잉크 TPM K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','수성잉크 TPM',0,1,0,1,'NONE',0,0,'FIXED'),
-- 솔벤 1800폭 KM테크
('RM-I0015','솔벤잉크 1800폭 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0016','솔벤잉크 1800폭 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0017','솔벤잉크 1800폭 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0018','솔벤잉크 1800폭 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
-- 솔벤 3200폭 KM테크
('RM-I0019','솔벤잉크 3200폭 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0020','솔벤잉크 3200폭 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0021','솔벤잉크 3200폭 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0022','솔벤잉크 3200폭 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','솔벤잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
-- 엡손솔벤잉크 6색기 (엡손)
('RM-I0023','엡손솔벤잉크 6색기 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 6색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0024','엡손솔벤잉크 6색기 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 6색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0025','엡손솔벤잉크 6색기 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 6색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0026','엡손솔벤잉크 6색기 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 6색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0027','엡손솔벤잉크 6색기 Lc','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 6색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0028','엡손솔벤잉크 6색기 Lm','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 6색기',0,1,0,1,'NONE',0,0,'FIXED'),
-- 엡손솔벤잉크 11색기 (엡손)
('RM-I0029','엡손솔벤잉크 11색기 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0030','엡손솔벤잉크 11색기 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0031','엡손솔벤잉크 11색기 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0032','엡손솔벤잉크 11색기 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0033','엡손솔벤잉크 11색기 Lc','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0034','엡손솔벤잉크 11색기 Lm','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0035','엡손솔벤잉크 11색기 Og','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0036','엡손솔벤잉크 11색기 Lk','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0037','엡손솔벤잉크 11색기 Rd','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0038','엡손솔벤잉크 11색기 Gr','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0039','엡손솔벤잉크 11색기 W','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','엡손솔벤잉크 11색기',0,1,0,1,'NONE',0,0,'FIXED'),
-- UV 3200폭 재현테크
('RM-I0040','UV잉크 3200폭 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0041','UV잉크 3200폭 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0042','UV잉크 3200폭 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0043','UV잉크 3200폭 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0044','UV잉크 3200폭 W','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 3200폭',0,1,0,1,'NONE',0,0,'FIXED'),
-- UV 평판 재현테크
('RM-I0045','UV잉크 평판 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 평판',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0046','UV잉크 평판 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 평판',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0047','UV잉크 평판 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 평판',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0048','UV잉크 평판 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 평판',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0049','UV잉크 평판 W','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 평판',0,1,0,1,'NONE',0,0,'FIXED'),
-- UV 1800폭 KM테크
('RM-I0050','UV잉크 1800폭 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0051','UV잉크 1800폭 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0052','UV잉크 1800폭 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0053','UV잉크 1800폭 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0054','UV잉크 1800폭 W','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','UV잉크 1800폭',0,1,0,1,'NONE',0,0,'FIXED'),
-- 전사 KM테크 4색기
('RM-I0055','전사잉크 KM테크 4색기 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 4색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0056','전사잉크 KM테크 4색기 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 4색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0057','전사잉크 KM테크 4색기 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 4색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0058','전사잉크 KM테크 4색기 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 4색기',0,1,0,1,'NONE',0,0,'FIXED'),
-- 전사 KM테크 8색기 (+특수색 Rd Lk Bl Og)
('RM-I0059','전사잉크 KM테크 8색기 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0060','전사잉크 KM테크 8색기 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0061','전사잉크 KM테크 8색기 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0062','전사잉크 KM테크 8색기 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0063','전사잉크 KM테크 8색기 Rd','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0064','전사잉크 KM테크 8색기 Lk','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0065','전사잉크 KM테크 8색기 Bl','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0066','전사잉크 KM테크 8색기 Og','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 KM테크 8색기',0,1,0,1,'NONE',0,0,'FIXED'),
-- 전사 코스테크
('RM-I0067','전사잉크 코스테크 C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0068','전사잉크 코스테크 M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0069','전사잉크 코스테크 Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0070','전사잉크 코스테크 K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 코스테크',0,1,0,1,'NONE',0,0,'FIXED'),
-- 전사 d-gen
('RM-I0071','전사잉크 d-gen C','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 d-gen',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0072','전사잉크 d-gen M','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 d-gen',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0073','전사잉크 d-gen Y','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 d-gen',0,1,0,1,'NONE',0,0,'FIXED'),
('RM-I0074','전사잉크 d-gen K','MATERIAL','원자재',(SELECT id FROM item_categories WHERE category_code='MATERIAL'),'잉크','L','전사잉크 d-gen',0,1,0,1,'NONE',0,0,'FIXED');

-- ── 법인별 재고(inventory) 생성 ──
-- 동산기획(entity_id=1): Lc/Lm(선명 전용) 제외 72품목
INSERT INTO inventory (item_id, quantity, safe_stock, reorder_point, auto_pr_enabled, entity_id, last_updated)
SELECT id, 0, 0, 0, 0, 1, CURRENT_TIMESTAMP
  FROM items
 WHERE item_code LIKE 'RM-I%'
   AND item_code NOT IN ('RM-I0005','RM-I0006');

-- 선명(entity_id=2): 수성 잉크테크 CMYK(소모) + Lc/Lm(매출) 6품목
INSERT INTO inventory (item_id, quantity, safe_stock, reorder_point, auto_pr_enabled, entity_id, last_updated)
SELECT id, 0, 0, 0, 0, 2, CURRENT_TIMESTAMP
  FROM items
 WHERE item_code IN ('RM-I0001','RM-I0002','RM-I0003','RM-I0004','RM-I0005','RM-I0006');
