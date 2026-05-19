-- 0231: 누락된 entity_id 인덱스 추가
-- journal_entries, hometax_jobs 테이블에 entity_id 인덱스가 없어
-- 멀티사업자 환경에서 entity_id 필터 쿼리 시 전체 테이블 스캔 발생

-- journal_entries: generalLedger.ts 모든 목록 조회에서 entityFilter(c) 사용
CREATE INDEX IF NOT EXISTS idx_je_entity_id ON journal_entries(entity_id);

-- hometax_jobs: hometaxInvoices.ts 작업 목록/카운트 조회에서 entityFilter(c, 'hj') 사용
CREATE INDEX IF NOT EXISTS idx_hometax_jobs_entity ON hometax_jobs(entity_id);
