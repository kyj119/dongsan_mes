-- ============================================================================
-- 결재 유형 확장: 단가변경, 휴가/근태, 출고보류 추가
-- ============================================================================
-- 신규 유형: PRICE_CHANGE, LEAVE_ATTENDANCE, SHIPMENT_HOLD

-- Step 1: approval_templates — CHECK 확장
CREATE TABLE IF NOT EXISTS approval_templates_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL','PRICE_CHANGE','LEAVE_ATTENDANCE','SHIPMENT_HOLD')),
  description TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO approval_templates_new (id, name, type, description, steps, is_active, created_by, created_at, updated_at)
  SELECT id, name, type, description, steps, is_active, created_by, created_at, updated_at FROM approval_templates;

DROP TABLE approval_templates;
ALTER TABLE approval_templates_new RENAME TO approval_templates;

-- Step 2: approval_requests — CHECK 확장
CREATE TABLE IF NOT EXISTS approval_requests_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  template_id INTEGER,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL','PRICE_CHANGE','LEAVE_ATTENDANCE','SHIPMENT_HOLD')),
  requester_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  amount REAL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','PENDING','IN_REVIEW','APPROVED','REJECTED','CANCELLED')),
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  final_comment TEXT,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES approval_templates(id),
  FOREIGN KEY (requester_id) REFERENCES users(id)
);

INSERT INTO approval_requests_new (id, request_number, template_id, type, requester_id, title, content, amount, reference_type, reference_id, status, current_step, total_steps, final_comment, completed_at, created_at, updated_at)
  SELECT id, request_number, template_id, type, requester_id, title, content, amount, reference_type, reference_id, status, current_step, total_steps, final_comment, completed_at, created_at, updated_at FROM approval_requests;

DROP TABLE approval_requests;
ALTER TABLE approval_requests_new RENAME TO approval_requests;

-- Step 3: 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_ar_requester ON approval_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_ar_type ON approval_requests(type);
CREATE INDEX IF NOT EXISTS idx_ar_number ON approval_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_at_type ON approval_templates(type);

-- Step 4: 신규 결재 양식 시드
INSERT OR IGNORE INTO approval_templates (name, type, description, steps) VALUES
  ('단가 변경 승인', 'PRICE_CHANGE', '거래처 단가 변경 승인 프로세스', '[{"step_order":1,"role_or_user_id":"MANAGER","label":"팀장 검토"},{"step_order":2,"role_or_user_id":"ADMIN","label":"관리자 최종 승인"}]'),
  ('휴가/근태 승인', 'LEAVE_ATTENDANCE', '휴가 및 근태 관련 승인', '[{"step_order":1,"role_or_user_id":"MANAGER","label":"팀장 승인"}]'),
  ('출고 보류 해제', 'SHIPMENT_HOLD', '미수금 과다 거래처 출고 승인', '[{"step_order":1,"role_or_user_id":"MANAGER","label":"팀장 검토"},{"step_order":2,"role_or_user_id":"ADMIN","label":"관리자 최종 승인"}]');
