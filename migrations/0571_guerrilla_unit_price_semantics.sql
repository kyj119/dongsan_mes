-- 0571: 게릴라(173)로 옮긴 라인의 `unit_price` 를 **장당금액**으로 되돌린다
--
-- 무엇이 잘못됐나:
--   `0568`·`0569` 가 라인을 `AQ-BANNER`(AREA, ㎡단가) → `AQ-GERILLA`(FIXED, 장당가) 로 옮기면서
--   **`unit_price` 의 의미가 따라오지 않았다.** 이관 당시 품목이 AREA 였기 때문에 그 값은 ㎡단가다.
--   품목이 FIXED 가 되자 `/api/prices` 가 그 값을 **장당가로 그대로** 제시했다 —
--   prod 실측: 오케이애드공사 게릴라 직전가 **900원/장**(실제 4,500원). 4.5배 과소 제안.
--   138라인 중 의미가 맞는 건 **3건뿐**이었다(저장 평균 1,039 vs 실제 장당 4,683).
--
-- ★교훈: 과금축(`pricing_method`)이 다른 품목으로 라인을 옮기면 **금액은 그대로여도 단가의 뜻이 바뀐다.**
--   `amount` 만 보고 「총합 보존」을 확인했는데, 보존됐어야 할 것이 하나 더 있었다.
--   [[feedback-imported-unit-price-semantics]] 의 같은 함정이 방향만 반대로 나타난 것이다.
--
-- 안전성: `amount`(실제 청구액)는 **건드리지 않는다**. 이건 청구 정정이 아니라 단가 표기 정정이다.
--   기존 라인은 amount 가 정본이라 금액이 재계산되지 않는다.
--
-- 되돌리기: 되돌릴 이유가 없다(옮기기 전 값은 애초에 이 품목에서 의미가 없다).
--   그래도 필요하면 `_bak_0571_guerrilla_unit_price` 에 원값이 있다.

CREATE TABLE IF NOT EXISTS _bak_0571_guerrilla_unit_price AS
  SELECT id, unit_price FROM order_items WHERE item_id = 173;

UPDATE order_items
   SET unit_price = ROUND(amount / quantity)
 WHERE item_id = 173
   AND quantity > 0 AND amount > 0
   AND ABS(unit_price - amount / quantity) > 1;
