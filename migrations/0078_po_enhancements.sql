-- ============================================================================
-- Migration 0078: 발주서 개선 - 납품요청일/납품장소 + 로고 설정키
-- ============================================================================

-- 발주서에 납품요청일, 납품장소 컬럼 추가
ALTER TABLE purchase_orders ADD COLUMN delivery_date TEXT;
ALTER TABLE purchase_orders ADD COLUMN delivery_location TEXT;

-- 회사 로고 이미지 (base64) 설정키
INSERT OR IGNORE INTO settings (setting_key, setting_value, description) VALUES
  ('company_logo_base64', '', '회사 로고 이미지 (base64)');
