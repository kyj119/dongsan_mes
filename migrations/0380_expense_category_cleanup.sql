-- 0380: 카드 경비 분류 정비
-- ① 광고선전비·수선비·도서인쇄비 비활성화 (드롭다운에서 제거).
--    기존에 이 분류로 지정된 거래의 category_id는 유지 — JOIN 표시는 그대로, 신규 선택만 차단.
-- ② '원재료비' 신규 추가 (회사용 자재/원단 카드 구매) — 분류가 존재하는 각 entity에 1건씩, 멱등.

UPDATE expense_categories SET is_active = 0
WHERE name IN ('광고선전비', '수선비', '도서인쇄비');

INSERT INTO expense_categories (name, icon, color, sort_order, entity_id)
SELECT DISTINCT '원재료비', 'fa-cubes', '#0d9488', 5, entity_id
FROM expense_categories
WHERE entity_id NOT IN (SELECT entity_id FROM expense_categories WHERE name = '원재료비');
