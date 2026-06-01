-- #287: 발주번호/견적번호 법인별 UNIQUE. 기존 전역 UNIQUE는 ALTER로 제거 불가 → 법인별 복합 UNIQUE 추가(additive).
-- 생성기(getNextSeqNumber)도 entityId별 카운터로 전환(코드 변경 동반).
CREATE UNIQUE INDEX IF NOT EXISTS idx_po_entity_number
  ON purchase_orders(entity_id, po_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotation_entity_number
  ON quotations(entity_id, quotation_number);
