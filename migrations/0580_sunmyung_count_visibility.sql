-- 0580: 선명(E2) 실사에서 **보이지도 않던 35품목**에 재고 행(0)을 만든다
--
-- 왜 필요한가 (2026-09-07):
--   구역 실사는 `items JOIN inventory` **INNER JOIN** 이다(`inventoryCount.ts:418`).
--   재고 행이 없는 품목은 실사지에 **아예 뜨지 않는다** — 창고에 실물이 있어도 셀 대상이 안 된다.
--   (전수·분류 실사는 행이 없어도 나오지만, 법인 스코프가 없어 768~1,106품목을 뽑아 실사에 못 쓴다.)
--
--   선명은 8월 이후 **판매 467라인 7,595만원**이 있는데, 그중 35품목은 E2 재고 행이 **0행**이다.
--   ECB-T-070 친환경 현수막원단 551만 · SGM-LEDF-F20S LED형광등 475만 · SGM-TRB 트러스바 283만 …
--   팔렸다는 건 실물이 있었다는 뜻인데 실사지에는 없다.
--
-- ★대상 판정 — `deduction_method` 로 거르지 않는다. `NONE` 은 「자동차감 안 함」이지
--   「재고가 아님」이 아니다. 배너대·트러스바·LED·도안지·까치발이 전부 NONE 이고 **전부 실물**이다.
--   빼는 것은 서비스성 의사품목 `ETC-*`(재단/컷팅비 · 기타 부자재) **2건**뿐이다.
--
-- 안전성:
--   · 수량 0 으로만 만든다 — 재고 총량·평가액이 바뀌지 않는다.
--   · 원장(`inventory_transactions`)은 만들지 않는다. **움직임이 없었으므로 남길 것도 없다.**
--   · `idx_inventory_item_entity_zone` UNIQUE(item_id, entity_id, IFNULL(zone,0)) 가 있고
--     `NOT EXISTS` 로 막았으므로 재실행해도 늘지 않는다(멱등).
--   · 되돌리기 = `DELETE FROM inventory WHERE entity_id=2 AND storage_zone_id=4 AND quantity=0`
--     (단, 실사 전에만 — 실사 후에는 사람이 센 값이 들어 있다).
--
-- 결과: 선명2 구역 실사 라인 212 → **247**.

INSERT INTO inventory (item_id, quantity, entity_id, storage_zone_id, last_updated)
SELECT i.id, 0, 2, 4, datetime('now', '+9 hours')
  FROM items i
 WHERE i.is_active = 1
   AND i.is_purchase_item = 1
   AND i.item_type IN ('MATERIAL', 'GOODS')
   AND i.item_code NOT LIKE 'ETC-%'
   AND EXISTS (
     SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.item_id = i.id AND o.entity_id = 2
        AND o.order_date >= '2026-08-01' AND o.status <> 'CANCELLED')
   AND NOT EXISTS (
     SELECT 1 FROM inventory v WHERE v.item_id = i.id AND v.entity_id = 2);

-- ── 0579 에 남긴 메모 정정 ────────────────────────────────────────────────────
-- 0579 는 규격 칸에 「재고 1롤 폭 확인 대기」라고 적었는데, **그 「1롤」이 근거가 없다**.
-- 그 값(`inventory` 행 228, 마지막 갱신 2026-08-11)은 이후 7롤이 출고된 뒤에도 그대로다 —
-- 선명 주문은 이관분이라 차감 경로를 타지 않아 **재고가 갱신되지 않는다**(원장 E2 전체 14행).
-- 실물 수량은 실사로만 알 수 있으므로, 메모를 「실사에서 폭별로 이관」으로 바꾼다.
UPDATE items
   SET specification = '무광·폭 분리됨(105/127)·실사 IC-20260907171440 에서 폭별 이관'
 WHERE item_code = 'SPM011M';
