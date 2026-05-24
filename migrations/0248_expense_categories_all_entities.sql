-- #184: 모든 활성 법인에 기본 경비분류 백필 (entity_id=1의 분류를 복사)
INSERT OR IGNORE INTO expense_categories (name, icon, color, sort_order, entity_id)
SELECT ec.name, ec.icon, ec.color, ec.sort_order, e.id
FROM expense_categories ec
CROSS JOIN entities e
WHERE ec.entity_id = 1
  AND e.is_active = 1
  AND e.id != 1
  AND NOT EXISTS (
    SELECT 1 FROM expense_categories ec2
    WHERE ec2.name = ec.name AND ec2.entity_id = e.id
  );
