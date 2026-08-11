-- 이관 AREA 라인의 unit_price 를 장당금액 → ㎡단가로 정정
--
-- 문제: 이카운트 이관분은 `amount = unit_price × quantity` (FIXED 방식)로 저장돼 있는데
--       품목은 `pricing_method='AREA'` 다. prod 실측 = AREA 규격보유 13,449건 중
--       **AREA 방식으로 저장된 라인 0건** · fixed 방식 12,132 · 면적1㎡라 양쪽 성립 1,309 · 예외 8.
--
-- 증상(이 마이그레이션이 막는 것): 이관 주문을 화면에서 수정하면 computeLineAmount 가 AREA 로
--       재계산해 `auto` 가 몇 배로 잡히고(600×90 짜리 8,000 → 48,000), 화면이 보낸 기존 amount 가
--       `final` 이 되어 **차액이 통째로 line_discount(에누리)로 기록**된다. 실적·원가가 오염된다.
--       아직 아무도 이관 주문을 수정하지 않아 드러나지 않았을 뿐이다.
--
-- 방법: unit_price = amount ÷ (청구면적 × 수량). 청구면적 = 10cm 올림 + 최소 1m
--       (utils/orderLineAmount.ts billingSide() 와 같은 규칙).
--       ★amount 는 건드리지 않는다 — 실제 청구액이고 이카운트 대사의 기준값이다
--         (거래처별 818곳 잔액 오차 0 이 이 값 위에 서 있다).
--
-- 정확도 실측: 변환 후 AREA 로 재계산하면 13,265/13,449(98.6%)가 원 금액과 **정확히 일치**,
--       99.8%가 ±100원 이내. 나머지는 100원 반올림 잔차다.
--
-- 대상 = "AREA 방식으로 저장돼 있지 않은" 라인만. 신규 주문(정상 AREA 저장)은 조건에서 빠진다.
--       면적이 정확히 1㎡ 인 라인은 두 방식의 값이 같아 애초에 걸리지 않는다(변환해도 불변).
--
-- 멱등: 재실행 = no-op.
--   ⚠️ "AREA 방식이 되면 조건에서 빠진다"만으로는 부족했다 — 100원 반올림 때문에 변환 후에도
--      184건이 계속 조건에 걸려 같은 값을 다시 쓴다(값은 수렴하므로 무해하지만 rows_written 이 0 이 아니다).
--      그래서 **이미 목표값인 라인은 제외**하는 조건을 따로 둔다.
-- 되돌리기:
--   UPDATE order_items SET unit_price = (
--     SELECT old_unit_price FROM _bak_0530_unit_price b WHERE b.order_item_id = order_items.id)
--    WHERE id IN (SELECT order_item_id FROM _bak_0530_unit_price);

CREATE TABLE IF NOT EXISTS _bak_0530_unit_price (
  order_item_id  INTEGER PRIMARY KEY,
  old_unit_price REAL
);

INSERT OR IGNORE INTO _bak_0530_unit_price (order_item_id, old_unit_price)
SELECT oi.id, oi.unit_price
  FROM order_items oi
  JOIN items i ON i.id = oi.item_id
 WHERE i.pricing_method = 'AREA'
   AND oi.unit_price > 0
   AND COALESCE(oi.width, 0)  > 0
   AND COALESCE(oi.height, 0) > 0
   AND COALESCE(oi.quantity, 0) > 0
   AND oi.amount <> 0
   AND ABS(oi.amount - CAST(ROUND(
         oi.unit_price
         * (MAX(CAST((oi.width  + 9) / 10 AS INT) * 10, 100) / 100.0)
         * (MAX(CAST((oi.height + 9) / 10 AS INT) * 10, 100) / 100.0)
         * oi.quantity / 100.0) AS INT) * 100) >= 1;

UPDATE order_items
   SET unit_price = ROUND(
         amount / (
           (MAX(CAST((width  + 9) / 10 AS INT) * 10, 100) / 100.0)
         * (MAX(CAST((height + 9) / 10 AS INT) * 10, 100) / 100.0)
         * quantity ) ),
       updated_at = datetime('now')
 WHERE id IN (
   SELECT oi.id
     FROM order_items oi
     JOIN items i ON i.id = oi.item_id
    WHERE i.pricing_method = 'AREA'
      AND oi.unit_price > 0
      AND COALESCE(oi.width, 0)  > 0
      AND COALESCE(oi.height, 0) > 0
      AND COALESCE(oi.quantity, 0) > 0
      AND oi.amount <> 0
      AND ABS(oi.amount - CAST(ROUND(
            oi.unit_price
            * (MAX(CAST((oi.width  + 9) / 10 AS INT) * 10, 100) / 100.0)
            * (MAX(CAST((oi.height + 9) / 10 AS INT) * 10, 100) / 100.0)
            * oi.quantity / 100.0) AS INT) * 100) >= 1
      -- 이미 목표값이면 건드리지 않는다(재실행 시 같은 값 재기록 방지 — 위 멱등 주석 참조)
      AND oi.unit_price <> ROUND(
            oi.amount / (
              (MAX(CAST((oi.width  + 9) / 10 AS INT) * 10, 100) / 100.0)
            * (MAX(CAST((oi.height + 9) / 10 AS INT) * 10, 100) / 100.0)
            * oi.quantity ) )
 );

-- auto_amount 도 맞춰 둔다. 이관 백필로 amount 가 그대로 들어가 있는데, 이 값이 어긋나 있으면
-- 화면이 "이미 에누리가 걸린 행"으로 그린다(dataset.autoAmount 가 합계·강조의 기준이다).
UPDATE order_items
   SET auto_amount = amount
 WHERE id IN (SELECT order_item_id FROM _bak_0530_unit_price)
   AND COALESCE(auto_amount, 0) <> amount;
