-- 청주 거래처 11개 → 동산기획 청주(entity3) 이동 (재현시스템 3756=원단/청주 동일BRN 제외)
UPDATE order_billing_groups SET entity_id=3 WHERE order_id IN (SELECT id FROM orders WHERE entity_id=2 AND client_id IN (1986,2139,2300,2382,3762,3764,3768,3770,3771,3774,3775) AND notes LIKE '선명 이관%');
UPDATE orders SET entity_id=3 WHERE entity_id=2 AND client_id IN (1986,2139,2300,2382,3762,3764,3768,3770,3771,3774,3775) AND notes LIKE '선명 이관%';
UPDATE payments SET entity_id=3 WHERE entity_id=2 AND client_id IN (1986,2139,2300,2382,3762,3764,3768,3770,3771,3774,3775);
UPDATE adjustments SET entity_id=3 WHERE entity_id=2 AND client_id IN (1986,2139,2300,2382,3762,3764,3768,3770,3771,3774,3775);
