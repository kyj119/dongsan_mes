-- #Area4: 누락 FK 인덱스 추가 (데이터 정합성 Area 4 자동 수정)
-- journal_entries entity_id 인덱스 (멀티테넌트 필터링 성능, HIGH)
CREATE INDEX IF NOT EXISTS idx_je_entity ON journal_entries(entity_id);

-- customer_claims FK 인덱스 (클레임-품질이슈/재작업 JOIN 성능)
CREATE INDEX IF NOT EXISTS idx_claims_quality_issue ON customer_claims(quality_issue_id);
CREATE INDEX IF NOT EXISTS idx_claims_rework_order ON customer_claims(rework_order_id);

-- waste_records material_item_id 인덱스 (자재별 로스율 분석 쿼리 성능)
CREATE INDEX IF NOT EXISTS idx_waste_material_item ON waste_records(material_item_id);

-- inventory_fifo_layers receipt_id 인덱스 (입고 기반 FIFO 레이어 조회 성능)
CREATE INDEX IF NOT EXISTS idx_fifo_receipt_id ON inventory_fifo_layers(receipt_id);

-- purchase_invoice_items FK 인덱스 (3-way matching 라인 아이템 매칭 성능)
CREATE INDEX IF NOT EXISTS idx_pii_po_item ON purchase_invoice_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_pii_item ON purchase_invoice_items(item_id);
