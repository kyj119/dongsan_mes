-- 0397: 회계반영일(accounting_date) 분리 도입 (자금예측 감사 H4/H5/accounting-date 해결)
--   매출인식월·AR aging·캐시플로 입금예정의 기준일을 출고일/마킹시각(billed_at)에서 분리.
--   정본 = order_billing_groups.accounting_date, orders.accounting_date = 미러(billed_at과 동일 정책, P5후 제거 동반).
--   write 시 우선순위: 수동 override > 연결 세금계산서 issue_date > billable_after(정산가능일) > delivery_date > KST 오늘.
--   ⚠️ VAT 신고월은 tax_invoices.issue_date 유지 — 본 마이그레이션과 무관(미변경).
ALTER TABLE order_billing_groups ADD COLUMN accounting_date DATE;
ALTER TABLE orders ADD COLUMN accounting_date DATE;

-- backfill 1) 기존 청구(BILLED/PAID) 그룹: COALESCE(연결 계산서 issue_date, billed_at의 KST 일자)
UPDATE order_billing_groups
SET accounting_date = COALESCE(
  (SELECT ti.issue_date FROM tax_invoices ti WHERE ti.id = order_billing_groups.tax_invoice_id),
  date(billed_at, '+9 hours')
)
WHERE billed_at IS NOT NULL AND accounting_date IS NULL;

-- backfill 2) orders 미러: 해당 주문 그룹의 가장 이른 회계반영일
UPDATE orders
SET accounting_date = (
  SELECT g.accounting_date FROM order_billing_groups g
  WHERE g.order_id = orders.id AND g.accounting_date IS NOT NULL
  ORDER BY g.accounting_date LIMIT 1
)
WHERE billed_at IS NOT NULL AND accounting_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_obg_accounting_date ON order_billing_groups(accounting_date);
