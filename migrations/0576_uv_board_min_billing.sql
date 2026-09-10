-- 0576: UV 판재 계열을 **실규격 청구**로 (min_billing_side_cm = 0)
--
-- 무엇이 어긋나 있었나 — 「1m 미만 변은 1m 로 올려 청구」는 현수막·시트 계열의 규칙이고,
--   **판재는 실규격 그대로 청구한다**(용준님 확인). 그런데 그 예외가 `UV-JJN-06T` **한 품목에만**
--   설정돼 있었다. 나머지 판재는 1m 규칙이 걸린 채로 남아 있었다.
--
-- 실측(2026-01~07 · AREA 과금 판재 12종): **704라인 중 588건(84%)이 1m 미만**이다.
--   UV-FMX-8T-W · UV-ALM-2T-S · UV-PC-2T/3T-M · UV-JJN-09T 는 **100%** 가 1m 미만이다.
--   지금 MES 에서 포맥스 30×15cm 를 주문하면 1m×1m(1㎡)로 청구된다 — 실면적의 22배다.
--
-- 왜 지금까지 안 드러났나 — 주문이 전부 이관이라 `amount` 가 이미 확정된 값으로 들어왔다.
--   최소청구 규칙은 **MES 에서 새로 입력하는 주문**에만 작동하므로, 실사용이 시작되기 전에는
--   과청구가 나지 않는다. S2(주문 접수를 MES 로) 전에 고쳐 두는 것이 이 마이그레이션의 목적이다.
--
-- ⚠️ 이관 데이터의 `amount` 는 손대지 않는다 — 청구 정정이 아니라 **앞으로의 계산 규칙**을 맞추는 것이다.
--   저장된 원가(`material_cost` 등)도 영향받지 않는다(원가는 실면적 기준이라 최소청구와 무관).
--   바뀌는 것은 주문서에서 금액이 자동 계산될 때뿐이다(`utils/orderLineAmount` · `scripts/orderForm/calc.js`).
--
-- 대상 = UV 판재 7계열. 재단해서 파는 판재라 성격이 같다.
--   UV-FMX-*(포맥스) · UV-FOM-*(폼보드) · UV-JJN-*(자작나무) · UV-ACR-*(아크릴)
--   UV-SKS-*(스카시) · UV-PC-*(광확산PC) · UV-ALM-*(알마이트)
--
-- 되돌리기: `_bak_0576_min_billing` 에 원래 값이 있다(전부 100, JJN-06T 만 0).

CREATE TABLE IF NOT EXISTS _bak_0576_min_billing AS
SELECT id, item_code, item_name, min_billing_side_cm
  FROM items
 WHERE item_code LIKE 'UV-FMX-%' OR item_code LIKE 'UV-FOM-%' OR item_code LIKE 'UV-JJN-%'
    OR item_code LIKE 'UV-ACR-%' OR item_code LIKE 'UV-SKS-%' OR item_code LIKE 'UV-PC-%'
    OR item_code LIKE 'UV-ALM-%';

UPDATE items
   SET min_billing_side_cm = 0
 WHERE (item_code LIKE 'UV-FMX-%' OR item_code LIKE 'UV-FOM-%' OR item_code LIKE 'UV-JJN-%'
     OR item_code LIKE 'UV-ACR-%' OR item_code LIKE 'UV-SKS-%' OR item_code LIKE 'UV-PC-%'
     OR item_code LIKE 'UV-ALM-%')
   AND COALESCE(min_billing_side_cm, 100) <> 0;

-- ── 검증 ────────────────────────────────────────────────────────────────────
--  ① 판재 계열에 100 이 남아 있지 않아야 한다
--     SELECT COUNT(*) FROM items
--      WHERE (item_code LIKE 'UV-FMX-%' OR item_code LIKE 'UV-FOM-%' OR item_code LIKE 'UV-JJN-%'
--          OR item_code LIKE 'UV-ACR-%' OR item_code LIKE 'UV-SKS-%' OR item_code LIKE 'UV-PC-%'
--          OR item_code LIKE 'UV-ALM-%') AND COALESCE(min_billing_side_cm,100) <> 0;   → 0
--  ② 판재가 아닌 품목은 100 그대로여야 한다(현수막·시트는 최소청구가 살아 있어야 한다)
--     SELECT COUNT(*) FROM items WHERE pricing_method='AREA' AND COALESCE(min_billing_side_cm,100)=0
--       AND item_code NOT LIKE 'UV-FMX-%' AND item_code NOT LIKE 'UV-FOM-%'
--       AND item_code NOT LIKE 'UV-JJN-%' AND item_code NOT LIKE 'UV-ACR-%'
--       AND item_code NOT LIKE 'UV-SKS-%' AND item_code NOT LIKE 'UV-PC-%'
--       AND item_code NOT LIKE 'UV-ALM-%';   → 0
