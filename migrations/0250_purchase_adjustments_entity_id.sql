-- #191: purchase_adjustments에 entity_id 추가
-- 멱등성: ALTER TABLE은 이미 컬럼이 있으면 에러 → D1에서는 중복 실행 시 스킵됨
ALTER TABLE purchase_adjustments ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_purchase_adjustments_entity ON purchase_adjustments(entity_id);
