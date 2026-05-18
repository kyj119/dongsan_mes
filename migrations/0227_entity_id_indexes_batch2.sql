-- 0227: entity_id 인덱스 누락 일괄 추가 (Area 4 Data Integrity)
-- 0213~0220 마이그레이션에서 생성된 테이블들의 entity_id 인덱스 누락 보완
-- due_date 인덱스 추가 (미납 인보이스 조회 성능)

-- ── returns ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_returns_entity ON returns(entity_id);

-- ── purchase_invoices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pi_entity ON purchase_invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_pi_due_date ON purchase_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_pi_payment_status ON purchase_invoices(payment_status);

-- ── fixed_assets ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fa_entity ON fixed_assets(entity_id);

-- ── budgets ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_budgets_entity ON budgets(entity_id);

-- ── journal_entries ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_je_entity ON journal_entries(entity_id);
