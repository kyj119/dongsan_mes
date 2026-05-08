-- 0135: purchase_order_items에 창고/담당자/라인상태 추가
--
-- 배경 (2026-04-15 저녁):
--   하나의 PO에 여러 품목이 섞여 있을 때 창고/담당자별로 분업 입고 처리 필요.
--   라인 단위 진행 상태 추적 + 담당자 이력 기록.
--
-- storage_zones 는 이미 manager_id(FK→users) 를 가지고 있으므로 재사용.
-- items.storage_zone_id 도 이미 존재. PO 생성 시 품목의 기본 창고 상속.
--
-- 추가 컬럼:
--   purchase_order_items.storage_zone_id  — 라인이 들어갈 창고 (nullable, items에서 상속)
--   purchase_order_items.line_status      — 라인 진행 상태 (PENDING/PARTIAL/RECEIVED/CANCELLED)
--   purchase_order_items.received_by      — 마지막 입고 처리자
--   purchase_order_items.received_at      — 마지막 입고 처리 시각
--
-- 상태 매트릭스 (line_status):
--   PENDING   : 아직 입고 안 됨 (received_quantity = 0)
--   PARTIAL   : 부분 입고 (0 < received < ordered)
--   RECEIVED  : 전량 입고 완료 (received >= ordered)
--   CANCELLED : 취소된 라인 (PO 취소 또는 관리자 결정 CANCELLED)

-- ============================================================================
-- Step 1. 컬럼 추가
-- ============================================================================
ALTER TABLE purchase_order_items ADD COLUMN storage_zone_id INTEGER REFERENCES storage_zones(id) ON DELETE SET NULL;
ALTER TABLE purchase_order_items ADD COLUMN line_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(line_status IN ('PENDING','PARTIAL','RECEIVED','CANCELLED'));
ALTER TABLE purchase_order_items ADD COLUMN received_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE purchase_order_items ADD COLUMN received_at DATETIME;

-- ============================================================================
-- Step 2. 기존 데이터 backfill
-- ============================================================================
-- storage_zone_id: items 테이블에서 상속 (이미 items.storage_zone_id 있음)
UPDATE purchase_order_items
   SET storage_zone_id = (
     SELECT items.storage_zone_id FROM items WHERE items.id = purchase_order_items.item_id
   )
 WHERE storage_zone_id IS NULL AND item_id IS NOT NULL;

-- line_status: received_quantity 기준 결정
UPDATE purchase_order_items
   SET line_status = 'RECEIVED'
 WHERE received_quantity >= quantity AND received_quantity > 0;

UPDATE purchase_order_items
   SET line_status = 'PARTIAL'
 WHERE received_quantity > 0 AND received_quantity < quantity;

-- 나머지는 DEFAULT 'PENDING' 자동 적용됨 (received_quantity = 0)

-- ============================================================================
-- Step 3. 인덱스 (담당자 "내 할 일" 조회 최적화)
-- ============================================================================
-- 창고별 + 라인상태별 조회 (메인 쿼리: WHERE storage_zone_id = ? AND line_status IN ('PENDING','PARTIAL'))
CREATE INDEX IF NOT EXISTS idx_po_items_zone_status ON purchase_order_items(storage_zone_id, line_status);

-- PO별 라인 조회 (기존에 있을 가능성 있지만 멱등)
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(po_id);
