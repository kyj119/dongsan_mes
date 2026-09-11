-- #646: 입고 라인이 받은 롤(팩) 수를 건별로 스냅샷한다.
--   0610~0612 롤 단위 발주에서 purchase_order_items.received_packs 는 입고 때 += 로만 쌓이고,
--   전량취소 롤백(inventory.ts inspection-decision CANCELLED)이 received_quantity 등은 역산하면서
--   received_packs 는 안 건드려, 부분입고 후 취소 시 검수 대기 큐(PO_REVIEW_PENDING_SQL)가 조용히 놓쳤다.
--   되돌리려면 "이 입고 건이 몇 롤이었나"를 알아야 하는데 그 기록이 없었다 → 여기에 스냅샷한다.
--   (마이그 이전 옛 입고 행은 0/NULL 이라 취소해도 0 차감 = no-op. 신규 입고부터 정확.)
ALTER TABLE inventory_receipt_items ADD COLUMN received_packs REAL DEFAULT 0;
