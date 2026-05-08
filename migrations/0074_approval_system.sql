-- ============================================================================
-- 전자결재 시스템
-- ============================================================================

-- approval_templates: 결재 양식
CREATE TABLE IF NOT EXISTS approval_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL')),
  description TEXT,
  steps TEXT NOT NULL DEFAULT '[]',        -- JSON: [{step_order, role_or_user_id, label}]
  is_active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- approval_requests: 결재 요청
CREATE TABLE IF NOT EXISTS approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,      -- APR-YYYYMMDD-NNN
  template_id INTEGER,
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK(type IN ('PURCHASE_REQUEST','DISCOUNT','BAD_DEBT_WRITEOFF','EQUIPMENT_PURCHASE','EXPENSE_CLAIM','GENERAL')),
  requester_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,                             -- JSON: 양식별 데이터
  amount REAL DEFAULT 0,
  reference_type TEXT,                      -- 연관 엔티티 타입 (e.g. purchase_request)
  reference_id INTEGER,                     -- 연관 엔티티 ID
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

-- approval_steps: 단계별 처리
CREATE TABLE IF NOT EXISTS approval_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  approver_id INTEGER,                     -- 특정 사용자
  approver_role TEXT,                      -- 또는 역할 기반
  label TEXT,                              -- 단계 이름
  status TEXT DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','APPROVED','REJECTED','SKIPPED')),
  comment TEXT,
  acted_at DATETIME,
  FOREIGN KEY (request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES users(id)
);

-- approval_attachments: 첨부 파일
CREATE TABLE IF NOT EXISTS approval_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_data TEXT,                           -- base64 인코딩
  uploaded_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ar_requester ON approval_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_ar_type ON approval_requests(type);
CREATE INDEX IF NOT EXISTS idx_ar_number ON approval_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_as_request ON approval_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_as_approver ON approval_steps(approver_id);
CREATE INDEX IF NOT EXISTS idx_as_role ON approval_steps(approver_role);
CREATE INDEX IF NOT EXISTS idx_at_type ON approval_templates(type);
CREATE INDEX IF NOT EXISTS idx_aa_request ON approval_attachments(request_id);

-- 기본 결재 양식 시드
INSERT INTO approval_templates (name, type, description, steps) VALUES
  ('발주 요청 결재', 'PURCHASE_REQUEST', '발주 요청에 대한 승인 프로세스', '[{"step_order":1,"role_or_user_id":"MANAGER","label":"팀장 승인"},{"step_order":2,"role_or_user_id":"ADMIN","label":"관리자 최종 승인"}]'),
  ('할인 승인', 'DISCOUNT', '특별 할인 적용 시 승인', '[{"step_order":1,"role_or_user_id":"ADMIN","label":"관리자 승인"}]'),
  ('대손처리', 'BAD_DEBT_WRITEOFF', '미수금 대손처리 승인', '[{"step_order":1,"role_or_user_id":"MANAGER","label":"팀장 검토"},{"step_order":2,"role_or_user_id":"ADMIN","label":"관리자 최종 승인"}]'),
  ('장비 구매', 'EQUIPMENT_PURCHASE', '장비 구매 승인 프로세스', '[{"step_order":1,"role_or_user_id":"MANAGER","label":"팀장 승인"},{"step_order":2,"role_or_user_id":"ADMIN","label":"관리자 최종 승인"}]'),
  ('경비 청구', 'EXPENSE_CLAIM', '경비 사용 청구', '[{"step_order":1,"role_or_user_id":"MANAGER","label":"팀장 승인"}]'),
  ('일반 결재', 'GENERAL', '범용 결재 양식', '[{"step_order":1,"role_or_user_id":"ADMIN","label":"관리자 승인"}]');
