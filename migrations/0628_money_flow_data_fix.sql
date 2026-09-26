-- 0628 돈 흐름 데이터 정정 (2026-09-27, 감사 = docs/audits/2026-09-26-money-flow.md §prod 실데이터 대사)
--
-- 사용자 확정(2026-09-27): D1·D2·D4·D5·D6·D7. 모든 문장은 **대상 행의 값까지** 조건으로 걸어
-- 다른 DB(로컬·CI 부트스트랩)에서는 no-op 이고, 두 번 돌려도 두 번째는 no-op 이다.
-- 되돌리기: 바꾸기 직전 행을 data_fix_backup 에 JSON 으로 남긴다(fix 열 = 항목 코드).

CREATE TABLE IF NOT EXISTS data_fix_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fix TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id INTEGER,
  row_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- D2 이관 주문 부가세 표시 — 줄은 「부가세 없음(0)」인데 헤더 부가세가 공급가의 10%(±1원)인 주문
--   9,450건의 줄을 과세(1)로. 헤더 금액은 그대로(줄 합계 = 헤더 공급가).
--   ★부가세 미포함 주문(헤더 부가세 0, 456건)은 조건에서 자연히 빠진다 — 줄 0 유지.
--   9098(E1-20260709-I001): 공급가 91,000 · 부가세 9,000(일부 줄 면세로 보이나 줄 구분 불가) —
--   부가세가 있는 주문이므로 과세로 둔다(재저장 시 부가세 9,100 으로 100원 차이 — 청구 주문이라 금액 수정은 C1 로 막힌다).
-- 왜: 주문서에서 수정 저장하면 체크박스(=줄 값 0)대로 부가세가 사라진다. 청구취소 재계산과 맞물리면 미수까지 준다.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO data_fix_backup (fix, table_name, row_id, row_json)
SELECT 'D2', 'orders', o.id, json_object('vat_amount', o.vat_amount, 'total_amount', o.total_amount)
FROM orders o
WHERE o.vat_amount > 0
  AND (ABS(o.vat_amount - ROUND(o.total_amount * 0.1)) <= 1 OR (o.id = 9098 AND o.vat_amount = 9000 AND o.total_amount = 91000))
  AND NOT EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.parent_item_id IS NULL AND x.vat_included = 1)
  AND EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.parent_item_id IS NULL AND x.vat_included = 0)
  AND NOT EXISTS (SELECT 1 FROM data_fix_backup b WHERE b.fix = 'D2' AND b.row_id = o.id);

UPDATE order_items SET vat_included = 1
WHERE parent_item_id IS NULL AND vat_included = 0
  AND order_id IN (SELECT row_id FROM data_fix_backup WHERE fix = 'D2' AND table_name = 'orders');

-- ─────────────────────────────────────────────────────────────────────────────
-- D1 법인 간 이중 입금 — 「그 법인에 해당 매출이 없는 쪽」만 지운다(나머지 15쌍은 매출·입금이 두 법인에 같이 있는
--   법인간 거래라 법인별 잔액이 맞다 — 지우면 동산에 가짜 미수 약 1.1억이 생긴다).
--   · 4959 선명 30,075,000 인효: 선명이 받아 같은 날 동산으로 넘긴 돈(선명 출금 89582 → 동산 입금 89554 = 입금 4963).
--     선명 청구는 이미 다 받은 상태라 이 입금이 선명에 선수금 −30,075,000 을 만들었다. 수금은 동산 쪽 한 번으로 인정.
--   · 3880 선명 522,280 동양종합상사 · 3894 선명 330,000 케이디: 선명 이관 수금인데 선명 청구가 없고,
--     돈은 청주 통장에 들어와 청주 입금(4858·4632)으로 이미 잡혀 있다.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO data_fix_backup (fix, table_name, row_id, row_json)
SELECT 'D1', 'payments', p.id, json_object('client_id', p.client_id, 'payment_date', p.payment_date, 'amount', p.amount,
  'payment_method', p.payment_method, 'reference_number', p.reference_number, 'notes', p.notes, 'created_by', p.created_by,
  'created_at', p.created_at, 'entity_id', p.entity_id, 'tax_invoice_id', p.tax_invoice_id)
