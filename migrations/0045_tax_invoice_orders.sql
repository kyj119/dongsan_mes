-- ============================================================================
-- Migration 0045: 세금계산서 ↔ 주문 다대다 연결 (묶음 발행 지원)
-- ============================================================================

CREATE TABLE tax_invoice_orders (
  tax_invoice_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  PRIMARY KEY (tax_invoice_id, order_id),
  FOREIGN KEY (tax_invoice_id) REFERENCES tax_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX idx_tio_order ON tax_invoice_orders(order_id);

-- 기존 단건 세금계산서의 order_id를 junction 테이블로 마이그레이션
INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id)
  SELECT id, order_id FROM tax_invoices WHERE order_id > 0;
