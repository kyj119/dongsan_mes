-- ============================================================================
-- Migration 0361: 바로빌 계좌/카드 수집 등록 연동 상태
-- MES 자금관리/법인카드 페이지에서 계좌·카드 등록 시 바로빌(RegistBankAccountEx/
-- RegistCardEx)에 동시 수집등록. 인증정보(계좌비번/WebPwd)는 미저장 — 등록 결과
-- 상태(연동여부·수집주기·등록일시)만 보관.
-- ============================================================================

-- 계좌
ALTER TABLE bank_accounts ADD COLUMN barobill_registered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_accounts ADD COLUMN collect_cycle TEXT;
ALTER TABLE bank_accounts ADD COLUMN barobill_registered_at DATETIME;

-- 법인카드
ALTER TABLE corporate_cards ADD COLUMN barobill_registered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE corporate_cards ADD COLUMN collect_cycle TEXT;
ALTER TABLE corporate_cards ADD COLUMN barobill_registered_at DATETIME;
