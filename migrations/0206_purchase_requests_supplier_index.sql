-- Migration 0206 — purchase_requests.supplier_id 인덱스 추가
-- supplier_id 기준 필터링 쿼리 풀스캔 방지 (Area 4 auto-fix)
CREATE INDEX IF NOT EXISTS idx_pr_supplier ON purchase_requests(supplier_id);
