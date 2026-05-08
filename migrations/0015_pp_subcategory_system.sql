-- ============================================================================
-- Migration 0015: 후가공 소분류 연결 시스템
-- 후가공 옵션을 품목의 소분류(sub_category)와 연결하는 새 구조
-- ============================================================================

-- 후가공 적용 소분류 마스터 테이블
CREATE TABLE IF NOT EXISTS pp_applicable_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL,    -- 대분류 그룹 (태극기, 실사출력, 간판)
  subcat_name TEXT NOT NULL,   -- 소분류명 (현수막, 시트, 후렉스, ...)
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  UNIQUE(group_name, subcat_name)
);

-- 기본 소분류 데이터 삽입
INSERT OR IGNORE INTO pp_applicable_subcategories (group_name, subcat_name, sort_order) VALUES
  ('태극기', '태극기', 1),
  ('실사출력', '현수막', 2),
  ('실사출력', '시트', 3),
  ('실사출력', '후렉스', 4),
  ('실사출력', '평판출력', 5),
  ('간판', '원형간판', 6),
  ('간판', '채널간판', 7),
  ('간판', '프레임간판', 8),
  ('간판', '갈바', 9);

-- PP 옵션 ↔ 소분류 연결 테이블 (M:N)
CREATE TABLE IF NOT EXISTS pp_option_subcategories (
  pp_option_id INTEGER NOT NULL,
  subcat_id INTEGER NOT NULL,
  PRIMARY KEY (pp_option_id, subcat_id),
  FOREIGN KEY (pp_option_id) REFERENCES post_processing_options(id),
  FOREIGN KEY (subcat_id) REFERENCES pp_applicable_subcategories(id)
);
