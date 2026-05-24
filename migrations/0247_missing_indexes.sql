-- #182: 누락된 FK 인덱스 추가 (조인 풀스캔 방지)
CREATE INDEX IF NOT EXISTS idx_iri_receipt ON inventory_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_iri_item ON inventory_receipt_items(item_id);
CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id);
