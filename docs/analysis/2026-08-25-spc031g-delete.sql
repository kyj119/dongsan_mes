-- 투명시트 SPC031G 미취급 폭 하드삭제 (2026-08-25, 용준님 확정 「105·152만」)
--
-- 대상: id 420 = SPC031G-105(105cm) · id 423 = SPC031G-152(152cm)
-- 근거: 전수 참조 스캔 결과 order_items·purchase_order_items·bom_items·product_materials·
--       inventory_transactions·quotation_items·stock_alerts 등 25개 테이블 전부 0.
--       걸린 것은 inventory 2행(수량 0)과 inventory_count_items 22행(실사표 라인)뿐.
-- ⛔ SPC031G-127 은 주문 11·매입 6·재고 50 이 있어 제외. SPC031G-137 은 재고 100 이라 보류.
--
-- 롤백:
--   INSERT INTO items SELECT * FROM _bak_0825_spc_items;
--   INSERT INTO inventory SELECT * FROM _bak_0825_spc_inv;
--   INSERT INTO inventory_count_items SELECT * FROM _bak_0825_spc_ici;
--
-- ⚠️ wrangler --file 은 성공해도 「Not currently importing anything」 오류를 뱉을 수 있다.
--    재실행 전에 반드시 결과를 조회할 것(그대로 재실행하면 백업 테이블이 이미 있어 무해하지만
--    삭제는 멱등이므로 문제 없음).

CREATE TABLE IF NOT EXISTS _bak_0825_spc_items AS SELECT * FROM items WHERE id IN (420, 423);
CREATE TABLE IF NOT EXISTS _bak_0825_spc_inv   AS SELECT * FROM inventory WHERE item_id IN (420, 423);
CREATE TABLE IF NOT EXISTS _bak_0825_spc_ici   AS SELECT * FROM inventory_count_items WHERE item_id IN (420, 423);

DELETE FROM inventory_count_items WHERE item_id IN (420, 423);
DELETE FROM inventory             WHERE item_id IN (420, 423);
DELETE FROM items                 WHERE id      IN (420, 423);
