-- 마감 방식 시스템

-- 1. "마감방식"을 하나의 후가공 항목으로 추가 (소분류 연결용)
INSERT OR IGNORE INTO post_processing_options (option_code, option_name, margin_left, margin_right, margin_top, margin_bottom, additional_cost, description, is_active, pricing_type, unit_price, pp_category)
VALUES ('PP-FINISHING', '마감방식', 0, 0, 0, 0, 0, '마감 방식 선택 (상/하/좌/우 개별 설정)', 1, 'fixed', 0, 'finishing');

-- 2. 개별 마감방식 항목의 소분류 연결 제거 후 삭제
DELETE FROM pp_option_subcategories WHERE pp_option_id IN (SELECT id FROM post_processing_options WHERE option_code IN ('PP-FOLD-SEW', 'PP-LINE-SEW', 'PP-BAND-SEW', 'PP-HEATCUT'));
DELETE FROM post_processing_options WHERE option_code IN ('PP-FOLD-SEW', 'PP-LINE-SEW', 'PP-BAND-SEW', 'PP-HEATCUT');

-- 3. 마감 방식 하위 옵션 테이블
CREATE TABLE IF NOT EXISTS finishing_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  margin_cm REAL NOT NULL DEFAULT 0,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO finishing_methods (name, margin_cm, description, sort_order) VALUES
  ('열재단', 0, '열로 재단하여 풀림 방지', 1),
  ('접어미싱', 4, '가장자리를 접어서 미싱 처리', 2),
  ('줄미싱', 5, '줄을 넣어 미싱 처리', 3),
  ('밴드미싱', 5, '밴드를 넣어 미싱 처리', 4);

-- 4. 프리셋 테이블
CREATE TABLE IF NOT EXISTS finishing_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO finishing_presets (name, config, sort_order) VALUES
  ('사방 열재단', '{"top":"열재단","bottom":"열재단","left":"열재단","right":"열재단"}', 1),
  ('사방 접어미싱', '{"top":"접어미싱","bottom":"접어미싱","left":"접어미싱","right":"접어미싱"}', 2);

-- 5. order_items, cards에 마감 정보 컬럼
ALTER TABLE order_items ADD COLUMN finishing TEXT;
ALTER TABLE cards ADD COLUMN finishing TEXT;
