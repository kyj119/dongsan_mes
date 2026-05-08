-- ============================================================================
-- Migration: 0042 - 전자세금계산서 시스템
-- ============================================================================

-- 전자세금계산서 테이블
CREATE TABLE tax_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,              -- 내부 관리번호 (TI-2026-0001)
  order_id INTEGER NOT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'NORMAL',  -- NORMAL / MODIFY
  modify_code TEXT,                          -- 수정사유 (수정발행시)
  original_invoice_id INTEGER,               -- 원본 참조 (수정발행시)

  -- 공급자 스냅샷 (발행 시점 고정)
  supplier_brn TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_representative TEXT,
  supplier_address TEXT,
  supplier_business_type TEXT,
  supplier_business_item TEXT,

  -- 공급받는자 스냅샷
  buyer_client_id INTEGER NOT NULL,
  buyer_brn TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_representative TEXT,
  buyer_address TEXT,
  buyer_business_type TEXT,
  buyer_business_item TEXT,
  buyer_email TEXT,

  -- 금액 (원 단위 정수)
  supply_amount INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,

  -- 상태: DRAFT → ISSUED → SENT / FAILED / CANCELLED
  status TEXT NOT NULL DEFAULT 'DRAFT',

  -- 국세청
  nts_approval_number TEXT,
  nts_sent_at DATETIME,
  nts_result_code TEXT,
  nts_result_message TEXT,

  -- 공급자 API
  provider_name TEXT,
  provider_invoice_id TEXT,
  provider_response TEXT,

  issue_date TEXT NOT NULL,                  -- 작성일자 YYYY-MM-DD
  notes TEXT,

  issued_by INTEGER,
  cancelled_at DATETIME,
  cancelled_by INTEGER,
  cancel_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (buyer_client_id) REFERENCES clients(id),
  FOREIGN KEY (original_invoice_id) REFERENCES tax_invoices(id)
);

-- 세금계산서 품목 상세
CREATE TABLE tax_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_invoice_id INTEGER NOT NULL,
  item_date TEXT,
  item_name TEXT NOT NULL,
  specification TEXT,
  quantity REAL DEFAULT 1,
  unit_price INTEGER DEFAULT 0,
  supply_amount INTEGER NOT NULL,
  tax_amount INTEGER NOT NULL,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (tax_invoice_id) REFERENCES tax_invoices(id) ON DELETE CASCADE
);

-- 인덱스
CREATE INDEX idx_ti_order ON tax_invoices(order_id);
CREATE INDEX idx_ti_status ON tax_invoices(status);
CREATE INDEX idx_ti_issue_date ON tax_invoices(issue_date);
CREATE INDEX idx_ti_nts_approval ON tax_invoices(nts_approval_number);

-- 세금계산서 설정
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('tax_provider', 'popbill', '전자세금계산서 공급자 (popbill/barobill)'),
  ('tax_provider_linked_id', '', '팝빌 링크아이디'),
  ('tax_auto_issue', '0', '출고 시 자동발행 여부'),
  ('tax_default_email', '', '세금계산서 수신 이메일');
