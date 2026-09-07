-- 0577: 계정 마스터 결번 3건 보충 (세금·법인1 / 지급수수료·법인1 / 공과금·법인3)
--
-- 계정 마스터는 38종 중 21종이 어느 한 법인에 없다. 그 탓에 실제 지출을 못 붙이는 일이 생겼다:
--   · 과태료 6건이 법인1 인데 법인1 에 `세금` 이 없다(법인2 전용 #82)
--   · 특허 연차등록료 5건이 법인1 인데 `지급수수료` 가 없다(법인2 전용 #85)
--   · 수도·전기 2건이 법인3 인데 `공과금` 이 없다(법인1 #64 · 법인2 #84 만)
-- 여기서는 **실제로 막힌 3종만** 채운다. 나머지 18종 정렬은 업무 판단이 필요해 남긴다.
--
-- ★이름을 다른 법인과 **똑같이** 쓴다 — `CAT_ROLE` 이 계정명 문자열로 역할을 가르므로
--   이름이 달라지면 같은 성격이 법인마다 다른 역할로 집계된다. 셋 다 NOT_EXPENSE 가 아니라
--   판관비(SGA)로 잡히는 게 맞다(과태료=세금과공과 · 연차등록료=지급수수료 · 수도전기=공과금).
--
-- 멱등: 같은 이름·법인이 있으면 INSERT 안 함.

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '세금', 'fa-file-invoice-dollar', '#6b7280', 820, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '세금' AND entity_id = 1);

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '지급수수료', 'fa-hand-holding-dollar', '#6b7280', 850, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '지급수수료' AND entity_id = 1);

INSERT INTO expense_categories (name, icon, color, sort_order, is_active, entity_id)
SELECT '공과금', 'fa-bolt', '#6b7280', 640, 1, 3
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = '공과금' AND entity_id = 3);
