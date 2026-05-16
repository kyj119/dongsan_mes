-- #68: 계층형 불량 코드 + 고객 클레임 관리

CREATE TABLE IF NOT EXISTS defect_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES defect_codes(id),
  category TEXT NOT NULL,  -- PRINT | POST_PROCESS | MATERIAL | DESIGN
  description TEXT,
  preventive_action TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_defect_codes_parent ON defect_codes(parent_id);
CREATE INDEX IF NOT EXISTS idx_defect_codes_category ON defect_codes(category);

-- 기본 불량 코드 시드
INSERT INTO defect_codes (code, name, parent_id, category, sort_order) VALUES
  ('100', '인쇄 불량', NULL, 'PRINT', 100),
  ('101', '색차 (Delta-E 초과)', 1, 'PRINT', 101),
  ('102', '잉크 뭉침/번짐', 1, 'PRINT', 102),
  ('103', '헤드 줄무늬/빠짐', 1, 'PRINT', 103),
  ('104', '미디어 주름/접힘', 1, 'PRINT', 104),
  ('105', '위치 틀어짐', 1, 'PRINT', 105),
  ('200', '후가공 불량', NULL, 'POST_PROCESS', 200),
  ('201', '재단 틀어짐', 7, 'POST_PROCESS', 201),
  ('202', '라미네이트 기포', 7, 'POST_PROCESS', 202),
  ('203', '봉제/미싱 불량', 7, 'POST_PROCESS', 203),
  ('204', '그로밋 위치 오류', 7, 'POST_PROCESS', 204),
  ('300', '자재 불량', NULL, 'MATERIAL', 300),
  ('301', '원단 결점/이물', 12, 'MATERIAL', 301),
  ('302', '잉크 품질 저하', 12, 'MATERIAL', 302),
  ('400', '디자인 오류', NULL, 'DESIGN', 400),
  ('401', '시안 오류 (고객 원본)', 15, 'DESIGN', 401),
  ('402', '작업 파일 오류', 15, 'DESIGN', 402);

-- quality_issues 확장
ALTER TABLE quality_issues ADD COLUMN defect_code_id INTEGER REFERENCES defect_codes(id);

-- 고객 클레임
CREATE TABLE IF NOT EXISTS customer_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_number TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  claim_date DATE NOT NULL,
  claim_type TEXT NOT NULL DEFAULT 'DEFECT',  -- DEFECT | DELAY | WRONG_ITEM | OTHER
  description TEXT NOT NULL,
  claimed_amount REAL DEFAULT 0,
  resolution_type TEXT,  -- REFUND | CREDIT | REMAKE | DISCOUNT | REJECTED
  resolved_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | INVESTIGATING | RESOLVED | CLOSED
  quality_issue_id INTEGER REFERENCES quality_issues(id),
  rework_order_id INTEGER REFERENCES orders(id),
  resolved_by INTEGER REFERENCES users(id),
  resolved_at DATETIME,
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_claims_client ON customer_claims(client_id);
CREATE INDEX IF NOT EXISTS idx_claims_order ON customer_claims(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON customer_claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_entity ON customer_claims(entity_id);
