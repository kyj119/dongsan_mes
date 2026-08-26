-- ============================================================================
-- 2026-08-26 판매플래그 불일치 3건 정정 — 팔리는데 `is_sales_item=0` 이던 품목
--
-- 배경: `audit:items` 건강지표 「판매플래그 불일치」가 3 을 가리키고 있었다.
--       셋 다 MATERIAL 이라 주문서 선택기 기본 필터(`exclude_type=MATERIAL`)에 안 걸리는데,
--       **「원자재 포함」을 켜도 `type=sales` 조건에서 다시 걸러져 아예 못 찾는다**.
--       → 다음에 같은 물건을 팔 때 **또 새 품목을 만들게 된다**(감사 스크립트 도입 사유 그대로).
--
-- 실측 (prod 조회):
--   `SGM-SMPS-W400` 외부용 SMPS(방수) 400wt — **판매 15라인 · 거래처 12곳 · 45,000 정찰**
--                                              2026-01-06 ~ 07-02 · e1·e2 양쪽. 명백한 상시 판매품
--   `SGM-SMPS-W500` 외부용 SMPS(방수) 500wt — 판매 6라인 · 거래처 5곳 · 50,000 → 55,000(04-30 인상)
--   `RM-I0081`     엡손 솔벤 클리닝액      — 판매 **1라인**(2026-04-28 반산기획 65,000)
--       ⚠️일회성이다. 다만 반산기획은 03-24 에 EP1852 프린터를 사 간 곳이라 소모품 재구매 여지가 있고,
--         MATERIAL 은 선택기 기본에서 여전히 제외되므로 켜도 목록이 어지러워지지 않는다.
--         **아니라고 판단되면 이 한 줄만 되돌리면 된다**(아래 롤백).
--
-- ★`item_type` 은 건드리지 않는다 — MATERIAL + `is_sales_item=1` 은 겹업(원자재 그대로 판매)이라
--   정상 조합이다. enum 으로 접으면 안 된다 → [[design-item-role-multi-flag]]
--
-- 백업: _bak_0826_salesflag (3행)
-- ============================================================================

CREATE TABLE IF NOT EXISTS _bak_0826_salesflag AS
SELECT id, item_code, item_name, item_type, is_sales_item, is_purchase_item
FROM items WHERE item_code IN ('SGM-SMPS-W400', 'SGM-SMPS-W500', 'RM-I0081');

UPDATE items SET is_sales_item = 1, updated_at = datetime('now', '+9 hours')
WHERE item_code IN ('SGM-SMPS-W400', 'SGM-SMPS-W500', 'RM-I0081')
  AND is_sales_item = 0;

-- 검증: 아래가 0 행이어야 한다
-- SELECT item_code FROM items i WHERE i.is_active=1 AND i.is_sales_item=0
--   AND EXISTS(SELECT 1 FROM order_items o WHERE o.item_id=i.id);

-- ── 롤백 (전량) ─────────────────────────────────────────────────────────────
-- UPDATE items SET is_sales_item = (SELECT b.is_sales_item FROM _bak_0826_salesflag b WHERE b.id = items.id)
-- WHERE id IN (SELECT id FROM _bak_0826_salesflag);
--
-- ── 롤백 (클리닝액만) ───────────────────────────────────────────────────────
-- UPDATE items SET is_sales_item = 0 WHERE item_code = 'RM-I0081';
