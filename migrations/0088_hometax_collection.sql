-- 홈택스 수집 작업 테이블
CREATE TABLE IF NOT EXISTS hometax_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,                          -- 팝빌 JobID
  job_type TEXT NOT NULL,                        -- SELL(매출) / BUY(매입)
  start_date TEXT NOT NULL,                      -- 조회 시작일 YYYY-MM-DD
  end_date TEXT NOT NULL,                        -- 조회 종료일 YYYY-MM-DD
  state INTEGER DEFAULT 0,                       -- 0=접수, 1=대기, 2=진행, 3=완료
  result INTEGER,                                -- 100=성공, 그 외=실패
  message TEXT,
  total_count INTEGER DEFAULT 0,
  requested_by INTEGER REFERENCES users(id),
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_hometax_jobs_state ON hometax_jobs(state);
CREATE INDEX IF NOT EXISTS idx_hometax_jobs_type ON hometax_jobs(job_type);

-- 홈택스 수집된 세금계산서 테이블
CREATE TABLE IF NOT EXISTS hometax_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES hometax_jobs(id),
  invoice_type TEXT NOT NULL,                    -- SELL(매출) / BUY(매입)
  nts_confirm_number TEXT,                       -- 국세청 승인번호
  issue_date TEXT,                               -- 작성일 YYYY-MM-DD
  send_date TEXT,                                -- 전송일

  supply_amount INTEGER DEFAULT 0,               -- 공급가액
  tax_amount INTEGER DEFAULT 0,                  -- 세액
  total_amount INTEGER DEFAULT 0,                -- 합계

  issuer_corp_num TEXT,                          -- 공급자 사업자번호
  issuer_corp_name TEXT,                         -- 공급자 상호
  issuer_ceo_name TEXT,                          -- 공급자 대표자명
  receiver_corp_num TEXT,                        -- 공급받는자 사업자번호
  receiver_corp_name TEXT,                       -- 공급받는자 상호
  receiver_ceo_name TEXT,                        -- 공급받는자 대표자명

  invoice_detail_type TEXT,                      -- 일반/수정 등
  tax_type TEXT,                                 -- 과세/영세/면세
  purpose_type TEXT,                             -- 영수/청구

  matched_invoice_id INTEGER REFERENCES tax_invoices(id),  -- 매칭된 시스템 세금계산서
  match_status TEXT DEFAULT 'UNMATCHED',         -- UNMATCHED, MATCHED, MISMATCH
  match_note TEXT,                               -- 매칭 메모

  raw_data TEXT,                                 -- JSON 원본 데이터
  collected_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hometax_invoices_type ON hometax_invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_nts ON hometax_invoices(nts_confirm_number);
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_match ON hometax_invoices(match_status);
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_issue_date ON hometax_invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_issuer ON hometax_invoices(issuer_corp_num);
CREATE INDEX IF NOT EXISTS idx_hometax_invoices_receiver ON hometax_invoices(receiver_corp_num);
