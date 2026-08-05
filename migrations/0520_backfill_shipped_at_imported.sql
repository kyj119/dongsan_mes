-- 0520: 이관 주문 shipped_at 백필 (status='SHIPPED'인데 출고시각 NULL = 데이터 모순)
--
-- 배경: 이카운트 이관분 8,653건이 status='SHIPPED' + shipped_at NULL 상태로 적재됐다.
--       `shipped_at IS NULL`을 "미출고"로 읽는 경로들(합배송 후보 등)이 과거 주문을
--       미출고로 판정해 접수 화면을 덮었다.
-- 값: 실제 출고시각은 이관 원장에 없다 → order_date 00:00 대입(추정치).
--     세금계산서 공급일자는 COALESCE(shipped_at, order_date)라 결과 불변.
--     shipped_at 기반 리드타임 통계는 이관분에 한해 추정치임에 유의.
-- 멱등: shipped_at IS NULL 조건으로 재실행 안전.

UPDATE orders
SET shipped_at = order_date || ' 00:00:00'
WHERE status = 'SHIPPED'
  AND shipped_at IS NULL
  AND order_date IS NOT NULL
  AND order_date != '';
