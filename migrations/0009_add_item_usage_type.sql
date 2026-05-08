-- Add columns for item usage classification
ALTER TABLE items ADD COLUMN is_sales_item INTEGER DEFAULT 0;     -- 매출용 품목 (주문서용)
ALTER TABLE items ADD COLUMN is_purchase_item INTEGER DEFAULT 0;  -- 매입용 품목 (발주서/재고용)

-- Set all existing items as sales items by default
UPDATE items SET is_sales_item = 1 WHERE is_active = 1;
