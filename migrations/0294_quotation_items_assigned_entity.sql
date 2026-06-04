-- 0294: quotation_items에 assigned_entity_id 추가 (견적 단계 품목별 담당 법인)
-- 사유: 주문접수 법인협업 — 견적 단계에서 품목별 담당 법인을 지정하고
--       견적→주문 전환 시 order_items.assigned_entity_id로 carry-over.
--       유통/생산 주문폼은 이미 담당 지정 가능, 견적폼도 동일 패턴 확장.
ALTER TABLE quotation_items ADD COLUMN assigned_entity_id INTEGER;
