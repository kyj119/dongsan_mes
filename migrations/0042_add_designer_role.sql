-- ============================================================================
-- Migration 0042: DESIGNER 시드 계정 추가
-- (CHECK 제약은 0001에서 이미 포함)
-- ============================================================================

INSERT OR IGNORE INTO users (id, username, password_hash, name, email, role, is_active)
VALUES (4, 'designer', 'password', '디자이너', 'designer@example.com', 'DESIGNER', 1);
