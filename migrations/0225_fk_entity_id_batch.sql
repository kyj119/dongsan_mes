-- ============================================================================
-- 0225: FK 누락 + entity_id 누락 일괄 수정
-- Issues: #93, #94, #96, #104, #105, #106
-- ============================================================================

-- ── #104/#110: entity_id 컬럼 추가 ──────────────────────────────────────────
ALTER TABLE equipment_oee_daily ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE chart_of_accounts ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE defect_codes ADD COLUMN entity_id INTEGER DEFAULT 1;
ALTER TABLE inventory_fifo_layers ADD COLUMN entity_id INTEGER DEFAULT 1;

-- ── #105/#107: credit_overrides entity_id 추가 ─────────────────────────────
ALTER TABLE credit_overrides ADD COLUMN entity_id INTEGER DEFAULT 1;

-- ── entity_id 인덱스 ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_equipment_oee_daily_entity ON equipment_oee_daily(entity_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_entity ON chart_of_accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_defect_codes_entity ON defect_codes(entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_fifo_layers_entity ON inventory_fifo_layers(entity_id);
CREATE INDEX IF NOT EXISTS idx_credit_overrides_entity ON credit_overrides(entity_id);

-- ── #93: bank_transactions.matched_payment_id → payments DELETE 시 NULL 처리
-- D1/SQLite는 ALTER로 FK 추가 불가 → 라우트 코드에서 처리 (accounts-receivable.ts)
-- 아래는 참조 정합성 인덱스만 추가
CREATE INDEX IF NOT EXISTS idx_bank_tx_matched_payment ON bank_transactions(matched_payment_id);

-- ── #96: print_events.card_id 인덱스 (FK는 ALTER로 추가 불가)
CREATE INDEX IF NOT EXISTS idx_print_events_card_id ON print_events(card_id);

-- ── #94: caps_employee_map.site_id 인덱스
CREATE INDEX IF NOT EXISTS idx_caps_emp_map_site ON caps_employee_map(site_id);

-- ============================================================================
-- NOTE: D1(SQLite)는 ALTER TABLE ADD CONSTRAINT / ADD FOREIGN KEY 불지원.
-- FK 추가가 필요한 테이블(#94 caps_employee_map, #96 print_events, #93 bank_transactions,
-- #106 customer_claims/returns/waste_records/purchase_invoices)은
-- 테이블 재생성이 필요하나, 데이터 마이그레이션 위험이 높아 인덱스 + 라우트 코드 검증으로 대체.
-- ============================================================================
