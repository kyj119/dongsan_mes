-- ============================================================================
-- Migration 0254: order_ai_files 테이블 (AI 파일 1:N 지원)
-- 한 주문에 여러 AI 파일 연결 가능
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_ai_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  analysis_id INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (analysis_id) REFERENCES ai_analysis_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_order_ai_files_order ON order_ai_files(order_id);

-- order_items에 ai_file_id 추가 (어떤 AI 파일의 어떤 그룹인지 매핑)
ALTER TABLE order_items ADD COLUMN ai_file_id INTEGER REFERENCES order_ai_files(id);