FROM payments p
WHERE ((p.id = 4959 AND p.client_id = 1867 AND p.entity_id = 2 AND p.amount = 30075000)
    OR (p.id = 3880 AND p.entity_id = 2 AND p.amount = 522280)
    OR (p.id = 3894 AND p.entity_id = 2 AND p.amount = 330000))
  AND NOT EXISTS (SELECT 1 FROM data_fix_backup b WHERE b.fix = 'D1' AND b.row_id = p.id);

INSERT INTO data_fix_backup (fix, table_name, row_id, row_json)
SELECT 'D1', 'bank_transactions', bt.id, json_object('match_status', bt.match_status, 'matched_client_id', bt.matched_client_id,
  'matched_payment_id', bt.matched_payment_id, 'match_reason', bt.match_reason)
FROM bank_transactions bt
WHERE bt.id IN (89582, 89583) AND bt.entity_id = 2 AND bt.amount = 30075000
  AND NOT EXISTS (SELECT 1 FROM data_fix_backup b WHERE b.fix = 'D1' AND b.table_name = 'bank_transactions' AND b.row_id = bt.id);

UPDATE bank_transactions
SET matched_payment_id = NULL, matched_client_id = NULL, match_status = 'IGNORED',
    match_reason = '법인간 대리수금 — 인효 9/8 입금을 동산으로 이체(출금 89582). 수금은 동산 입금 89554 로 인정 (0628)'
WHERE id = 89583 AND entity_id = 2 AND amount = 30075000 AND matched_payment_id = 4959;

UPDATE bank_transactions
SET matched_client_id = NULL, match_status = 'IGNORED',
    match_reason = '법인간 이체 — 인효 대리수금 전달(입금 89583 → 동산 89554) (0628)'
WHERE id = 89582 AND entity_id = 2 AND amount = 30075000 AND match_status IN ('SUGGESTED', 'UNMATCHED');

DELETE FROM payments WHERE id = 4959 AND client_id = 1867 AND entity_id = 2 AND amount = 30075000
  AND NOT EXISTS (SELECT 1 FROM bank_transactions WHERE matched_payment_id = 4959);
DELETE FROM payments WHERE id = 3880 AND entity_id = 2 AND amount = 522280
  AND NOT EXISTS (SELECT 1 FROM bank_transactions WHERE matched_payment_id = 3880);
DELETE FROM payments WHERE id = 3894 AND entity_id = 2 AND amount = 330000
  AND NOT EXISTS (SELECT 1 FROM bank_transactions WHERE matched_payment_id = 3894);

