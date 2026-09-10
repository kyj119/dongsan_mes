-- 0611: 입고에 **롤 수**를 받고, **발주 없이 들어온 건**을 표시한다 (Phase 2)
--
-- 0610 으로 발주는 「3롤」로 쓸 수 있게 됐다. 그 짝이 입고다.
--   · `purchase_order_items.received_packs` = 실제로 받은 롤 수.
--     원단은 **롤이 실물 개수**라 검수에서 「3롤 왔나」와 「길이가 맞나」를 갈라 봐야 한다.
--     길이(yd)는 이미 `received_quantity` 에 들어간다 — 그게 실측이고 재고의 정본이다.
--   · `purchase_orders.adhoc_source` = 이 발주가 **입고 화면에서 사후 생성**됐다는 표시.
--     NULL = 정상(사전 발주) · 'RECEIVING' = 물건이 먼저 와서 현장에서 만든 것.
--
-- 왜 막지 않고 표시하나 — 전화·현장 발주를 **차단하면 사람은 시스템 밖으로 나간다**.
--   이미 그렇게 됐다(최근 발주 2026-08-06 에서 멈추고 세무장부 이관만 들어옴).
--   그래서 「발주 없으면 입고 불가」가 아니라 **「그 자리에서 만들고 표시를 남긴다」** 로 간다.
--   한 달 치가 쌓이면 전화 발주가 몇 건·얼마인지 숫자로 나오고, **그 숫자가 규정의 근거**가 된다.
--   규정을 먼저 만들면 지켜졌는지 확인할 방법이 없다.
--
-- ⚠️ 재실행 시 ALTER 는 duplicate column 으로 실패한다(그 문장만 실패, 데이터는 무사).
-- 되돌리기: 둘 다 NULL 기본이라 남아 있어도 무해하다.

ALTER TABLE purchase_order_items ADD COLUMN received_packs REAL;
ALTER TABLE purchase_orders ADD COLUMN adhoc_source TEXT;

-- 검증: SELECT COUNT(*) FROM purchase_orders WHERE adhoc_source IS NOT NULL;   → 0 (신규)
