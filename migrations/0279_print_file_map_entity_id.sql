-- #274: print_file_map 법인 격리 (멀티 entity 인쇄 파일 매핑 충돌 방지)
-- 기존 전역 UNIQUE(order_number, file_seq)는 ALTER로 제거 불가 → 법인별 복합 UNIQUE를 추가(additive)
ALTER TABLE print_file_map ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_print_file_map_entity ON print_file_map(entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_file_map_entity_order_seq
  ON print_file_map(entity_id, order_number, file_seq);
