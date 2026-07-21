-- 선명 잔여 미매칭 4건 반영 (2026-07-21 신규 동기화분)
-- #5042 운산직물 매입지급 20M → purchase_payment 생성·연결 + 미지급 차감
UPDATE bank_transactions SET match_status='APPLIED', matched_client_id=1733, matched_link_mode='CREATED', matched_by=9, matched_at=CURRENT_TIMESTAMP, match_confidence=1.0, match_reason='매입지급 통장연결' WHERE id=5042 AND match_status='UNMATCHED';
INSERT INTO purchase_payments (supplier_id, payment_date, amount, payment_method, reference_number, notes, created_by, entity_id) VALUES (1733, '2026-07-21', 20000000, '계좌이체', '5042', '[은행연동] 운산직물5월외상대', 9, 2);
UPDATE clients SET purchase_balance = COALESCE(purchase_balance,0) - 20000000, updated_at=CURRENT_TIMESTAMP WHERE id=1733;
UPDATE bank_transactions SET matched_purchase_payment_id=(SELECT id FROM purchase_payments WHERE reference_number='5042' AND entity_id=2 AND supplier_id=1733 ORDER BY id DESC LIMIT 1) WHERE id=5042;
-- #5043, #5044 김용준 가수금 입금 → IGNORED
UPDATE bank_transactions SET match_status='IGNORED', matched_by=9, matched_at=CURRENT_TIMESTAMP, match_reason='대표 가수금 입금' WHERE id=5043 AND match_status='UNMATCHED';
UPDATE bank_transactions SET match_status='IGNORED', matched_by=9, matched_at=CURRENT_TIMESTAMP, match_reason='대표 가수금 입금' WHERE id=5044 AND match_status='UNMATCHED';
-- #3418 CNCITY전기 → 전기료(공과금) 비용분류
UPDATE bank_transactions SET match_status='APPLIED', matched_category_id=58, matched_client_id=NULL, matched_by=9, matched_at=CURRENT_TIMESTAMP, match_confidence=1.0, match_reason='전기료(공과금)' WHERE id=3418 AND match_status='UNMATCHED';
