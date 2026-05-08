-- 카테고리 TEXT 컬럼 인덱스 추가 (item_type 전환 이후 누락)
CREATE INDEX IF NOT EXISTS idx_items_category_text ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_item_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_order_items_category_name ON order_items(category_name);
