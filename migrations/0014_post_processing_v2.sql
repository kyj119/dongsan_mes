-- ============================================================================
-- Migration 0014: 후가공 시스템 v2 - 파라미터 스키마 + 품목별 기본값
-- ============================================================================

-- 기존 post_processing_options 테이블 확장
ALTER TABLE post_processing_options ADD COLUMN parameter_schema TEXT;
-- JSON 스키마 예:
-- { "fields": [
--   { "key": "count",    "label": "개수", "type": "number", "unit": "개", "default": 4 },
--   { "key": "position", "label": "위치", "type": "select",
--     "options": ["상","하","좌","우","사방","사방+중간"], "default": "사방" }
-- ]}

ALTER TABLE post_processing_options ADD COLUMN pricing_type TEXT DEFAULT 'fixed';
-- 'fixed'     : additional_cost 고정 금액
-- 'per_count' : params.count × unit_price
-- 'per_area'  : 추가 여백 면적 × unit_price

ALTER TABLE post_processing_options ADD COLUMN unit_price REAL DEFAULT 0;

-- 품목별 후가공 기본값 테이블 (신규)
CREATE TABLE IF NOT EXISTS item_post_processing_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  pp_option_id INTEGER NOT NULL,
  default_params TEXT,                        -- JSON: 기본 파라미터 값
  is_enabled_by_default INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_id, pp_option_id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (pp_option_id) REFERENCES post_processing_options(id)
);