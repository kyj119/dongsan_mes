-- 0497_cleanup_e2e_receipt.sql
-- 롤→미터 환산 검증용 E2E 입고 흔적 정리 (사용자 지시)
--
-- 2026-07-30 롤 단위 환산을 prod 실입고로 확증하면서 남은 테스트 데이터를 지운다.
--   입고 2롤 → 재고 100m → 취소 → 0m 확인 완료(전 구간 일치). 재고 순영향은 0이었지만
--   prod 첫 입고 기록이 테스트 건으로 남으면 이후 이력 조회에서 혼란을 준다.
--
-- 삭제 대상 (모두 receipt_number = 'RCV-E1-20260730-001' 에서 파생):
--   inventory_receipts       id=1  (status=CANCELLED)
--   inventory_receipt_items  id=1  (item_id=299 SPM011G-127, quantity=2롤)
--   inventory_transactions   id=2  IN  PURCHASE/1        item=299 qty=100
--   inventory_transactions   id=3  OUT RECEIPT_CANCEL/1  item=299 qty=100
--
-- ⚠️ 보존 대상 — 실수로 지우지 않도록 조건을 좁게 잡았다:
--   inventory_transactions id=1 (item_id=269 · ADJUSTMENT) = 기존 실데이터
--   inventory 행 (item_id=299, quantity=0) = 사용자 지시로 유지.
--     재고 관리를 시작하면 어차피 필요한 행이고 수량이 0이라 무해하다.
--
-- 삭제 순서 = 자식(receipt_items) → 부모(receipts). transactions 는 reference_id 로
--   느슨하게 연결돼 있어 순서 무관하나 receipt 보다 먼저 지운다.
--
-- 성격: 일회성 데이터 정리. 조건이 receipt_number 유도라 **다른 환경에서는 0행**(무해·멱등).

DELETE FROM inventory_transactions
 WHERE reference_type IN ('PURCHASE', 'RECEIPT_CANCEL')
   AND reference_id IN (SELECT id FROM inventory_receipts WHERE receipt_number = 'RCV-E1-20260730-001')
   AND item_id = 299;

DELETE FROM inventory_receipt_items
 WHERE receipt_id IN (SELECT id FROM inventory_receipts WHERE receipt_number = 'RCV-E1-20260730-001');

DELETE FROM inventory_receipts
 WHERE receipt_number = 'RCV-E1-20260730-001';
