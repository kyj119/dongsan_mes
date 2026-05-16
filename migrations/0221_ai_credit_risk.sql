-- #82 Phase 1: AI 미수금 리스크 스코어링

-- 거래처별 리스크 스코어 캐시
ALTER TABLE clients ADD COLUMN credit_risk_score REAL DEFAULT 0;
ALTER TABLE clients ADD COLUMN credit_risk_grade TEXT DEFAULT 'N/A';  -- A | B | C | D | F | N/A
ALTER TABLE clients ADD COLUMN credit_risk_updated_at DATETIME;
