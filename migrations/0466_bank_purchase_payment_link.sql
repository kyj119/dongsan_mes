-- ============================================================================
-- Migration 0466: bank 출금 ↔ 매입 지급(purchase_payments) 연결 + link-first 이중등록 방지
-- ============================================================================
-- matched_purchase_payment_id: 출금 적용 시 연결/생성된 purchase_payments.id (입금의 matched_payment_id와 대칭)
-- matched_link_mode: 'CREATED' = bank 적용이 원장 기록(payments/purchase_payments)을 새로 생성
--                    'LINKED'  = 기존 원장 기록에 연결만 (이관·수동 등록분 이중계상 방지)
--   unapply 시 CREATED만 원장 기록 삭제(+잔액 복원), LINKED는 링크 해제만.
--   기존 APPLIED 행(NULL)은 CREATED로 간주 (종전 동작 = 항상 생성).

ALTER TABLE bank_transactions ADD COLUMN matched_purchase_payment_id INTEGER;
ALTER TABLE bank_transactions ADD COLUMN matched_link_mode TEXT;

CREATE INDEX IF NOT EXISTS idx_bt_matched_pp ON bank_transactions(matched_purchase_payment_id);
