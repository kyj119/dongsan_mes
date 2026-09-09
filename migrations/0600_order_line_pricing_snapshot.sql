-- 0600: 주문 라인에 **과금 규칙 스냅샷**을 둔다 (`pricing_method` · `min_billing_side_cm`)
--
-- 무엇이 잘못됐나:
--   `order_items` 는 이미 스냅샷 테이블이다 — `item_name`·`category_name`·`unit` 을 품목에서 복사해 둔다.
--   그런데 **`unit_price` 를 해석하는 유일한 키인 과금 규칙만 빠져 있어서**, 금액을 재계산할 때마다
--   `items` 를 조인해 **오늘의 축**으로 과거를 다시 읽는다(`create.ts:128`·`update.ts:165`).
--   그래서 품목의 축을 한 번 건드리면 **과거 주문 전량의 단가 의미가 조용히 바뀐다.**
--   2026-09-08~09 이틀 동안 실제로 두 번 겪었다 — UV 판재 최소청구 변경 501건 · 거치대 6종 재배치 231건.
--
--   ★견적은 이미 제대로 하고 있었다: `quotation_items.pricing_method`(`0191`)가 있고
--     `quotations.ts:293·347·449` 가 **라인 스냅샷으로 계산**한다. 주문만 예외였다.
--
-- 왜 스냅샷이 옳은가 — 축 변경에는 성격이 다른 둘이 있는데 지금은 구분할 방법이 없다:
--     ① 정정  = 원래 장당 팔던 걸 AREA 로 잘못 넣었다 → 과거도 다시 읽는 게 맞다
--     ② 정책변경 = 오늘부터 실면적으로 청구한다      → 과거는 그대로 둬야 한다
--   스냅샷이 있으면 감사가 「라인 축 ≠ 품목 축」을 띄우고 **사람이 고른다**. 없으면 늘 ①로 처리된다.
--
-- 백필 = 품목 현재값. ★지금이 안전한 유일한 창이다 —
--   `audit:unit-price-semantics` 가 방금 **정정 가능 0건**이라, 지금 데이터는 품목 현재 축과 정합한다.
--   다음에 축이 틀어진 뒤 넣으면 **어긋난 상태를 스냅샷으로 굳히게** 된다.
--
-- 안전성: 컬럼 추가 + 백필뿐이다. 금액·단가는 **건드리지 않는다**. 읽는 쪽이 아직 이 컬럼을 안 보므로
--   이 마이그 단독으로는 동작이 전혀 바뀌지 않는다(코드 배포와 순서 의존 없음).
-- 멱등: `IF NOT EXISTS` 가 없는 SQLite ADD COLUMN 이라, 재실행 시 "duplicate column" 으로 멈춘다 —
--   그게 맞는 동작이다(이미 적용됐다는 뜻). 백필은 NULL 인 행만 채우므로 몇 번 돌려도 같다.

ALTER TABLE order_items ADD COLUMN pricing_method TEXT;
ALTER TABLE order_items ADD COLUMN min_billing_side_cm INTEGER;

-- 백필 — 품목이 연결된 라인만. 품목이 없는 라인(340건)은 FIXED 로 계산되므로 NULL 이 곧 그 뜻이다.
UPDATE order_items
   SET pricing_method = (SELECT i.pricing_method FROM items i WHERE i.id = order_items.item_id)
 WHERE pricing_method IS NULL
   AND item_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM items i WHERE i.id = order_items.item_id AND i.pricing_method IS NOT NULL);

UPDATE order_items
   SET min_billing_side_cm = (SELECT i.min_billing_side_cm FROM items i WHERE i.id = order_items.item_id)
 WHERE min_billing_side_cm IS NULL
   AND item_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM items i WHERE i.id = order_items.item_id AND i.min_billing_side_cm IS NOT NULL);
