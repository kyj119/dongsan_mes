-- 깃대 단가 역산 롤백 (2026-08-07) — 적용 전 전부 0 이었다

UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-030-R120-3';
UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-030-R130-2';
UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-030-R130-3';
UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-030-R150-2';
UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-030-R150-3';
UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-036-L40';
UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-036-L50';
UPDATE items SET avg_unit_cost = 0 WHERE item_code = 'ACC-036-L60';
