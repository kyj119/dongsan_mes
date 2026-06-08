-- 0301_drop_inventory_items.sql
-- #364: inventory_items = origin 레거시 빈 테이블. 현행 재고는 inventory(0010)에서 관리.
--   0134_fix_inventory_fks_to_items.sql에서 자식 4테이블(receipt_items/transactions/release_items/adjustments)의
--   item_id FK를 inventory_items → items로 전부 재지정 완료. 이후 src 참조·INSERT 0건(grep 확인).
--   잔존 시 "재고 품목 테이블"로 오인되어 향후 SELECT/INSERT split-brain 위험 → 위생 차원 drop.
-- ⚠️ prod 적용 전 SELECT COUNT(*) FROM inventory_items 로 0행 재확인 권장(레거시라 0 예상).

DROP TABLE IF EXISTS inventory_items;
