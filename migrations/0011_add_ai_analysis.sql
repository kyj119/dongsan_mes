-- AI 파일 분석 요청 테이블
CREATE TABLE IF NOT EXISTS ai_analysis_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/processing/done/error
  groups_json TEXT,    -- JSON: [{index,name,thumbnail_base64,width_mm,height_mm}]
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- orders 테이블에 AI 파일 관련 컬럼 추가
ALTER TABLE orders ADD COLUMN ai_file_path TEXT;
ALTER TABLE orders ADD COLUMN ai_analysis_id INTEGER;

-- order_items 테이블에 그룹 인덱스 컬럼 추가
ALTER TABLE order_items ADD COLUMN ai_group_index INTEGER DEFAULT NULL;
