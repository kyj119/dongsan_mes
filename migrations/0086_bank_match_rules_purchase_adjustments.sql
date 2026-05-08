-- 0086: 은행 거래 매칭 학습 규칙 + 매입 감액/조정
-- bank_match_rules: 입금자명/출금처명 → 거래처 자동 매칭 학습
-- purchase_adjustments: 공급처별 감액, 클레임, 반품 등 조정 기록

CREATE TABLE IF NOT EXISTS bank_match_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  counterpart_name TEXT NOT NULL,          -- 입금자명/출금처명
  matched_client_id INTEGER NOT NULL,      -- 매칭된 거래처 ID
  match_count INTEGER DEFAULT 1,           -- 이 규칙이 사용된 횟수
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER,                      -- 최초 매칭한 사용자
  FOREIGN KEY (matched_client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_match_rules_name ON bank_match_rules(counterpart_name);

CREATE TABLE IF NOT EXISTS purchase_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,            -- 공급처 ID (clients.id)
  po_id INTEGER,                           -- 관련 발주 ID (선택)
  type TEXT NOT NULL CHECK(type IN ('DISCOUNT','CLAIM','RETURN','OTHER')),
  amount REAL NOT NULL,                    -- 감액 금액
  reason TEXT,                             -- 사유
  adjustment_date DATE NOT NULL,           -- 조정일
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES clients(id),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_adjustments_supplier ON purchase_adjustments(supplier_id);