-- ─────────────────────────────────────────────────────────────────────────────
-- D4 법인 오귀속 입금 — 한 번 받은 돈에 두 법인 몫이 섞여 있다(예: 지오그래픽 선명 입금 444,950 = 선명 231,000 + 동산 213,950).
--   원 입금은 통장과 연결돼 있어 금액을 쪼개면 통장↔입금이 어긋난다 → 원 입금은 그대로 두고
--   「법인 대체」 한 쌍(보낸 법인 −, 받을 법인 +, reference_number = ENTITY-XFER-<원 입금 id>)으로 법인별 잔액만 옮긴다.
--   거래처 합계는 불변. 옮기는 금액 = 음수 법인의 초과분과 상대 법인 미수 중 작은 값.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, -245250, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E1 몫을 옮김', NULL, 2
FROM payments p WHERE p.id = 4958 AND p.client_id = 314 AND p.entity_id = 2 AND p.amount >= 245250
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-4958' AND x.entity_id = 2);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, 245250, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E2 에서 받은 몫', NULL, 1
FROM payments p WHERE p.id = 4958 AND p.client_id = 314 AND p.entity_id = 2 AND p.amount >= 245250
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-4958' AND x.entity_id = 1);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, -373450, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E2 몫을 옮김', NULL, 1
FROM payments p WHERE p.id = 2887 AND p.client_id = 1926 AND p.entity_id = 1 AND p.amount >= 373450
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-2887' AND x.entity_id = 1);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, 373450, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E1 에서 받은 몫', NULL, 2
FROM payments p WHERE p.id = 2887 AND p.client_id = 1926 AND p.entity_id = 1 AND p.amount >= 373450
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-2887' AND x.entity_id = 2);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, -213950, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E1 몫을 옮김', NULL, 2
FROM payments p WHERE p.id = 4585 AND p.client_id = 2239 AND p.entity_id = 2 AND p.amount >= 213950
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-4585' AND x.entity_id = 2);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, 213950, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E2 에서 받은 몫', NULL, 1
FROM payments p WHERE p.id = 4585 AND p.client_id = 2239 AND p.entity_id = 2 AND p.amount >= 213950
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-4585' AND x.entity_id = 1);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, -128700, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E2 몫을 옮김', NULL, 3
FROM payments p WHERE p.id = 4861 AND p.client_id = 2382 AND p.entity_id = 3 AND p.amount >= 128700
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-4861' AND x.entity_id = 3);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, 128700, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E3 에서 받은 몫', NULL, 2
FROM payments p WHERE p.id = 4861 AND p.client_id = 2382 AND p.entity_id = 3 AND p.amount >= 128700
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-4861' AND x.entity_id = 2);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, -3570292, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E2 몫을 옮김', NULL, 3
FROM payments p WHERE p.id = 3893 AND p.client_id = 3756 AND p.entity_id = 3 AND p.amount >= 3570292
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-3893' AND x.entity_id = 3);
INSERT INTO payments (client_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id)
SELECT p.client_id, p.payment_date, 3570292, '법인대체', 'ENTITY-XFER-' || p.id, '법인 대체(0628) — 입금 #' || p.id || ' 중 E3 에서 받은 몫', NULL, 2
FROM payments p WHERE p.id = 3893 AND p.client_id = 3756 AND p.entity_id = 3 AND p.amount >= 3570292
  AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reference_number = 'ENTITY-XFER-3893' AND x.entity_id = 2);

-- 매입: 엘이디포유 지급 #60(23,161,820, 선명 기록)은 **동산 통장**(출금 656)에서 나간 돈이다 → 법인만 동산으로.
INSERT INTO data_fix_backup (fix, table_name, row_id, row_json)
SELECT 'D4', 'purchase_payments', pp.id, json_object('entity_id', pp.entity_id)
FROM purchase_payments pp
WHERE pp.id = 60 AND pp.supplier_id = 116 AND pp.entity_id = 2 AND pp.amount = 23161820
  AND NOT EXISTS (SELECT 1 FROM data_fix_backup b WHERE b.fix = 'D4' AND b.table_name = 'purchase_payments' AND b.row_id = pp.id);
UPDATE purchase_payments SET entity_id = 1, updated_at = CURRENT_TIMESTAMP
WHERE id = 60 AND supplier_id = 116 AND entity_id = 2 AND amount = 23161820
  AND EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.matched_purchase_payment_id = 60 AND bt.entity_id = 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- D5 같은 법인 동일 입금 — 통장 입금 건수보다 입금 기록이 많은 것만 중복으로 본다.
--   19쌍 중 해당은 기타거래처 66,220(2026-04-16, 통장 1건 · 기록 2건) 하나뿐이다.
--   나머지는 통장에도 입금이 그만큼 있거나(동산플래그·육군항공사령부 등) 적요가 다른 별개 건이다.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO data_fix_backup (fix, table_name, row_id, row_json)
SELECT 'D5', 'payments', p.id, json_object('client_id', p.client_id, 'payment_date', p.payment_date, 'amount', p.amount,
  'payment_method', p.payment_method, 'notes', p.notes, 'created_at', p.created_at, 'entity_id', p.entity_id)
FROM payments p
WHERE p.id = 2012 AND p.client_id = 455 AND p.entity_id = 1 AND p.amount = 66220
  AND NOT EXISTS (SELECT 1 FROM data_fix_backup b WHERE b.fix = 'D5' AND b.row_id = p.id);
DELETE FROM payments WHERE id = 2012 AND client_id = 455 AND entity_id = 1 AND amount = 66220
  AND EXISTS (SELECT 1 FROM payments k WHERE k.id = 2001 AND k.client_id = 455 AND k.amount = 66220)
  AND NOT EXISTS (SELECT 1 FROM bank_transactions WHERE matched_payment_id = 2012);

