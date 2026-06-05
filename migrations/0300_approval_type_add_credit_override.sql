-- ============================================================================
-- #355: approval_requests / approval_templates CHECK 에 'CREDIT_OVERRIDE' 추가
-- ============================================================================
-- 배경: #163 여신한도 초과 승인이 type='CREDIT_OVERRIDE' 로 INSERT 하는데
--       approval_requests.type CHECK(0202) 에 해당 값이 없어 CHECK 위반 →
--       여신 초과 주문 생성이 500 실패 + 고아 주문 발생.
-- SQLite 는 CHECK 를 ALTER 로 변경할 수 없으므로 테이블 재빌드(CREATE→copy→drop→rename).
-- 현재 라이브 스키마(0202 + 0223/0236 entity_id) 를 그대로 보존하면서 CHECK 만 확장.

-- ---------------------------------------------------------------------------
-- Step 1: approval_templates — CHECK 확장 (entity_id 컬럼 없음, 0202 구조 유지)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_templates_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL','PRICE_CHANGE','LEAVE_ATTENDANCE','SHIPMENT_HOLD','CREDIT_OVERRIDE')),
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

-- ---------------------------------------------------------------------------
-- Step 2: approval_requests — CHECK 확장 (entity_id 컬럼 보존)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_requests_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  template_id INTEGER,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL','PRICE_CHANGE','LEAVE_ATTENDANCE','SHIPMENT_HOLD','CREDIT_OVERRIDE')),
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
  entity_id INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (template_id) REFERENCES approval_templates(id),
  FOREIGN KEY (requester_id) REFERENCES users(id)
);

INSERT INTO approval_requests_new (id, request_number, template_id, type, requester_id, title, content, amount, reference_type, reference_id, status, current_step, total_steps, final_comment, completed_at, created_at, updated_at, entity_id)
  SELECT id, request_number, template_id, type, requester_id, title, content, amount, reference_type, reference_id, status, current_step, total_steps, final_comment, completed_at, created_at, updated_at, entity_id FROM approval_requests;

DROP TABLE approval_requests;
ALTER TABLE approval_requests_new RENAME TO approval_requests;

-- ---------------------------------------------------------------------------
-- Step 3: 인덱스 재생성 (재빌드로 소실되므로 복구)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ar_requester ON approval_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_ar_type ON approval_requests(type);
CREATE INDEX IF NOT EXISTS idx_ar_number ON approval_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_ar_entity ON approval_requests(entity_id);
CREATE INDEX IF NOT EXISTS idx_at_type ON approval_templates(type);
