-- ============================================================================
-- Migration 0030: 거래 명세서 지원 - 사업자등록번호 및 회사 설정 추가
-- ============================================================================

-- clients 테이블에 사업자등록번호 추가
ALTER TABLE clients ADD COLUMN business_registration_number TEXT DEFAULT NULL;

-- 회사 설정 추가 (거래명세서용)
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_business_registration_number', '', '사업자등록번호');
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_representative', '', '대표자');
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_business_type', '', '업태');
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_business_item', '', '종목');
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_fax', '', '팩스번호');
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_bank_info', '', '입금계좌 (은행명 계좌번호 예금주)');
