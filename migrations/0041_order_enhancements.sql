-- ============================================================================
-- Migration: 0041 - 주문서 워크플로우 보강
-- #3 부분 출고: cards.shipped_at
-- #7 VAT 설정: settings에 vat_rate
-- ============================================================================

-- 카드별 출고 시각 추적
ALTER TABLE cards ADD COLUMN shipped_at DATETIME;

-- VAT 비율 설정 (기본 10%)
INSERT OR IGNORE INTO settings (setting_key, setting_value, description)
VALUES ('vat_rate', '0.10', 'VAT 세율 (기본 10%)');
