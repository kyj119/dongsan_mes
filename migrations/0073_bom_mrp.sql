-- ============================================================================
-- BOM (자재명세서) + MRP (자재소요계획) 시스템
-- ============================================================================

-- bom_items: 카테고리/품목별 원재료 소요량
CREATE TABLE IF NOT EXISTS bom_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER,                         -- 특정 품목 (nullable)
  category_name TEXT,                      -- 카테고리 기준 (nullable)
  material_item_id INTEGER NOT NULL,       -- 원재료 (inventory 참조)
  material_name TEXT NOT NULL,             -- 원재료명 (스냅샷)
  usage_per_sqm REAL NOT NULL DEFAULT 0,   -- m²당 사용량
  usage_unit TEXT NOT NULL DEFAULT 'M',    -- 단위 (M/ML/EA/ROLL/SHEET)
  waste_factor REAL NOT NULL DEFAULT 1.0,  -- 로스율 (1.1 = 10% 추가)
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  FOREIGN KEY (material_item_id) REFERENCES inventory(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id),
  CHECK (item_id IS NOT NULL OR category_name IS NOT NULL)
);

-- mrp_runs: MRP 실행 이력
CREATE TABLE IF NOT EXISTS mrp_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_number TEXT NOT NULL UNIQUE,         -- MRP-YYYYMMDD-NNN
  run_type TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK(run_type IN ('MANUAL','AUTO','ORDER')),
  date_from TEXT,                          -- 대상 기간 시작
  date_to TEXT,                            -- 대상 기간 종료
  order_id INTEGER,                        -- 특정 주문 기반 실행
  status TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK(status IN ('RUNNING','COMPLETED','FAILED')),
  total_materials INTEGER DEFAULT 0,
  shortfall_count INTEGER DEFAULT 0,
  auto_pr_created INTEGER DEFAULT 0,
  notes TEXT,
  run_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (run_by) REFERENCES users(id)
);

-- mrp_results: MRP 실행 결과 (자재별)
CREATE TABLE IF NOT EXISTS mrp_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  material_item_id INTEGER NOT NULL,
  material_name TEXT NOT NULL,
  required_quantity REAL DEFAULT 0,        -- 소요량
  current_stock REAL DEFAULT 0,            -- 현재 재고
  on_order_quantity REAL DEFAULT 0,        -- 발주중 수량
  shortfall REAL DEFAULT 0,               -- 부족량
  auto_pr_id INTEGER,                      -- 자동 생성된 PR
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES mrp_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (material_item_id) REFERENCES inventory(id),
  FOREIGN KEY (auto_pr_id) REFERENCES purchase_requests(id) ON DELETE SET NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_bom_item ON bom_items(item_id);
CREATE INDEX IF NOT EXISTS idx_bom_category ON bom_items(category_name);
CREATE INDEX IF NOT EXISTS idx_bom_material ON bom_items(material_item_id);
CREATE INDEX IF NOT EXISTS idx_bom_active ON bom_items(is_active);
CREATE INDEX IF NOT EXISTS idx_mrp_runs_number ON mrp_runs(run_number);
CREATE INDEX IF NOT EXISTS idx_mrp_runs_type ON mrp_runs(run_type);
CREATE INDEX IF NOT EXISTS idx_mrp_results_run ON mrp_results(run_id);
CREATE INDEX IF NOT EXISTS idx_mrp_results_material ON mrp_results(material_item_id);
