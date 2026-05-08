-- ============================================================================
-- Migration: 0038 - 주문별 연락처 전화번호/휴대전화 컬럼 추가
-- 거래처 선택 시 자동 채움, 주문별 개별 수정 가능
-- ============================================================================

ALTER TABLE orders ADD COLUMN contact_phone TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN contact_mobile TEXT DEFAULT NULL;
