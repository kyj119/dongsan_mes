-- Fix: Add missing entity_id indexes for performance
CREATE INDEX IF NOT EXISTS idx_cards_requesting_entity_id ON cards(requesting_entity_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_entity_id ON bank_accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_entity_id ON bank_transactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_cash_receipts_entity_id ON cash_receipts(entity_id);
