-- 0567: 완료된 발주의 라인 상태를 실제 입고량에 맞춘다 (PENDING → RECEIVED)
--
-- 무엇인가 = 발주 상태가 `RECEIVED` 인데 라인은 `PENDING` 인 것이 **858줄**이고,
--   그중 **857줄이 `received_quantity >= quantity`** 다. 즉 **이미 다 받았는데 라인 상태만 안 채워졌다**.
--   이관 경로(SmartA·선명 이관)가 수량은 채우고 `line_status` 는 안 썼다.
--
-- 왜 고치나 = 배지·입고 큐는 `po.status IN ('CONFIRMED','PARTIAL_RECEIVED')` 도 같이 보므로
--   **이 줄들 때문에 큐가 오염되지는 않는다**. 문제는 화면이다 —
--   발주 상세(`scripts/purchaseOrders.js:324,355`)와 입고 화면(`receiving.js:988`)이 라인마다
--   상태 배지를 그리고 「완료 라인 수」를 센다. 완료된 발주가 **857줄 「미입고」로 보인다**.
--
-- ⚠️ 근거가 있는 것만 고친다 — `received_quantity >= quantity` 인 줄만.
--    나머지 2줄(하나는 입고 0, 하나는 부분입고)은 **손대지 않는다**. 무엇이 맞는지 모른다.
-- ⚠️ 취소 발주(CANCELLED)의 PENDING 159줄도 **손대지 않는다**. 수량이 채워져 있어 이상하지만
--    취소된 발주를 「입고 완료」로 바꾸는 건 뜻이 다르고, 화면에서도 취소로 먼저 읽힌다.
-- ⚠️ 반대 방향 불일치도 있다 — `RECEIVED/RECEIVED` 1,906줄 중 **83줄이 `received_quantity = 0`**.
--    이건 상태가 앞서고 수량이 빈 것이라, 고치면 「받았다」를 지우는 셈이다. 기록만 남긴다.
--
-- ⚠️ 되돌리기 = UPDATE purchase_order_items SET line_status = 'PENDING'
--               WHERE id IN (SELECT id FROM _bak_0567_line_status);

DROP TABLE IF EXISTS _bak_0567_line_status;
CREATE TABLE _bak_0567_line_status AS
  SELECT poi.id, poi.line_status
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.po_id
   WHERE po.status = 'RECEIVED'
     AND poi.line_status = 'PENDING'
     AND COALESCE(poi.received_quantity, 0) >= poi.quantity;

UPDATE purchase_order_items
   SET line_status = 'RECEIVED'
 WHERE id IN (SELECT id FROM _bak_0567_line_status);
