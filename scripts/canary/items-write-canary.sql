-- #430 write 카나리 (로컬 D1 전용 — prod 무오염)
-- 목적: read-only smoke(GET 101)가 구조적으로 못 잡는 write-path 스키마 회귀 탐지.
--   0335류 = items가 inline FK로 참조하는 print_media/print_methods 등 부모 테이블이 DROP되면
--   SQLite가 자식(items) INSERT/UPDATE를 "no such table"로 전면 차단(SELECT는 멀쩡해 smoke 통과로 은폐).
-- 동작: 셀프시드 카테고리(데이터 비의존) → items INSERT(여기서 회귀 시 throw) → 즉시 정리.
-- 앞단 DELETE로 재실행 멱등. INSERT가 throw하면 wrangler가 non-zero exit → 카나리 실패.
DELETE FROM items WHERE item_code='__CANARY_WRITE_430__';
DELETE FROM item_categories WHERE id=-999430;
INSERT OR IGNORE INTO item_categories (id, category_code, category_name) VALUES (-999430, '__CANARY_WRITE_430__', '__CANARY_430__');
INSERT INTO items (category_id, item_code, item_name, item_type) VALUES (-999430, '__CANARY_WRITE_430__', '__CANARY_WRITE_430__', 'MATERIAL');
DELETE FROM items WHERE item_code='__CANARY_WRITE_430__';
DELETE FROM item_categories WHERE id=-999430;
