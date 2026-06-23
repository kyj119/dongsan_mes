-- 0360: 전사 가로등배너 — 폰지/매쉬 × 60×180/60×150 = 4 규격변종 제품 (FIXED, 태극기 호수변종 방식)
-- 가로등배너=전사 직접출력 출력물 단독. 표준규격 2종을 spec에 고정(태극기 호수처럼). 단가 보류(0).
-- 배너대 등 부속품은 주문 추가 라인으로 작성(제품 미포함). 폰지/매쉬 원단은 깃발과 공유(0353).
-- 출력폭 60cm → autoDeduct 폭매칭: 폰지 85cm(PONGE-085)/매쉬 127cm(MESH-127) 자동선택. 자체출력→매입X.
INSERT INTO items (item_code, item_name, item_type, category, category_id, unit, base_price, sales_price, pricing_method, is_active, is_sales_item, is_purchase_item, production_required, item_group, specification) VALUES
 ('TRB-PO-180','전사 가로등배너 폰지 60×180','PRODUCT','전사',1,'EA',0,0,'FIXED',1,1,0,1,'가로등배너','폰지 60×180'),
 ('TRB-PO-150','전사 가로등배너 폰지 60×150','PRODUCT','전사',1,'EA',0,0,'FIXED',1,1,0,1,'가로등배너','폰지 60×150'),
 ('TRB-ME-180','전사 가로등배너 매쉬 60×180','PRODUCT','전사',1,'EA',0,0,'FIXED',1,1,0,1,'가로등배너','매쉬 60×180'),
 ('TRB-ME-150','전사 가로등배너 매쉬 60×150','PRODUCT','전사',1,'EA',0,0,'FIXED',1,1,0,1,'가로등배너','매쉬 60×150');

-- 연결: 폰지 변종→폰지 전폭 / 매쉬 변종→매쉬 전폭 (폭매칭은 autoDeduct가 출력폭 이상 최소폭 선택)
INSERT INTO product_materials (product_item_id, material_item_id, is_default)
SELECT p.id, m.id, 0
FROM items p JOIN items m ON (
     (p.item_code IN ('TRB-PO-180','TRB-PO-150') AND m.item_group='폰지')
  OR (p.item_code IN ('TRB-ME-180','TRB-ME-150') AND m.item_group='매쉬') )
WHERE p.item_code LIKE 'TRB-%';
