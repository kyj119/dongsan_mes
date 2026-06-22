-- 0343: 고아·폐기 데이터 일괄 정리 (전부 정리, 변종 테이블 구조는 유지)
--
-- 감사: PRAGMA foreign_key_check 고아행 0. 아래는 논리적 폐기/테스트/휴면 데이터.
-- 모든 대상의 inbound FK 참조 0건 전수 확인 완료. 자식→부모 토폴로지 순서로 삭제(단일 트랜잭션).
--
-- (1) E99 테스트 운영데이터: 실주문 0건(전부 테스트법인 E99), 리셋/e2e 잔재.
-- (2) staged 변종품목 65건: 태극기 호수변종·간판(비활성). 로드맵 "staged123 정리" — 태극기/간판은 신모델로 재등록.
-- (3) 휴면 변종 데이터: spec_groups/spec_group_values 행 삭제(테이블 구조는 보존 — 메모리 "스키마는 남김").
-- (4) 빈 폐지 분류행 6개(현수막·배너·시트·판재출력·출력물·부속품): 품목·subcategory 0.

-- ===== (1) E99 테스트 운영데이터 =====
-- print_events + 그 자식
DELETE FROM inventory_auto_deductions;
DELETE FROM print_events;
-- cards 자식
DELETE FROM work_records WHERE card_id IN (SELECT id FROM cards);
DELETE FROM card_status_history WHERE card_id IN (SELECT id FROM cards);
DELETE FROM card_items WHERE card_id IN (SELECT id FROM cards);
DELETE FROM shipment_items WHERE card_id IN (SELECT id FROM cards);
DELETE FROM waste_records WHERE card_id IN (SELECT id FROM cards);
DELETE FROM tasks WHERE card_id IN (SELECT id FROM cards) OR order_id IN (SELECT id FROM orders);
-- orders 자식
DELETE FROM tax_invoice_orders WHERE order_id IN (SELECT id FROM orders);
DELETE FROM tax_invoices WHERE order_id IN (SELECT id FROM orders);
DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders);
DELETE FROM adjustments WHERE order_id IN (SELECT id FROM orders);
DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders);
DELETE FROM mrp_runs WHERE order_id IN (SELECT id FROM orders);
DELETE FROM portal_reorder_requests WHERE reference_order_id IN (SELECT id FROM orders);
DELETE FROM cash_receipts WHERE order_id IN (SELECT id FROM orders);
DELETE FROM credit_overrides WHERE order_id IN (SELECT id FROM orders);
DELETE FROM customer_claims WHERE order_id IN (SELECT id FROM orders) OR rework_order_id IN (SELECT id FROM orders);
DELETE FROM returns WHERE order_id IN (SELECT id FROM orders);
DELETE FROM order_ai_files WHERE order_id IN (SELECT id FROM orders);
DELETE FROM order_billing_groups WHERE order_id IN (SELECT id FROM orders);
-- cards는 order_items를 참조하므로 order_items보다 먼저
DELETE FROM cards;
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders);
DELETE FROM orders;
-- quotations (orders.quotation_id 참조 → orders 삭제 후)
DELETE FROM quotation_items;
DELETE FROM quotations;

-- ===== (2) staged 변종 품목 (태극기/간판, 비활성) =====
DELETE FROM items WHERE is_active = 0;

-- ===== (3) 휴면 변종 데이터 (테이블 구조 유지) =====
DELETE FROM spec_group_values;
DELETE FROM spec_groups;

-- ===== (4) 빈 폐지 분류행 =====
DELETE FROM item_categories WHERE id IN (6, 8, 9, 11, 12, 13);
