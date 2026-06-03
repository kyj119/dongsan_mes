-- 거래처 배송방식: enum → 한글 배송사명 세분화 (2026-06-03)
-- SAME(소재지 동일)·PICKUP → 방문수령, FREIGHT → 대신화물, DIRECT → 직배
-- 이후 한진택배 등 개별 거래처는 수동 수정
UPDATE clients SET delivery_method = '대신화물' WHERE delivery_method = 'FREIGHT';
UPDATE clients SET delivery_method = '직배'     WHERE delivery_method = 'DIRECT';
UPDATE clients SET delivery_method = '방문수령' WHERE delivery_method IN ('SAME', 'PICKUP');
