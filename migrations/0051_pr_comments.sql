-- ============================================================================
-- Migration 0051: PR 댓글/답변 테이블 생성
-- ============================================================================

CREATE TABLE IF NOT EXISTS pr_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pr_comments_request ON pr_comments(request_id);
