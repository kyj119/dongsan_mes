-- #227: payment_requests.request_number UNIQUE를 entity별로 분리
-- 기존: inline UNIQUE on request_number (CREATE TABLE)
-- SQLite는 inline UNIQUE 제거 불가 → 복합 인덱스 추가로 향후 entity 분리 대비
-- 기존 UNIQUE는 유지되므로 cross-entity 중복은 여전히 방지됨 (현재 단일 entity 환경에서 무해)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_entity_request_number
  ON payment_requests(entity_id, request_number);
