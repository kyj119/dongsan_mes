-- 0527: 2026-07 증분 이관분 shipped_at 백필 (2026-08-09)
--
-- 0520 이 상반기 8,653건을 같은 규칙으로 채웠는데, 7월 증분 이관(2026-07-30)이 그 뒤에 들어와
-- 1,420건이 NULL 로 남았다. status='SHIPPED' + shipped_at NULL 은 데이터 모순이고,
-- `shipped_at IS NULL` 을 "미출고"로 읽는 경로(합배송 후보 등)가 과거 주문을 미출고로 판정한다.
--
-- ⚠️ 값은 실제 출고시각이 아니라 **거래일 추정치**다. 이카운트 원본에 출고일이라는 항목 자체가 없다
--    (판매현황은 전표일자 하나뿐 — gen_sales_sql.py 가 order_date·accounting_date·billed_at 에 같은 날짜를 쓴다).
--    실측: prod status='SHIPPED' 중 실제 시각을 가진 행은 **0건**, 전부 `order_date 00:00:00` 패턴이다.
--
-- ⚠️ 그래서 추정치는 화면에서 「추정」으로 드러낸다 — `shipped_at = order_date || ' 00:00:00'` 이 그 지문이다.
--    (출고 이력 탭 = docs/specs/2026-08-09-shipment-history-list.md §2-2)
--    실제 출고 시각이 기록되기 시작하면 시분초가 00:00:00 이 아니게 되어 자동으로 「추정」이 빠진다.
--
-- 멱등: shipped_at IS NULL 조건이라 재실행 안전. 0520 과 규칙 동일.

UPDATE orders
SET shipped_at = order_date || ' 00:00:00'
WHERE status = 'SHIPPED'
  AND shipped_at IS NULL
  AND order_date IS NOT NULL
  AND order_date != '';
