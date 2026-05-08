-- 원가 기준 테이블 (카테고리별 미디어/잉크 단가)
CREATE TABLE IF NOT EXISTS cost_standards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_name TEXT NOT NULL,
  media_cost_per_sqm REAL DEFAULT 0,
  ink_cost_per_sqm REAL DEFAULT 0,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(category_name)
);

-- 후가공 단가 (기존 post_processing_options.additional_cost 활용 — 별도 테이블 불필요)
-- post_processing_options.additional_cost = 건당 추가 비용 (이미 존재)

-- order_items에 원가 컬럼 추가
ALTER TABLE order_items ADD COLUMN material_cost REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN ink_cost REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN pp_cost REAL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN total_cost REAL DEFAULT 0;
