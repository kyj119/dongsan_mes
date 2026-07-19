-- 품목 원가(items.avg_unit_cost) backfill — 매입 실적(purchase_order_items) 기반
-- 2026-07-19 최초 적용 (prod, 315개 품목). 재실행 멱등(매입 증가 시 주기적 재실행 가능).
--
-- 방식: 품목별 가중평균 = SUM(amount)/SUM(quantity)  (recalculate-avg 이동평균 공식과 동일)
-- 소스: purchase_order_items (당시 2026-01~06, 6개월). inventory_transactions는 가격 IN이 비어
--       designed recalculate-avg가 동작 못 함 → 매입 원장에서 직접 backfill.
-- VAT: 입력값 그대로(데이터 vat_amount=0, 실거래액=선명 미지급 정합, 매출 order_items와 동일 기준). 순액 변환 안 함.
-- 범위: 매입이력 있는 품목만 갱신, 없는 품목(당시 514개)은 미변경(0 유지, 추후 수동/규칙).
--
-- ⚠️ 향후 정식화: 매입 입고 → inventory_transactions IN 기록 → recalculate-avg 자동화(Policy B, 6월초 재고 baseline 필요).
--    현재는 그 정식 파이프라인 미가동이라 이 직접 backfill로 대체.

UPDATE items SET avg_unit_cost = (
  SELECT ROUND(SUM(poi.amount) * 1.0 / NULLIF(SUM(poi.quantity), 0), 2)
  FROM purchase_order_items poi
  WHERE poi.item_id = items.id
    AND COALESCE(poi.unit_price, 0) > 0
    AND COALESCE(poi.quantity, 0) > 0
)
WHERE id IN (
  SELECT DISTINCT item_id FROM purchase_order_items
  WHERE item_id IS NOT NULL AND COALESCE(unit_price, 0) > 0 AND COALESCE(quantity, 0) > 0
);
