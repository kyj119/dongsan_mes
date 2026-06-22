-- 0352: 후가공(코팅) 자재 자동차감 인프라 — 코팅 PP옵션 + 자재매핑 + 차감기록 테이블
--
-- 코팅(무광/유광)은 면 전체 처리라 post_processing(면처리)에 속함. 솔벤 인쇄 후 코팅 공정에서 코팅지 소비.
-- 차감 시점=출고 완료(shipment POST), 폭 기준=출력폭(인쇄 자재차감과 동일 로직 재사용).
-- post_processing_options.material_item_group = 이 PP옵션이 소비하는 원자재 그룹(폭매칭 차감 대상).

-- 1) PP옵션이 소비하는 자재그룹 매핑 컬럼
ALTER TABLE post_processing_options ADD COLUMN material_item_group TEXT;

-- 2) 코팅 PP옵션 2종 (무광/유광) — 각자 코팅지 그룹 매핑
INSERT INTO post_processing_options (option_code, option_name, additional_cost, description, is_active, pricing_type, unit_price, pp_category, display_on_card, material_item_group) VALUES
 ('PP-COAT-M', '무광코팅', 0, '솔벤 인쇄 후 무광 코팅 (코팅지 폭매칭 소비)', 1, 'fixed', 0, 'coating', 1, '무광코팅지 SPP031M'),
 ('PP-COAT-G', '유광코팅', 0, '솔벤 인쇄 후 유광 코팅 (코팅지 폭매칭 소비)', 1, 'fixed', 0, 'coating', 1, '유광코팅지 SPP031G');

-- 3) 후가공 자재차감 기록 (인쇄 차감의 inventory_auto_deductions와 분리). UNIQUE(print_event,material)로 중복방지.
CREATE TABLE IF NOT EXISTS pp_material_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  print_event_id INTEGER NOT NULL,
  order_id INTEGER,
  order_item_id INTEGER,
  pp_option_code TEXT,
  material_item_id INTEGER NOT NULL,
  matched_width_mm INTEGER,
  output_width_mm REAL,
  output_height_mm REAL,
  copy_total INTEGER DEFAULT 1,
  deducted_length_yd REAL NOT NULL,
  inventory_before REAL,
  inventory_after REAL,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(print_event_id, material_item_id),
  FOREIGN KEY (print_event_id) REFERENCES print_events(id),
  FOREIGN KEY (material_item_id) REFERENCES items(id)
);
