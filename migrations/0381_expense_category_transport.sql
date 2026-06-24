-- 0381: 경비 분류 '운반비' 추가 (택배·화물·배송비 — 차량유지비와 별개)
-- 분류가 존재하는 각 entity에 1건씩, 멱등.

INSERT INTO expense_categories (name, icon, color, sort_order, entity_id)
SELECT DISTINCT '운반비', 'fa-truck', '#0891b2', 5, entity_id
FROM expense_categories
WHERE entity_id NOT IN (SELECT entity_id FROM expense_categories WHERE name = '운반비');
