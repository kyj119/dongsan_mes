-- E2E 테스트 전용 entity + user
-- entity_id=99로 격리, entityFilter로 운영 데이터와 자연 분리

INSERT OR IGNORE INTO entities (id, name, short_name, business_reg_no, representative, address, phone, is_active, sort_order)
VALUES (99, 'E2E 테스트', 'E2E', '000-00-00000', 'E2E Bot', 'E2E Test Address', '000-0000-0000', 1, 999);

INSERT OR IGNORE INTO users (username, password_hash, name, role, email, is_active, default_entity_id)
VALUES ('e2e_tester', 'password', 'E2E Tester', 'ADMIN', 'e2e@test.local', 1, 99);
