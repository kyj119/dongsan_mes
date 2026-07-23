-- 까치발 규격변종(ACC-029-{size}) avg_unit_cost backfill — 0471 규격분리·발주 재매칭 후속.
-- backfill_avg_cost.sql(2026-07-19, prod 315품목)와 동일 공식/기준:
--   원가 = SUM(poi.amount)/SUM(poi.quantity) 가중평균, VAT 입력값 그대로(순액변환 X).
-- 소스: 선명 이관 매입 발주(0471에서 규격별 재매칭 완료). 매입이력 있는 11규격만 갱신, 나머지(150·200·250·350·500·1100·1300·1500·1600·1800·2000)는 0 유지.
-- 멱등: 매입 증가 시 재실행 가능. spec_value 있는 변종만 대상(base·색상스텁 제외).

UPDATE items SET avg_unit_cost = (
  SELECT ROUND(SUM(poi.amount) * 1.0 / NULLIF(SUM(poi.quantity), 0), 2)
  FROM purchase_order_items poi
  WHERE poi.item_id = items.id
    AND COALESCE(poi.unit_price, 0) > 0
    AND COALESCE(poi.quantity, 0) > 0
), updated_at = datetime('now')
WHERE item_code LIKE 'ACC-029-%' AND spec_value IS NOT NULL
  AND id IN (
    SELECT DISTINCT item_id FROM purchase_order_items
    WHERE item_id IS NOT NULL AND COALESCE(unit_price, 0) > 0 AND COALESCE(quantity, 0) > 0
  );
