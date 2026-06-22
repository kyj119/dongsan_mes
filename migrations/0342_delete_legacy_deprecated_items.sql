-- 0342: 재개편 전 legacy 비활성 품목 완전삭제 (폐지 분류: 배너·시트·판재출력·출력물 등)
--
-- 신모델 8분류(수성·UV·솔벤·전사·태극기·간판·상품·원자재) 외 폐지 분류에 남은 비활성 legacy 제품.
-- category_id IN (6 부속품, 8 현수막, 9 배너, 11 시트·스티커, 12 판재출력, 13 출력물) 중 is_active=0.
-- (8 현수막은 0341에서, 6 부속품은 잔여 0). 배너13·시트11·판재25·출력물4 = 53건.
-- inbound FK 20개 테이블(order_items·quotation_items·inventory·bom_items·product_materials·purchase_*·
-- waste_records·size_grade_prices 등) 전수 점검 결과 참조 0건 → 안전 완전삭제. is_active=0 가드로 활성 품목 보호.
DELETE FROM items WHERE category_id IN (6, 8, 9, 11, 12, 13) AND is_active = 0;
