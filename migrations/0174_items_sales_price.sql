-- 원자재/상품 매출단가 컬럼 추가
ALTER TABLE items ADD COLUMN sales_price REAL DEFAULT 0;
