-- billing_status 및 상태 이력 앱 레벨 검증 강화
-- SQLite는 기존 테이블에 CHECK 추가 불가하므로 인덱스만 추가

-- billing_status에 인덱스 추가 (조회 성능 + 감사 추적)
CREATE INDEX IF NOT EXISTS idx_orders_billing_status ON orders(billing_status);

-- shipment_items에 인덱스 추가 (JOIN 성능)
CREATE INDEX IF NOT EXISTS idx_shipment_items_card_id ON shipment_items(card_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_order_item_id ON shipment_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);

-- tax_invoices에 order_id 인덱스 (삭제 검증 시 조회 성능)
CREATE INDEX IF NOT EXISTS idx_tax_invoices_order_id ON tax_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoice_orders_order_id ON tax_invoice_orders(order_id);
