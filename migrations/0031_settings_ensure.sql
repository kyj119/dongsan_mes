-- ============================================================================
-- Migration 0031: 거래 명세서 개선 - 누락 설정키 보장 + 인감도장
-- ============================================================================

-- seed.sql에서만 초기화되던 키들을 마이그레이션으로도 보장
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_name', '', '회사명');
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_phone', '', '대표 전화');
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_address', '', '회사 주소');

-- 인감도장 이미지 (base64) 설정키
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_stamp_base64', '', '인감도장 이미지 (base64)');
