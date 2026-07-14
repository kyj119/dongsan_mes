-- 0462: cards.category_name(card_group 라벨) → 부문 매핑 추가 (자재비 소진 귀속용)
-- cards는 item category(수성/솔벤/UV…)가 아니라 card_group 라벨(출력 / 전사·태극기 / 간판)을 저장한다.
-- 자재 소진이력(inventory_auto_deductions.card_id → cards.category_name)을 부문에 귀속하려면 이 값도 매핑 필요.
-- ('간판'은 0459에서 이미 매핑 → INSERT OR IGNORE로 중복 무시)
INSERT OR IGNORE INTO department_category_map (category, department_id) VALUES
  ('출력', 1),
  ('전사/태극기', 2),
  ('간판', 3);
