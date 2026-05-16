-- #76: 총계정원장(General Ledger) 복식부기 시스템

-- 계정과목
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,  -- ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
  parent_id INTEGER REFERENCES chart_of_accounts(id),
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 기본 계정과목 시드 (한국 중소기업 표준)
INSERT INTO chart_of_accounts (code, name, account_type, parent_id, sort_order) VALUES
  -- 자산
  ('1000', '자산', 'ASSET', NULL, 1000),
  ('1100', '유동자산', 'ASSET', 1, 1100),
  ('1110', '보통예금', 'ASSET', 2, 1110),
  ('1120', '현��', 'ASSET', 2, 1120),
  ('1130', '매출채권', 'ASSET', 2, 1130),
  ('1140', '재고자산', 'ASSET', 2, 1140),
  ('1150', '선급금', 'ASSET', 2, 1150),
  ('1200', '비유동자산', 'ASSET', 1, 1200),
  ('1210', '기계장치', 'ASSET', 8, 1210),
  ('1220', '차량운반구', 'ASSET', 8, 1220),
  ('1230', '비품', 'ASSET', 8, 1230),
  -- 부채
  ('2000', '부채', 'LIABILITY', NULL, 2000),
  ('2100', '유동부채', 'LIABILITY', 12, 2100),
  ('2110', '매입채무', 'LIABILITY', 13, 2110),
  ('2120', '미지급금', 'LIABILITY', 13, 2120),
  ('2130', '예수금(원천세)', 'LIABILITY', 13, 2130),
  ('2140', '부가세예수금', 'LIABILITY', 13, 2140),
  -- 자본
  ('3000', '자본', 'EQUITY', NULL, 3000),
  ('3100', '자본금', 'EQUITY', 18, 3100),
  ('3200', '이익잉여금', 'EQUITY', 18, 3200),
  -- 수익
  ('4000', '수익', 'REVENUE', NULL, 4000),
  ('4100', '매출', 'REVENUE', 21, 4100),
  ('4200', '기타수익', 'REVENUE', 21, 4200),
  -- 비용
  ('5000', '비용', 'EXPENSE', NULL, 5000),
  ('5100', '매출원가', 'EXPENSE', 24, 5100),
  ('5110', '재료비', 'EXPENSE', 25, 5110),
  ('5120', '노무비', 'EXPENSE', 25, 5120),
  ('5130', '제조경비', 'EXPENSE', 25, 5130),
  ('5200', '판매관리비', 'EXPENSE', 24, 5200),
  ('5210', '급여', 'EXPENSE', 29, 5210),
  ('5220', '임차료', 'EXPENSE', 29, 5220),
  ('5230', '감가상각비', 'EXPENSE', 29, 5230),
  ('5240', '수���비', 'EXPENSE', 29, 5240),
  ('5250', '통신비', 'EXPENSE', 29, 5250),
  ('5260', '소모품비', 'EXPENSE', 29, 5260);

-- 분개장
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_number TEXT NOT NULL UNIQUE,
  entry_date DATE NOT NULL,
  description TEXT,
  reference_type TEXT,  -- ORDER | PAYMENT | PURCHASE | PAYROLL | DEPRECIATION | MANUAL
  reference_id INTEGER,
  is_auto INTEGER DEFAULT 0,  -- 자동 분개 여부
  entity_id INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_je_ref ON journal_entries(reference_type, reference_id);

-- 분개 라인 (차변/대변)
CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES chart_of_accounts(id),
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id);
