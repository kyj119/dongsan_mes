-- 0621 배송비를 출고 박스 수로 확정 (2026-09-17, 용준님 결정 「나」)
--
-- 배경: 배송비는 **주문 라인**인데 실제 배송은 **박스(출고 묶음)** 에서 일어난다. 축이 달라
--   ①합포장해도 두 주문에 각각 붙어 이중청구 ②수량을 안 세고 「1건 얼마」로 뭉쳐 적는다
--   (prod 2026 실측: 배송비 라인 1,625건 중 수량 1 이 1,520건 94% · 하우사인은 4,200원 × 665건).
--   → 「출고에서 입력한 박스 수가 그 주문 배송비 라인의 수량을 정한다」로 축을 맞춘다.
--
-- ① items.is_shipping_fee — 어떤 품목이 배송비인지 **마스터가 안다**(코드 하드코딩 금지).
--    지금은 ETC-SHIP(배송비 택배/화물) · ETC-EXP(긴급배송 용달/퀵) 둘. 늘어나면 체크만 켜면 된다.
-- ② order_items.fee_source — 'SHIPMENT_BOX' 면 **출고 박스 수가 이 라인의 수량을 덮는다**.
--    NULL(기본) = 종전 그대로 사람이 쓴 수량을 쓴다. 견적도 같은 칸을 둬 전환 때 그대로 넘어간다.
--    ★라인 표시라 품목 마스터가 나중에 바뀌어도 과거 주문의 규칙이 안 바뀐다(과금 규칙 스냅샷 0600 과 같은 축).

ALTER TABLE items ADD COLUMN is_shipping_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN fee_source TEXT;
ALTER TABLE quotation_items ADD COLUMN fee_source TEXT;

UPDATE items SET is_shipping_fee = 1 WHERE item_code IN ('ETC-SHIP', 'ETC-EXP');

-- 박스 수를 배송비로 쓰는 라인을 빨리 찾기 위한 인덱스(출고 저장 때마다 조회한다)
CREATE INDEX IF NOT EXISTS idx_order_items_fee_source ON order_items(order_id, fee_source) WHERE fee_source IS NOT NULL;
