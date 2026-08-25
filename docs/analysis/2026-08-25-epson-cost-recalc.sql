-- 엡손 계열 원가 재산출 + 뭉침 껍데기 품목 정리 (2026-08-25, 전표 분해 후속)
--
-- 분해로 라인이 실수량·실단가를 갖게 됐으므로 avg_unit_cost 를 매입 가중평균으로 다시 채운다.
--   9140 잉크 = 3~4월 97,000 + 7월 101,900 혼합 → 색별 97,000~100,500 (W 는 333,467)
--   80610 잉크 = 선명 이관 73,000 + 한국엡손 71,200 혼합 → 72,100 (LM 62,700 · 클리닝 54,733)
-- ★`EPS-C13T51Y200`·`EPS-C13T891100` 은 월말 뭉침을 담으려고 만든 **껍데기**였다. 분해로 라인이
--   전부 빠져 매입 0 이 됐으므로 비활성화한다(삭제하지 않는다 — 이력 추적용).
--
-- 롤백: 백업 `_bak_0825_epson_cost` 로 avg_unit_cost·is_active 복원.

CREATE TABLE IF NOT EXISTS _bak_0825_epson_cost AS
SELECT id, item_code, item_name, avg_unit_cost, is_active, datetime('now') AS saved_at
  FROM items
 WHERE item_code LIKE 'RM-I00%' OR item_code LIKE 'GDS-EQ-EPS%' OR item_code LIKE 'EPS-C13%';

-- 매입 라인이 있는 엡손 품목의 원가 = SUM(amount) / SUM(quantity)
UPDATE items
   SET avg_unit_cost = (
         SELECT ROUND(SUM(poi.amount) * 1.0 / NULLIF(SUM(poi.quantity), 0), 2)
           FROM purchase_order_items poi
          WHERE poi.item_id = items.id),
       updated_at = CURRENT_TIMESTAMP
 WHERE (item_code LIKE 'RM-I00%' OR item_code LIKE 'GDS-EQ-EPS%')
   AND EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi.item_id = items.id)
   AND (item_name LIKE '%9140%' OR item_name LIKE '%80610%' OR item_name LIKE '%클리닝%'
        OR item_code LIKE 'GDS-EQ-EPS%');

-- 뭉침 껍데기 2종 비활성화 (매입 라인 0 확인 후)
UPDATE items
   SET is_active = 0,
       search_keywords = TRIM(COALESCE(search_keywords, '') || ' 폐기 월말뭉침 껍데기 2026-08-25분해'),
       updated_at = CURRENT_TIMESTAMP
 WHERE item_code IN ('EPS-C13T51Y200', 'EPS-C13T891100')
   AND NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi.item_id = items.id);
