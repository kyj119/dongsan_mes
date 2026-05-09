-- Phase 1.1: 즉시수금 증빙 유형 분류
-- 회계반영(BILLED) 시 어떤 증빙이 발급되었는지 기록하여 세무 정합성 확보
--
-- 값:
--   'TAX_INVOICE'  세금계산서
--   'CASH_RECEIPT' 현금영수증
--   'CARD'         신용/체크카드
--   'SIMPLE'       간이영수증
--   NULL           미분류 (기존 데이터 호환)

ALTER TABLE orders ADD COLUMN receipt_type TEXT;

-- 빠른 필터/통계용 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_receipt_type ON orders(receipt_type);
