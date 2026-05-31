-- #301: 재직증명서 발급 로그 테이블 (당일 번호 중복 발급 방지)
-- 기존: 테이블 부재로 INSERT가 silent fail → COUNT 항상 0 → 모든 증명서가 -001
CREATE TABLE IF NOT EXISTS certificate_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  certificate_number TEXT NOT NULL,
  certificate_type TEXT NOT NULL DEFAULT 'EMPLOYMENT',
  purpose TEXT,
  issue_date TEXT NOT NULL,
  entity_id INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- 법인별 번호 독립 (법인 간 동일 번호 허용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_logs_entity_number ON certificate_logs(entity_id, certificate_number);
CREATE INDEX IF NOT EXISTS idx_cert_logs_entity_date ON certificate_logs(entity_id, issue_date);
