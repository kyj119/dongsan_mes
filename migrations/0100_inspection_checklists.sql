-- 0100: 입고 검수 체크리스트 시스템

-- 검수 체크리스트 템플릿 (품목 카테고리별 기본 검수 항목)
CREATE TABLE IF NOT EXISTS inspection_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_name TEXT NOT NULL,
  category_name TEXT,  -- NULL이면 범용, 값이 있으면 해당 카테고리 전용
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 검수 항목 정의
CREATE TABLE IF NOT EXISTS inspection_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES inspection_templates(id) ON DELETE CASCADE,
  check_item TEXT NOT NULL,  -- 검수 항목명 (예: "폭 확인", "색상 확인")
  check_type TEXT NOT NULL DEFAULT 'PASS_FAIL',  -- PASS_FAIL, NUMERIC, TEXT
  description TEXT,  -- 상세 설명
  is_required INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inspection_template_items_template ON inspection_template_items(template_id);

-- 실제 검수 결과 기록
CREATE TABLE IF NOT EXISTS inspection_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES inventory_receipts(id) ON DELETE CASCADE,
  receipt_item_id INTEGER REFERENCES inventory_receipt_items(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES inspection_templates(id) ON DELETE SET NULL,
  inspector_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  overall_result TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, PASSED, FAILED, PARTIAL
  notes TEXT,
  inspected_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inspection_results_receipt ON inspection_results(receipt_id);

-- 개별 검수 항목 결과
CREATE TABLE IF NOT EXISTS inspection_result_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  template_item_id INTEGER REFERENCES inspection_template_items(id) ON DELETE SET NULL,
  check_item TEXT NOT NULL,
  check_result TEXT NOT NULL DEFAULT 'PENDING',  -- PASS, FAIL, NA
  value TEXT,  -- 수치/텍스트 결과값
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inspection_result_items_result ON inspection_result_items(result_id);
