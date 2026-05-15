-- ============================================================================
-- Migration 0206 — 복합 인덱스 추가 (대시보드 성능 최적화)
-- Area 4 데이터 정합성 점검 결과 (auto-improve 2026-05-15)
-- ----------------------------------------------------------------------------
-- 대시보드 GET /api/dashboard/stats 가 orders 테이블에 16개 서브쿼리를 실행하는데
-- 각각 entity_id + status/date 복합 조건임에도 단일 컬럼 인덱스만 존재함.
-- SQLite 옵티마이저는 한 테이블에 인덱스 하나만 선택하므로
-- (entity_id, status) 복합 인덱스가 없으면 entity_id 인덱스로 후보 추출 후
-- status 조건을 row-level 필터링 → 불필요한 row scan 발생.
-- ============================================================================

-- 1. orders (entity_id, status) — 대시보드 8개 subquery 커버
CREATE INDEX IF NOT EXISTS idx_orders_entity_status
  ON orders(entity_id, status);

-- 2. orders (entity_id, created_at) — 월별/주별 집계 쿼리 커버
--    strftime() 자체는 인덱스 불가이나, entity_id 필터 후 created_at 범위 스캔
CREATE INDEX IF NOT EXISTS idx_orders_entity_created
  ON orders(entity_id, created_at DESC);

-- 3. cards (requesting_entity_id, status) — 대시보드 5개 subquery 커버
--    idx_cards_requesting_entity_id 단일 인덱스 → 복합으로 보완
CREATE INDEX IF NOT EXISTS idx_cards_entity_status
  ON cards(requesting_entity_id, status);

-- 4. print_method_media(print_media_id) — 소재 비활성화 DELETE 시 풀스캔 방지
--    UNIQUE(print_method_id, print_media_id) 의 leading column이 print_method_id라서
--    print_media_id 단독 조건은 인덱스 미사용
CREATE INDEX IF NOT EXISTS idx_print_method_media_media_id
  ON print_method_media(print_media_id);