-- ─────────────────────────────────────────────────────────────────────────────
-- D6 이관 발주 입고수량에 금액이 들어간 줄(수량 1 · 입고 6,498,500 등, 5줄 — 수리·유지보수 서비스)
--   → 입고수량 = 발주수량. 금액·미지급(발주 final_amount)은 원래 정상이다.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO data_fix_backup (fix, table_name, row_id, row_json)
SELECT 'D6', 'purchase_order_items', i.id, json_object('received_quantity', i.received_quantity, 'accepted_quantity', i.accepted_quantity)
FROM purchase_order_items i
WHERE i.quantity > 0 AND i.received_quantity > i.quantity * 10
  AND NOT EXISTS (SELECT 1 FROM data_fix_backup b WHERE b.fix = 'D6' AND b.row_id = i.id);
UPDATE purchase_order_items
SET received_quantity = quantity,
    accepted_quantity = CASE WHEN accepted_quantity > quantity * 10 THEN quantity ELSE accepted_quantity END,
    updated_at = CURRENT_TIMESTAMP
WHERE quantity > 0 AND received_quantity > quantity * 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- D7 통장 출금 연결·분류
--   · 진안알미늄(2250) 출금 5건: 지급 기록은 있는데 통장과 연결만 빠짐 → 같은 날·금액(±1,000 이체수수료) 지급에 연결.
--   · 비씨카드 정액 2,332,300: 형제 월(1~4월)은 리스료(91)인데 5월 이후 5건이 카드 매출정산 거래처로 분류됨 → 리스료로.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE bank_transactions
SET matched_purchase_payment_id = (
      SELECT pp.id FROM purchase_payments pp
      WHERE pp.supplier_id = 2250 AND replace(pp.payment_date, '-', '') = bank_transactions.transaction_date
        AND ABS(pp.amount - bank_transactions.amount) <= 1000
        AND NOT EXISTS (SELECT 1 FROM bank_transactions b2 WHERE b2.matched_purchase_payment_id = pp.id)
      ORDER BY pp.id LIMIT 1),
    matched_link_mode = 'LINKED'
WHERE matched_client_id = 2250 AND transaction_type = 'WITHDRAWAL' AND match_status = 'APPLIED'
  AND matched_purchase_payment_id IS NULL
  AND EXISTS (
      SELECT 1 FROM purchase_payments pp
      WHERE pp.supplier_id = 2250 AND replace(pp.payment_date, '-', '') = bank_transactions.transaction_date
        AND ABS(pp.amount - bank_transactions.amount) <= 1000
        AND NOT EXISTS (SELECT 1 FROM bank_transactions b2 WHERE b2.matched_purchase_payment_id = pp.id));

INSERT INTO data_fix_backup (fix, table_name, row_id, row_json)
SELECT 'D7', 'bank_transactions', bt.id, json_object('match_status', bt.match_status, 'matched_client_id', bt.matched_client_id,
  'matched_category_id', bt.matched_category_id, 'match_reason', bt.match_reason)
FROM bank_transactions bt
WHERE bt.matched_client_id = 3778 AND bt.transaction_type = 'WITHDRAWAL' AND bt.entity_id = 1 AND bt.amount = 2332300
  AND bt.matched_payment_id IS NULL AND bt.matched_purchase_payment_id IS NULL
  AND EXISTS (SELECT 1 FROM expense_categories WHERE id = 91 AND entity_id = 1)
  AND NOT EXISTS (SELECT 1 FROM data_fix_backup b WHERE b.fix = 'D7' AND b.row_id = bt.id);
UPDATE bank_transactions
SET matched_client_id = NULL, matched_category_id = 91, match_status = 'APPLIED',
    match_reason = '리스료(비씨카드 정액출금) 재분류 — 1~4월 형제 월과 같은 분류 (0628)'
WHERE matched_client_id = 3778 AND transaction_type = 'WITHDRAWAL' AND entity_id = 1 AND amount = 2332300
  AND matched_payment_id IS NULL AND matched_purchase_payment_id IS NULL
  AND EXISTS (SELECT 1 FROM expense_categories WHERE id = 91 AND entity_id = 1);
