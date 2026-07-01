-- 0430_cpp_coating_goods_cleanup.sql
-- 사용자 확정: CPP 코팅지는 상품용도(생산 미사용). 조광/화진 상품으로 일원화.
-- 생산 참조(product_materials) 0 확인 → 안전.
--  · CPP-E4 = 조광 JG-E4(E4 엠보무광 200g) 중복 → 비활성화
--  · CPP-C4 = 조광 JG-C4(C4 엠보UV무광 200g) 중복 → 비활성화
--  · CPP-UV(UV무광 200g, 조광/화진 대응품 없음·고유) → 원자재 오분류 정정: 상품(GOODS)

UPDATE items SET is_active=0, updated_at=datetime('now')
WHERE item_code IN ('CPP-E4','CPP-C4');

UPDATE items SET category='상품', category_id=4, item_type='GOODS',
  is_sales_item=1, is_purchase_item=1, updated_at=datetime('now')
WHERE item_code='CPP-UV';
