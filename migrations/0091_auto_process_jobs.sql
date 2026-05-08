-- Migration 0091: 자동가공 작업 큐 테이블
-- 주문 등록 시 자동가공 작업을 생성하고, IllustratorAutomat이 폴링하여 처리

CREATE TABLE IF NOT EXISTS auto_process_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  ai_analysis_id INTEGER,
  ai_group_index INTEGER,

  -- 입력 파라미터
  source_path TEXT,
  product TEXT,
  width_cm REAL,
  height_cm REAL,
  finishing TEXT,
  scale_factor INTEGER DEFAULT 1,
  clip_bounds TEXT,
  margins TEXT,

  -- 실행 상태
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','done','approved','failed')),
  ia_params TEXT,

  -- 가공 결과
  output_eps_path TEXT,
  output_png_path TEXT,
  output_png_base64 TEXT,
  error_message TEXT,

  -- 공유폴더 저장
  saved_path TEXT,

  -- 메타
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  approved_at DATETIME,
  approved_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auto_process_jobs_status ON auto_process_jobs(status);
CREATE INDEX IF NOT EXISTS idx_auto_process_jobs_order ON auto_process_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_auto_process_jobs_order_item ON auto_process_jobs(order_item_id);
