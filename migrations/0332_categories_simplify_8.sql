-- 0332: 품목 분류 8개로 단순화 (용준님 결정 2026-06-21)
-- 수성·UV·솔벤·전사 = 인쇄방식별 개별 제품(솔벤 현수막 등), 태극기·간판 = 제품군, 상품·원자재 = 타입.
-- 비파괴: 미사용 분류는 삭제 아닌 is_active=0 (기존 staged 품목 category_id FK 보존). 기타=fallback 유지.

-- 수성 신규
INSERT OR IGNORE INTO item_categories (category_code, category_name, sort_order, is_active)
VALUES ('AQUEOUS', '수성', 1, 1);

-- 8개 활성 + 정렬
UPDATE item_categories SET category_name='수성',   sort_order=1, is_active=1 WHERE category_code='AQUEOUS';
UPDATE item_categories SET category_name='UV',     sort_order=2, is_active=1 WHERE category_code='UV';
UPDATE item_categories SET category_name='솔벤',   sort_order=3, is_active=1 WHERE category_code='SOLVENT';
UPDATE item_categories SET category_name='전사',   sort_order=4, is_active=1 WHERE category_code='TRANSFER';
UPDATE item_categories SET category_name='태극기', sort_order=5, is_active=1 WHERE category_code='FLAG';
UPDATE item_categories SET category_name='간판',   sort_order=6, is_active=1 WHERE category_code='SIGN';
UPDATE item_categories SET category_name='상품',   sort_order=7, is_active=1 WHERE category_code='GOODS';
UPDATE item_categories SET category_name='원자재', sort_order=8, is_active=1 WHERE category_code='MATERIAL';

-- 기타 = 생성 fallback 안전망(숨김 정렬 뒤)
UPDATE item_categories SET sort_order=99, is_active=1 WHERE category_code='ETC';

-- 8 외 비활성 (현수막·배너·스티커·시트·현판·판재출력·출력물·부속품 → 인쇄방식 분류로 흡수)
UPDATE item_categories SET is_active=0
WHERE category_code IN ('BANNER','X_BANNER','STICKER','SHEET','PLAQUE','PANEL','PRINTOUT','ACCESSORY');
