-- Insert users (비밀번호: password, 평문 저장 → 첫 로그인 시 PBKDF2 해시로 자동 업그레이드)
INSERT OR IGNORE INTO users (username, password_hash, name, email, role, is_active) VALUES
('admin', 'password', '관리자', 'admin@example.com', 'ADMIN', 1),
('manager', 'password', '매니저', 'manager@example.com', 'MANAGER', 1),
('operator', 'password', '작업자', 'operator@example.com', 'OPERATOR', 1);
