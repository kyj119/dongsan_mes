-- Phase 4: 거래처별 자동 회계반영 설정
-- 0: 수동 (기본), 1: 자동 (billable_after 도래 시 동기화로 자동 BILLED)
ALTER TABLE clients ADD COLUMN auto_billing INTEGER DEFAULT 0;
