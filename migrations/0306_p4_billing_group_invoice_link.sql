-- P4: 세금계산서 ↔ 청구그룹 연결 (split billing)
-- 발행 단위를 (주문×법인) = order_billing_groups 로 전환.
-- 연결은 기존 order_billing_groups.tax_invoice_id FK 사용 (1 계산서 : N 그룹 관계라 FK로 충분).
-- 신규 테이블 없음. 데이터 백필만. 전부 멱등(WHERE ... IS NULL).
--
-- 백필 2종:
--  (1) 기존 백필 그룹의 supply_amount/tax_amount 채움 — 단일그룹 주문은 orders 금액 그대로.
--      (P1 백필이 billing_status/billed_amount만 복사 → supply/tax NULL. 혼합주문은 P2 recalc가 채움.)
--  (2) 기존 발행 계산서를 해당 그룹에 연결 (group.tax_invoice_id). 기존 주문=단일법인이라 1:1 매칭.

-- (1) 단일그룹 주문의 공급가/세액 = 주문 총액/부가세 (혼합주문은 다그룹이라 제외 → recalc 담당)
UPDATE order_billing_groups
SET supply_amount = (SELECT o.total_amount FROM orders o WHERE o.id = order_billing_groups.order_id),
    tax_amount    = (SELECT o.vat_amount   FROM orders o WHERE o.id = order_billing_groups.order_id)
WHERE supply_amount IS NULL
  AND (SELECT COUNT(*) FROM order_billing_groups g2 WHERE g2.order_id = order_billing_groups.order_id) = 1;

-- (2) 기존 활성 계산서 → 같은 법인 그룹에 연결 (order_id 직접 + tax_invoice_orders M:N 둘 다)
UPDATE order_billing_groups
SET tax_invoice_id = (
  SELECT ti.id FROM tax_invoices ti
  WHERE ti.entity_id = order_billing_groups.entity_id
    AND ti.status NOT IN ('CANCELLED')
    AND (
      ti.order_id = order_billing_groups.order_id
      OR EXISTS (SELECT 1 FROM tax_invoice_orders tio
                 WHERE tio.tax_invoice_id = ti.id AND tio.order_id = order_billing_groups.order_id)
    )
  ORDER BY ti.id DESC LIMIT 1
)
WHERE tax_invoice_id IS NULL
  AND EXISTS (
    SELECT 1 FROM tax_invoices ti
    WHERE ti.entity_id = order_billing_groups.entity_id
      AND ti.status NOT IN ('CANCELLED')
      AND (
        ti.order_id = order_billing_groups.order_id
        OR EXISTS (SELECT 1 FROM tax_invoice_orders tio
                   WHERE tio.tax_invoice_id = ti.id AND tio.order_id = order_billing_groups.order_id)
      )
  );

CREATE INDEX IF NOT EXISTS idx_obg_tax_invoice ON order_billing_groups(tax_invoice_id);
