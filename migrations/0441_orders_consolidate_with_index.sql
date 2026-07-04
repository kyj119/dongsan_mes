-- 0441: orders.consolidate_with_order_id 인덱스 (0438 형제 누락 보완)
-- 0437은 합포장 대표 참조 shipments.merged_into_id에 idx_shipments_merged_into를 만들었으나,
-- 0438 접수시점 합배송 예약 컬럼 orders.consolidate_with_order_id는 인덱스 없이 도입됨.
-- 이 컬럼은 다음 hot-path에서 = 조회/스캔됨(미인덱스 시 orders 풀스캔):
--   · shipments.ts:155-160 /daily 상관 서브쿼리 — 일별 주문 행마다 consolidate_partner_pending_date 산출
--   · shipmentHelper.ts:151 applyConsolidationIntents — 출고확정마다 파트너 조회 (OR consolidate_with_order_id = ?)
--   · shipments.ts:422 unmerge — 그룹 예약 해제 (WHERE ... AND consolidate_with_order_id IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_orders_consolidate_with ON orders(consolidate_with_order_id);
