-- 0387_payments_tax_invoice_link.sql
-- 발행↔입금 매칭 (Phase 3): payments 입금건을 발행 세금계산서에 수동 연결.
-- 자동확정 아님 — 자동제안 + 수동확정(연결/해제)만. 단순 nullable 컬럼 + 인덱스(추가만=안전, 멱등 불가하므로 1회 적용).
-- payments(0002): tax_invoice_id 없음 → 신규 nullable 컬럼 추가. FK 미설정(컬럼+인덱스로 충분, dangling 위험은 해제로 회피).

ALTER TABLE payments ADD COLUMN tax_invoice_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_payments_tax_invoice ON payments(tax_invoice_id);
