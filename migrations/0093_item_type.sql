-- 품목 타입 구분: PRODUCT(제품), GOODS(상품), MATERIAL(원자재)
ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'PRODUCT'
  CHECK(item_type IN ('PRODUCT', 'GOODS', 'MATERIAL'));

-- 기존 데이터 마이그레이션: is_purchase_item=1 이면서 is_sales_item=0 → MATERIAL
UPDATE items SET item_type = 'MATERIAL'
  WHERE is_purchase_item = 1 AND is_sales_item = 0;

-- is_sales_item=1 이면서 is_purchase_item=0 → PRODUCT
UPDATE items SET item_type = 'PRODUCT'
  WHERE is_sales_item = 1 AND is_purchase_item = 0;

-- 둘 다 1인 경우 → PRODUCT (매출이 우선)
UPDATE items SET item_type = 'PRODUCT'
  WHERE is_sales_item = 1 AND is_purchase_item = 1;

-- 둘 다 0인 경우 → PRODUCT (기본값)
UPDATE items SET item_type = 'PRODUCT'
  WHERE is_sales_item = 0 AND is_purchase_item = 0;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(item_type);
