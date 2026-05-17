-- Area 4 데이터 정합성 — 복합 인덱스 + depreciation_records entity_id 추가
-- 근거: 세 테이블 모두 entity_id+컬럼 복합 필터를 사용하나 단일 인덱스만 존재

-- approval_requests: entity_id + status + created_at 복합 인덱스
-- approvals.ts: WHERE entity_id=? AND status=? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_ar_entity_status_created
  ON approval_requests(entity_id, status, created_at DESC);

-- journal_entries: entity_id + entry_date 복합 인덱스
-- generalLedger.ts: WHERE entity_id=? AND entry_date>=? AND entry_date<=? ORDER BY entry_date DESC
CREATE INDEX IF NOT EXISTS idx_je_entity_date
  ON journal_entries(entity_id, entry_date DESC);

-- inventory_transactions: entity_id + item_id 복합 인덱스
-- 단일 entity 내 품목별 이력 조회 성능 개선 (entity_id 기존 컬럼, 인덱스 없음)
CREATE INDEX IF NOT EXISTS idx_inv_tx_entity_item
  ON inventory_transactions(entity_id, item_id);

-- depreciation_records: entity_id 컬럼 추가 + 인덱스
-- fixed_assets는 entity_id 있으나 depreciation_records 없어 멀티 entity 완전 격리 불가
ALTER TABLE depreciation_records ADD COLUMN entity_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_depr_entity ON depreciation_records(entity_id);

-- 기존 감가상각 레코드 backfill: 상위 fixed_assets의 entity_id 상속
UPDATE depreciation_records
SET entity_id = COALESCE(
  (SELECT entity_id FROM fixed_assets WHERE id = depreciation_records.asset_id),
  1
);
