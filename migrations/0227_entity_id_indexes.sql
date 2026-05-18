-- 0227: returns, waste_records entity_id 인덱스 추가
-- returns.entity_id, waste_records.entity_id 컬럼은 0214/0216에서 추가됐으나
-- entityFilter() 필터링 인덱스가 누락되어 entity당 전체 테이블 스캔 발생.

CREATE INDEX IF NOT EXISTS idx_returns_entity ON returns(entity_id);
CREATE INDEX IF NOT EXISTS idx_waste_records_entity ON waste_records(entity_id);
