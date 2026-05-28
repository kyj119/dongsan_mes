-- 단가 그룹 테이블 (동일 단가 품목 묶음)
-- items는 entity_id 없이 법인 간 공유되므로 price_groups도 동일
CREATE TABLE IF NOT EXISTS price_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 품목에 단가 그룹 FK 추가
ALTER TABLE items ADD COLUMN price_group_id INTEGER REFERENCES price_groups(id);

CREATE INDEX IF NOT EXISTS idx_items_price_group ON items(price_group_id);

-- price_change_history 스키마 수정: 코드에서 사용하는 컬럼 추가
-- 기존: old_price, new_price (미사용)
-- 추가: field_name, old_value, new_value (코드 호환)
ALTER TABLE price_change_history ADD COLUMN field_name TEXT;
ALTER TABLE price_change_history ADD COLUMN old_value REAL;
ALTER TABLE price_change_history ADD COLUMN new_value REAL;
