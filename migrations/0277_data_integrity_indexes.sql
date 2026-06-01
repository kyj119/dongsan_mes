-- #313: 데이터정합성/조회 성능 인덱스 (대상 컬럼 프로덕션 존재 확인 완료)
CREATE INDEX IF NOT EXISTS idx_cards_order_item_id ON cards(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ai_analysis_id ON order_items(ai_analysis_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_buyer_client_id ON tax_invoices(buyer_client_id);
